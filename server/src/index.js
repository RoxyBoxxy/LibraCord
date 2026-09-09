import dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../.env") });

import { createServer } from "node:http";
import { Server } from "socket.io";
import { createApp } from "./app.js";
import {
  channelExists, createDirectMessage, createMessage, editMessage, deleteMessage, findMessage, findChannel,
  getSystemUser, getInstanceSettings, listCommunities, userCanAccessChannel, userCanConnectToChannel, userCanSendToChannel,
} from "./db.js";
import { getUser } from "./auth.js";
import { deliverFederationOutbox, federationDomain, federationEvents, publishCommunitySnapshot } from "./federation.js";
import { moderationEvents } from "./moderation-events.js";

const port = Number(process.env.PORT || 3002);
// Voice media sessions are ephemeral; this process is the authoritative clock.
const voiceMediaSessions = new Map();
const messageReactions = new Map();
const allowedOrigins = String(process.env.CLIENT_ORIGIN || "http://localhost:5173")
  .split(",").map((value) => value.trim()).filter(Boolean);
const allowAnyClientOrigin = allowedOrigins.includes("*");
const server = createServer(createApp());
const io = new Server(server, {
  cors: {
    origin: true,
    credentials: true,
  },
  transports: ["websocket", "polling"],
  allowRequest(request, done) {
    const origin = request.headers.origin;
    if (!origin) return done(null, true);
    try {
      const originUrl = new URL(origin);
      const forwardedHost = String(request.headers["x-forwarded-host"] || "").split(",")[0].trim();
      const requestHost = forwardedHost || request.headers.host;
      const explicitlyAllowed = allowedOrigins.some((value) => {
        try { return new URL(value).origin === originUrl.origin; } catch { return false; }
      });
      return done(null, allowAnyClientOrigin || explicitlyAllowed || originUrl.host === requestHost);
    } catch {
      return done(null, false);
    }
  },
});

function refreshNotificationRooms(socket) {
  for (const room of socket.rooms)
    if (room.startsWith("channel-notify:")) socket.leave(room);
  for (const community of listCommunities(socket.user.id))
    for (const channel of community.channels || [])
      if (channel.kind === "text" && userCanAccessChannel(channel.id, socket.user.id))
        socket.join(`channel-notify:${channel.id}`);
}

function refreshAllNotificationRooms() {
  for (const client of io.sockets.sockets.values()) refreshNotificationRooms(client);
}

io.use((socket, next) => {
  const user = getUser(socket.request);
  if (!user) return next(new Error("Authentication required"));
  socket.user = user;
  next();
});

io.on("connection", (socket) => {
  socket.join(`user:${socket.user.id}`);
  if (["owner", "admin"].includes(socket.user.role)) socket.join("instance-moderators");
  refreshNotificationRooms(socket);

  socket.on("profile:updated", () => io.emit("profile:updated", { userId: socket.user.id }));
  socket.on("subscriptions:refresh", () => refreshNotificationRooms(socket));
  socket.on("channel:join", (id) => {
    if (channelExists(id, "text") && userCanAccessChannel(id, socket.user.id))
      socket.join(`channel:${id}`);
  });
  socket.on("channel:leave", (id) => socket.leave(`channel:${id}`));
  socket.on("typing:start", (id) => {
    if (channelExists(id, "text") && userCanSendToChannel(id, socket.user.id))
      socket.to(`channel:${id}`).emit("typing:update", {
        channelId: id, userId: socket.user.id, name: socket.user.display_name, typing: true,
      });
  });
  socket.on("typing:stop", (id) => socket.to(`channel:${id}`).emit("typing:update", {
    channelId: id, userId: socket.user.id, typing: false,
  }));
  socket.on("message:reaction", (input, ack = () => {}) => {
    const channelId = String(input?.channelId || ""), messageId = String(input?.messageId || ""), emoji = String(input?.emoji || "").slice(0, 64);
    if (!channelExists(channelId, "text") || !userCanAccessChannel(channelId, socket.user.id) || !messageId || !emoji) return ack({ ok: false, error: "Invalid reaction" });
    const key = `${channelId}:${messageId}`;
    const current = messageReactions.get(key) || [];
    const next = current.includes(emoji) ? current.filter((item) => item !== emoji) : [...current, emoji].slice(-50);
    messageReactions.set(key, next);
    io.to(`channel:${channelId}`).emit("message:reactions", { channelId, messageId, reactions: next });
    ack({ ok: true, reactions: next });
  });
  socket.on("emoji:changed", ({ communityId } = {}) => io.emit("emoji:changed", { communityId: String(communityId || "") }));
  socket.on("voice:changed", (id) => {
    const channel = findChannel(String(id || ""));
    if (channel?.kind === "voice" && userCanConnectToChannel(channel.id, socket.user.id))
      io.emit("voice:presence-changed", channel.community_id);
  });
  socket.on("voice-chat:join", (id) => {
    const channelId = String(id || "");
    if (channelExists(channelId, "voice") && userCanConnectToChannel(channelId, socket.user.id)) {
      socket.join(`voice-chat:${channelId}`);
      const media = voiceMediaSessions.get(channelId);
      if (media) socket.emit("voice:media:state", media);
    }
  });
  socket.on("voice-chat:leave", (id) => socket.leave(`voice-chat:${String(id || "")}`));
  socket.on("voice:message:create", (input, ack = () => {}) => {
    const channelId = String(input?.channelId || "");
    const body = String(input?.body || "").trim().slice(0, 4000);
    const attachments = Array.isArray(input?.attachments) ? input.attachments.slice(0, 8) : [];
    if (!channelExists(channelId, "voice") || !userCanConnectToChannel(channelId, socket.user.id) || (!body && !attachments.length))
      return ack({ ok: false, error: "Invalid voice channel message" });
    const message = createMessage({ channelId, authorId: socket.user.id, authorName: socket.user.display_name, body, attachments });
    io.to(`voice-chat:${channelId}`).emit("voice:message:created", message);
    ack({ ok: true, message });
  });
  socket.on("voice:media:update", (input, ack = () => {}) => {
    const channelId = String(input?.channelId || "");
    if (!channelExists(channelId, "voice") || !userCanConnectToChannel(channelId, socket.user.id))
      return ack({ ok: false, error: "Voice channel access required" });
    const previous = voiceMediaSessions.get(channelId) || { sourceUrl: "", kind: "none", title: "", playing: false, position: 0, updatedAt: Date.now(), revision: 0 };
    const action = String(input?.action || "");
    const now = Date.now();
    const currentPosition = previous.playing ? previous.position + Math.max(0, (now - previous.updatedAt) / 1000) : previous.position;
    const state = { ...previous, position: currentPosition, updatedAt: now, revision: previous.revision + 1,
      updatedBy: socket.user.id, updatedByName: socket.user.display_name };
    if (action === "load") {
      const sourceUrl = String(input?.sourceUrl || "").trim().slice(0, 2048);
      if (!sourceUrl || (!/^https?:\/\//i.test(sourceUrl) && !sourceUrl.startsWith("/api/v1/assets/")))
        return ack({ ok: false, error: "Use a YouTube, SoundCloud, or server media URL" });
      state.sourceUrl = sourceUrl;
      state.kind = ["youtube", "soundcloud", "video", "audio"].includes(input?.kind) ? input.kind : "video";
      state.title = String(input?.title || "Shared media").trim().slice(0, 160);
      state.position = 0;
      state.playing = false;
    } else if (["play", "pause", "seek"].includes(action)) {
      state.position = Math.max(0, Math.min(86_400, Number(input?.position ?? currentPosition) || 0));
      state.playing = action === "play" ? true : action === "pause" ? false : previous.playing;
    } else if (action === "close") {
      voiceMediaSessions.delete(channelId);
      io.to(`voice-chat:${channelId}`).emit("voice:media:state", null);
      return ack({ ok: true });
    } else return ack({ ok: false, error: "Unsupported media action" });
    voiceMediaSessions.set(channelId, state);
    io.to(`voice-chat:${channelId}`).emit("voice:media:state", state);
    ack({ ok: true, state });
  });
  socket.on("message:create", (input, ack = () => {}) => {
    const channelId = String(input?.channelId || "");
    const body = String(input?.body || "").trim().slice(0, 4000);
    const attachments = Array.isArray(input?.attachments) ? input.attachments.slice(0, 8) : [];
    const contentWarning = String(input?.contentWarning || "").trim().slice(0, 120);
    const replyTo = input?.replyTo ? Number(input.replyTo) : null;
    if (!channelExists(channelId, "text") || !userCanSendToChannel(channelId, socket.user.id) || (!body && !attachments.length))
      return ack({ ok: false, error: "Invalid message" });
    const message = createMessage({ channelId, authorId: socket.user.id, authorName: socket.user.display_name, body, attachments, contentWarning, replyTo });
    io.to(`channel-notify:${channelId}`).emit("message:created", message);
    ack({ ok: true });
  });
  socket.on("message:edit", (input, ack = () => {}) => {
    const messageId = Number(input?.messageId), body = String(input?.body || "").trim().slice(0, 4000);
    if (!messageId || !body) return ack({ ok: false, error: "Invalid message" });
    const message = editMessage(messageId, socket.user.id, body);
    if (!message) return ack({ ok: false, error: "Message not found or not owned by you" });
    const channel = findChannel(message.channel_id); if (channel) io.to(`channel-notify:${channel.id}`).emit("message:updated", { ...message, body }); ack({ ok: true, message: { ...message, body } });
  });
  socket.on("message:delete", (input, ack = () => {}) => {
    const messageId = Number(input?.messageId); if (!messageId) return ack({ ok: false, error: "Invalid message" });
    const message = findMessage(messageId);
    if (!message || !deleteMessage(messageId, socket.user.id)) return ack({ ok: false, error: "Message not found or not owned by you" });
    io.to(`channel-notify:${message.channel_id}`).emit("message:deleted", { messageId }); ack({ ok: true });
  });
  socket.on("community:changed", (payload) => {
    const communityId = String(payload?.communityId || "");
    if (!communityId) return;
    refreshAllNotificationRooms();
    io.emit("community:changed", { communityId });
    void publishCommunitySnapshot(communityId).catch((error) => console.error("Federation publish failed", error.message));
  });
  socket.on("dm:send", (input, ack = () => {}) => {
    const recipientId = String(input?.recipientId || "");
    const body = String(input?.body || "").trim().slice(0, 12000);
    if (!recipientId || !body || recipientId === socket.user.id || recipientId === getSystemUser().id)
      return ack({ ok: false, error: "Invalid direct message" });
    try {
      const saved = createDirectMessage(socket.user.id, recipientId, body);
      io.to(`user:${recipientId}`).emit("dm:created", saved);
      socket.emit("dm:created", saved);
      ack({ ok: true });
    } catch {
      ack({ ok: false, error: "Unable to send direct message" });
    }
  });
  socket.on("dm:typing", (payload) => {
    const recipientId = String(payload?.recipientId || "");
    if (recipientId) io.to(`user:${recipientId}`).emit("dm:typing", {
      userId: socket.user.id, name: socket.user.display_name, typing: Boolean(payload?.typing),
    });
  });
  socket.on("dm:call-invite", (payload) => {
    const recipientId = String(payload?.recipientId || "");
    if (recipientId) io.to(`user:${recipientId}`).emit("dm:call-invite", {
      callerId: socket.user.id, callerName: socket.user.display_name,
      mode: payload?.mode || "video", callId: payload?.callId,
    });
  });
  socket.on("dm:call-response", (payload) => {
    const recipientId = String(payload?.recipientId || "");
    if (recipientId) io.to(`user:${recipientId}`).emit("dm:call-response", {
      fromId: socket.user.id, accepted: Boolean(payload?.accepted), callId: payload?.callId,
    });
  });
});

federationEvents.on("community:changed", ({ communityId }) => {
  refreshAllNotificationRooms();
  io.emit("community:changed", { communityId, federated: true });
});
federationEvents.on("dm:encrypted", (message) => {
  const suffix = `#${federationDomain()}`;
  if (!String(message.recipient_global_id || "").endsWith(suffix)) return;
  const recipientId = message.recipient_global_id.slice(0, -suffix.length);
  io.to(`user:${recipientId}`).emit("dm:encrypted", message);
});
federationEvents.on("membership:changed", (membership) => {
  const suffix = `#${federationDomain()}`;
  if (!String(membership.user_global_id || "").endsWith(suffix)) return;
  const userId = membership.user_global_id.slice(0, -suffix.length);
  io.to(`user:${userId}`).emit("federation:membership", membership);
});
federationEvents.on("community:deleted", ({ communityGlobalId }) =>
  io.emit("federation:community-deleted", { communityGlobalId }));
federationEvents.on("remote-community:changed", ({ communityGlobalId }) =>
  io.emit("federation:community-changed", { communityGlobalId }));
moderationEvents.on("system-message", ({ recipientId, message }) => {
  io.to(`user:${recipientId}`).emit("dm:created", message);
});
moderationEvents.on("report:created", ({ reportId }) => {
  io.to("instance-moderators").emit("moderation:report-created", { reportId });
});
moderationEvents.on("account:banned", ({ userId, reason }) => {
  io.to(`user:${userId}`).emit("account:banned", { reason });
  setTimeout(() => io.in(`user:${userId}`).disconnectSockets(true), 150);
});

const federationRetryTimer = setInterval(() => {
  void deliverFederationOutbox().catch((error) => console.error("Federation delivery failed", error.message));
}, 10_000);
federationRetryTimer.unref();
void deliverFederationOutbox();

const directoryEnabled = String(process.env.DIRECTORY_ENABLED || "false").toLowerCase() === "true";
const directoryRegister = async () => {
  if (!directoryEnabled || !process.env.DIRECTORY_URL) return;
  try {
    const settings = getInstanceSettings();
    await fetch(new URL("/api/v1/instances/register", process.env.DIRECTORY_URL), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ publicUrl: process.env.PUBLIC_URL, name: settings.name, description: settings.shortDescription || settings.description, federationDomain: process.env.FEDERATION_DOMAIN, capabilities: ["federation", "realtime", "voice"] }), signal: AbortSignal.timeout(8000) });
  } catch (error) { console.error("Directory heartbeat failed", error.message); }
};
const directoryTimer = setInterval(directoryRegister, 60_000); directoryTimer.unref();
void directoryRegister();

server.listen(port, () => console.log(`LibraCord API listening on http://localhost:${port}`));
