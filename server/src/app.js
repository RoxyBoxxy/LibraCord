import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, existsSync } from "node:fs";
import { readFile, unlink } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import multer from "multer";
import { AccessToken, LiveKitAPI } from "livekit-server-sdk";
import { IngressInput } from "@livekit/protocol";
import {
  countUsers,
  createPeer,
  createUser,
  deletePeer,
  findPublicUser,
  findUserByEmail,
  findUserByUsername,
  listCommunities,
  listMessages,
  listPeers,
  channelExists,
  updatePeer,
  updatePassword,
  updateProfile,
  updateProfileImage,
  createChannel,
  createCommunity,
  createMessage,
  deleteMessage,
  findMessage,
  getInstanceSettings,
  listUsers,
  saveInstanceSettings,
  setUserAdministration,
  findCommunity,
  listCommunityChannels,
  updateCommunity,
  removeCommunity,
  initializeGuildAccess,
  listGuildMembers,
  listGuildRoles,
  listUserGuildRoles,
  createGuildRole,
  updateGuildRole,
  createCategory,
  findCategory,
  updateCategory,
  deleteCategory,
  listCategories,
  createInvite,
  listInvites,
  createWebhook,
  listWebhooks,
  updateChannel,
  reorderChannels,
  reorderGuildRoles,
  deleteChannel,
  findChannel,
  listPermissionOverrides,
  savePermissionOverride,
  setMemberRoles,
  listInstanceEmojis,
  listGuildEmojis,
  createInstanceEmoji,
  deleteInstanceEmoji,
  listGuildStickers,
  createGuildSticker,
  deleteGuildSticker,
  listSocialPosts,
  createSocialPost, boostSocialPost,
  listPublishedItems,
  createPublishedItem,
  listUserCollection,
  addUserCollectionItem,
  removeUserCollectionItem,
  findInvite,
  redeemInvite,
  ensureGuildMember,
  isGuildMember,
  userCanAccessChannel,
  userCanSendToChannel,
  userCanConnectToChannel,
  removeGuildMember,
  listChannelRolePicker, saveChannelRolePicker, toggleRolePickerRole,
  listBotApps, createBotApp, findBotApp, deleteBotApp, createBotToken, listBotTokens, revokeBotToken, findBotToken, touchBotToken, listBotCommands, upsertBotCommand, deleteBotCommand, listAllBotCommands, listGuildBotCommands, createBotInvite, findBotInvite, installBot, listBotInstalls,
  listDirectMessages,
  createDirectMessage,
  setDmPublicKey,
  listFriends, sendFriendRequest, listFriendRequests, acceptFriendRequest, removeFriend,
  listRemoteCommunitiesForUser, remoteMembershipStatus, listFederatedDms, findRemoteIdentity,
  findFederatedDmKey, listPeerPolicies, savePeerPolicy, createAbuseReport, listAbuseReports,
  communityFederationSnapshot, listPeerDomainsForCommunity,
  findPeerByDomain, saveRemoteIdentity, saveRemoteCommunity,
  findCommunityByReference, listGuildBans, banGuildActor, unbanGuildActor, listModerationActions,
  listDirectMessageContacts, getSystemUser, createSystemDirectMessage,
  banInstanceUser, unbanInstanceUser, listInstanceBans, createInstanceReport,
  listInstanceReports, updateInstanceReport, listInstanceModerationActions,
  listMediaAssets,
  importDiscordTemplate,
} from "./db.js";
import { proxyAsset, sendAsset, storeAsset } from "./assets.js";
import { aggregateFederatedHome, checkFederationPeer } from "./federated-home.js";
import { checkBrowserNavigation } from "./plugins/browser-policy.js";
import { moderationEvents } from "./moderation-events.js";
import {
  canonicalJson, createMigrationBundle, createRemoteJoin, createRemoteLeave, discoverFederationPeer, federationDomain, federationFetch, processIncomingEnvelope, signEnvelope,
  federationEvents, publicFederationIdentity, publishCommunityDeleted, publishCommunitySnapshot, queueFederationEvent,
  syncEvents, verifyDmKey, verifyEnvelope, claimLocalMigration,
} from "./federation.js";
import { toggleMessageReaction } from "./reactions.js";
import { Permissions, hasPermission, requireGuildPermission } from "./permissions.js";

const execFileAsync = promisify(execFile);
import {
  endSession,
  getUser,
  hashPassword,
  requireAdmin,
  requireUser,
  startSession,
  verifyPassword,
} from "./auth.js";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const uploadsDirectory = resolve(projectRoot, process.env.UPLOADS_PATH || "uploads");
mkdirSync(uploadsDirectory, { recursive: true });
const allowedImages = new Map([
  ["image/png", ".png"],
  ["image/jpeg", ".jpg"],
  ["image/gif", ".gif"],
]);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 32 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, done) =>
    allowedImages.has(file.mimetype)
      ? done(null, true)
      : done(new Error("Only PNG, JPG, and GIF images are supported")),
});
const allowedMessageFiles = new Set([
  ...allowedImages.keys(),
  "image/webp", "audio/mpeg", "audio/ogg", "audio/wav", "video/mp4", "video/webm",
  "application/pdf", "application/json", "application/zip", "application/x-7z-compressed",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain", "text/csv", "text/markdown",
]);
const messageFileUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 32 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, done) => allowedMessageFiles.has(file.mimetype)
    ? done(null, true)
    : done(new Error("That file type is not supported")),
});
function detectedImageExtension(buffer) {
  if (
    buffer
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return ".png";
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff)
    return ".jpg";
  const header = buffer.subarray(0, 6).toString("ascii");
  if (header === "GIF87a" || header === "GIF89a") return ".gif";
  return null;
}

const homeServer =
  process.env.FEDERATION_DOMAIN ||
  (() => {
    try {
      return new URL(process.env.PUBLIC_URL || "http://localhost:3002").host;
    } catch {
      return "localhost";
    }
  })();
// In local development the container's HTTP port may be remapped to avoid a
// collision on 7880. Keep the browser URL aligned with that published port
// when an explicit public LiveKit URL has not been supplied.
const livekitPublicUrl =
  process.env.LIVEKIT_URL ||
  `ws://localhost:${process.env.LIVEKIT_HTTP_PORT || 7880}`;
const livekitInternalUrl = process.env.LIVEKIT_INTERNAL_URL || livekitPublicUrl;
const federatedAssetUrl = (value) => value ? new URL(value, `${String(process.env.PUBLIC_URL || `http://${homeServer}`).replace(/\/$/, "")}/`).href : "";
function discordTemplateCode(value) {
  const input = String(value || "").trim();
  try {
    const url = new URL(input);
    if (![/^(?:www\.)?discord\.new$/i, /^(?:www\.)?discord\.com$/i].some((pattern) => pattern.test(url.hostname))) return null;
    const parts = url.pathname.split("/").filter(Boolean);
    const index = parts.findIndex((part) => part.toLowerCase() === "template");
    const code = index >= 0 ? parts[index + 1] : parts[0];
    return /^[A-Za-z0-9_-]{2,64}$/.test(code || "") ? code : null;
  } catch {
    return /^[A-Za-z0-9_-]{2,64}$/.test(input) ? input : null;
  }
}
async function fetchDiscordTemplate(value) {
  const code = discordTemplateCode(value);
  if (!code) throw new Error("Enter a valid discord.new template link");
  const response = await fetch(`https://discord.com/api/v9/guilds/templates/${encodeURIComponent(code)}`, { headers: { accept: "application/json", "user-agent": "LibraCord Discord template importer" } });
  if (!response.ok) throw new Error(`Discord template lookup failed (${response.status})`);
  const template = await response.json();
  const source = template?.serialized_source_guild;
  if (!source || !Array.isArray(source.channels) || !Array.isArray(source.roles)) throw new Error("That Discord template is unavailable or incomplete");
  return { code, name: template.name || source.name || "Imported community", description: template.description || source.description || "", serialized_source: source };
}
const publicUser = (user) => ({
  id: user.id,
  email: user.email,
  username: user.username,
  handle: `${user.username}@${homeServer}`,
  home_server: homeServer,
  display_name: user.display_name,
  avatar_url: user.avatar_url || "",
  banner_url: user.banner_url || "",
  bio: user.bio || "",
  accent_color: user.accent_color || "#7857ff",
  server_tags: (() => { try { return (typeof user.settings === "string" ? JSON.parse(user.settings || "{}") : user.settings || {}).serverTags || {}; } catch { return {}; } })(),
  server_tag: user.server_tag || "",
  server_tag_emoji: user.server_tag_emoji || "",
  profile_css: user.profile_css || "",
  role: user.role,
  created_at: user.created_at,
  settings:
    typeof user.settings === "string"
      ? JSON.parse(user.settings || "{}")
      : user.settings || {},
});
const publicProfile = (user) => {
  if (!user) return null;
  const profileSettings =
    typeof user.settings === "string"
      ? JSON.parse(user.settings || "{}")
      : user.settings || {};
  return {
    id: user.id,
    username: user.username,
    handle: `${user.username}@${homeServer}`,
    home_server: homeServer,
    display_name: user.display_name,
    avatar_url: user.avatar_url || "",
    banner_url: user.banner_url || "",
    bio: user.bio || "",
    accent_color: user.accent_color || "#7857ff",
    server_tag: user.server_tag || "",
    server_tag_emoji: user.server_tag_emoji || "",
    profile_css: user.profile_css || "",
    role: user.role,
    status: profileSettings.status || "online",
    status_text: profileSettings.statusText || "",
    decoration_id: profileSettings.selectedDecorationId || "",
    profile_theme_id: profileSettings.selectedProfileThemeId || "",
    username_style_ids: Array.isArray(profileSettings.selectedUsernameStyleIds) ? profileSettings.selectedUsernameStyleIds : [],
    server_tags: profileSettings.serverTags || {},
    server_tag_selection: profileSettings.serverTag || null,
    profile_background: profileSettings.profileBackground || "#21152c",
    profile_background_image: profileSettings.profileBackgroundImage || "",
    created_at: user.created_at,
  };
};
const validEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const validUsername = (value) => /^[a-z0-9][a-z0-9_.-]{2,31}$/.test(value);
function imageUrl(value) {
  value = String(value || "")
    .trim()
    .slice(0, 2048);
  if (!value) return "";
  if (/^\/uploads\/[a-f0-9-]+\.(png|jpg|gif)$/.test(value)) return value;
  if (/^\/api\/v1\/assets\/[a-f0-9-]{36}$/.test(value)) return value;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
function peerInput(body) {
  const name = String(body?.name || "")
      .trim()
      .slice(0, 80),
    status = String(body?.status || "pending");
  let url;
  try {
    url = new URL(String(body?.baseUrl || ""));
  } catch {
    return null;
  }
  if (
    !name ||
    !["http:", "https:"].includes(url.protocol) ||
    !["pending", "allowed", "blocked"].includes(status)
  )
    return null;
  return { name, baseUrl: url.origin, status };
}
function deprecatedEndpoint(res, successor) {
  res.set("deprecation", "true");
  res.set("link", `<${successor}>; rel=\"successor-version\"`);
}

export function createApp() {
  const app = express();
  const requireBot = (req, res, next) => {
    const header = String(req.headers.authorization || "");
    if (!header.startsWith("Bot ")) return res.status(401).json({ error: "Bot authorization required" });
    const record = findBotToken(createHash("sha256").update(header.slice(4).trim()).digest("hex"));
    if (!record) return res.status(401).json({ error: "Invalid or revoked bot token" });
    touchBotToken(record.id); req.bot = record; req.user = { id: record.app_id, owner_id: record.owner_id, bot_app_id: record.app_id, role: "bot", display_name: record.app_name, username: record.app_name }; next();
  };
  app.use((req, res, next) => String(req.headers.authorization || "").startsWith("Bot ") ? requireBot(req, res, next) : next());
  // Developer endpoints can be called by either the bot token itself (for
  // command registration) or by the owning user session. Keep ownership
  // checks tied to the application owner in both cases.
  const botAppOwner = (req) => req.bot?.owner_id || req.user.id;
  app.disable("x-powered-by");
  const configuredClientOrigins = String(process.env.CLIENT_ORIGIN || "http://localhost:5173")
    .split(",")
    .map((value) => value.trim().replace(/\/$/, ""))
    .filter(Boolean);
  const allowAnyClientOrigin = configuredClientOrigins.includes("*");
  app.use(
    cors({
      origin(origin, callback) {
        // Requests without Origin are same-origin/server-to-server. Wildcard
        // mode reflects HTTP(S) origins because credentialed CORS responses
        // are not permitted to use Access-Control-Allow-Origin: *.
        if (!origin) return callback(null, true);
        let normalizedOrigin = "";
        try {
          const parsed = new URL(origin);
          if (!["http:", "https:"].includes(parsed.protocol)) return callback(null, false);
          normalizedOrigin = parsed.origin;
        } catch {
          return callback(null, false);
        }
        return callback(null, allowAnyClientOrigin || configuredClientOrigins.includes(normalizedOrigin));
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "512kb" }));
  app.use(
    "/uploads",
    express.static(uploadsDirectory, { fallthrough: false, maxAge: "7d" }),
  );
  const remoteChannelFor = (userId, channelId) => {
    const globalUserId = `${userId}#${federationDomain()}`;
    for (const remote of listRemoteCommunitiesForUser(globalUserId)) {
      if (remote.status !== "joined") continue;
      const channel = (remote.state?.channels || []).find((item) => String(item.id) === String(channelId));
      if (channel) return { remote, channel };
    }
    return null;
  };
  const remoteCommunityFor = (userId, communityId) => {
    const globalUserId = `${userId}#${federationDomain()}`;
    const requested = String(communityId || "");
    return listRemoteCommunitiesForUser(globalUserId).find((remote) => remote.status === "joined" && (
      String(remote.global_id) === requested ||
      // Older clients sent community IDs containing `#` without encoding it;
      // the browser stripped the fragment before it reached this route. The
      // remote UUID still lets us resolve the joined community safely.
      String(remote.remote_id) === requested ||
      String(remote.address) === requested
    )) || null;
  };
  const assertRoleHierarchy = (guildId, actor, targetUserId, roleIds) => {
    const community = findCommunity(guildId);
    const roles = listGuildRoles(guildId);
    const requested = [...new Set(roleIds.map(String))];
    if (!community || requested.some((id) => !roles.some((role) => String(role.id) === id))) throw new Error("Invalid role assignment");
    // The community owner and instance administrators are trusted to manage
    // the full ladder. Everyone else can only change roles below their own.
    if (community.owner_id === actor.id || ["owner", "admin"].includes(actor.role)) return requested;
    if (community.owner_id === targetUserId) throw new Error("The community owner cannot have roles changed");
    const actorTop = Math.max(-1, ...listUserGuildRoles(guildId, actor.id).filter((role) => !role.managed).map((role) => Number(role.position || 0)));
    if (!String(targetUserId).includes("#")) {
      const targetTop = Math.max(-1, ...listUserGuildRoles(guildId, targetUserId).filter((role) => !role.managed).map((role) => Number(role.position || 0)));
      if (targetTop >= actorTop) throw new Error("You can only manage members below your highest role");
    }
    if (actorTop < 0 || requested.some((id) => {
      const role = roles.find((item) => String(item.id) === id);
      return role.managed || Number(role.position || 0) >= actorTop;
    })) throw new Error("You can only assign roles below your highest role");
    return requested;
  };
  const requestRemoteChannel = async (req, channelId, action, input = {}) => {
    const match = remoteChannelFor(req.user.id, channelId);
    if (!match) return null;
    const peer = findPeerByDomain(match.remote.origin);
    if (!peer || peer.status !== "allowed") throw new Error("Remote community instance is not an allowed peer");
    const envelope = signEnvelope({
      destination: match.remote.origin,
      type: "channel.request",
      entity_id: `${match.remote.global_id}:${channelId}`,
      payload: {
        action,
        community_id: match.remote.remote_id,
        channel_id: String(channelId),
        user_global_id: `${req.user.id}#${federationDomain()}`,
        ...input,
        attachments: Array.isArray(input.attachments)
          ? input.attachments.map((attachment) => ({ ...attachment, url: federatedAssetUrl(attachment.url) }))
          : input.attachments,
      },
    });
    const response = await federationFetch(peer, "/api/v1/federation/channel", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(envelope),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `Remote channel request returned ${response.status}`);
    return result;
  };
  const requestRemoteVoice = async (req, { channelId = "", communityId = "", action, input = {} } = {}) => {
    const match = channelId ? remoteChannelFor(req.user.id, channelId) : { remote: remoteCommunityFor(req.user.id, communityId) };
    if (!match?.remote) return null;
    const peer = findPeerByDomain(match.remote.origin);
    if (!peer || peer.status !== "allowed") throw new Error("Remote community instance is not an allowed peer");
    const envelope = signEnvelope({
      destination: match.remote.origin,
      type: "voice.request",
      entity_id: `${match.remote.global_id}:${channelId || communityId}`,
      payload: {
        action,
        community_id: match.remote.remote_id,
        channel_id: String(channelId || ""),
        user_global_id: `${req.user.id}#${federationDomain()}`,
        ...input,
      },
    });
    const response = await federationFetch(peer, "/api/v1/federation/voice", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(envelope),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `Remote voice request returned ${response.status}`);
    return result;
  };
  app.get("/health", (_req, res) => res.json({ ok: true }));

  // Publish one convergent community snapshot after successful local mutations.
  // Capturing the channel/category owner before a DELETE keeps the hook reliable.
  app.use((req, res, next) => {
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return next();
    const guildMatch = req.path.match(/^\/api\/v1\/guilds\/([^/]+)/);
    const channelMatch = req.path.match(/^\/api\/v1\/channels\/([^/]+)/);
    const categoryMatch = req.path.match(/^\/api\/v1\/categories\/([^/]+)/);
    const guildId = guildMatch?.[1] || (channelMatch ? findChannel(channelMatch[1])?.community_id : null) ||
      (categoryMatch ? findCategory(categoryMatch[1])?.guild_id : null);
    const deletingGuild = req.method === "DELETE" && /^\/api\/v1\/guilds\/[^/]+$/.test(req.path);
    const deletePeers = deletingGuild && guildId ? listPeers().filter((peer) => peer.status === "allowed") : [];
    res.on("finish", () => {
      if (guildId && res.statusCode < 400 && req.method !== "GET") {
        const publication = findCommunity(guildId) ? publishCommunitySnapshot(guildId) :
          deletingGuild ? publishCommunityDeleted(guildId, deletePeers) : Promise.resolve();
        void publication.catch((error) => console.error("Federation publish failed", error.message));
      }
      if (/^\/api\/users\/me(?:\/|$)/.test(req.path) && res.statusCode < 400 && req.user) {
        const identity = findPublicUser(req.user.id);
        for (const peer of listPeers().filter((item) => item.status === "allowed"))
          void queueFederationEvent({ peer, type: "identity.upsert", entityId: `${identity.id}#${federationDomain()}`,
            payload: { id: identity.id, username: identity.username, display_name: identity.display_name,
              avatar_url: federatedAssetUrl(identity.avatar_url), banner_url: federatedAssetUrl(identity.banner_url),
              dm_public_key: identity.dm_public_key, profile: publicProfile(identity) } }).catch(() => {});
      }
    });
    next();
  });

  app.get("/api/auth/me", (req, res) => {
    const user = getUser(req);
    res.json({ user: user ? publicUser(user) : null });
  });
  app.post("/api/auth/register", async (req, res, next) => {
    try {
      const registrationMode = getInstanceSettings().registrations;
      if (["closed", "invite"].includes(registrationMode))
        return res
          .status(403)
          .json({ error: "Registrations are not currently open" });
      const email = String(req.body?.email || "")
          .trim()
          .toLowerCase(),
        username = String(req.body?.username || "")
          .trim()
          .toLowerCase(),
        displayName = String(req.body?.displayName || "")
          .trim()
          .slice(0, 64),
        password = String(req.body?.password || "");
      if (
        !validEmail(email) ||
        !validUsername(username) ||
        !displayName ||
        password.length < 10 ||
        password.length > 128
      )
        return res.status(400).json({
          error:
            "Use a valid email, username, display name, and password of at least 10 characters",
        });
      if (findUserByEmail(email))
        return res
          .status(409)
          .json({ error: "An account with that email already exists" });
      if (findUserByUsername(username))
        return res
          .status(409)
          .json({ error: "That username is already taken" });
      const role = countUsers() === 0 ? "owner" : "member",
        user = createUser({
          id: randomUUID(),
          email,
          username,
          displayName,
          passwordHash: await hashPassword(password),
          role,
        });
      if (role === "owner") ensureGuildMember("libracord", user.id);
      startSession(res, user.id);
      res.status(201).json({ user });
    } catch (error) {
      next(error);
    }
  });
  app.post("/api/auth/login", async (req, res, next) => {
    try {
      const email = String(req.body?.email || "")
          .trim()
          .toLowerCase(),
        password = String(req.body?.password || ""),
        user = findUserByEmail(email);
      if (!user || !(await verifyPassword(password, user.password_hash)))
        return res.status(401).json({ error: "Invalid email or password" });
      if (user.suspended)
        return res.status(403).json({ error: "This account has been suspended or banned" });
      startSession(res, user.id);
      res.json({ user: publicUser(user) });
    } catch (error) {
      next(error);
    }
  });
  app.post("/api/auth/logout", (req, res) => {
    endSession(req, res);
    res.status(204).end();
  });
  app.get("/api/users/:id/profile", requireUser, async (req, res) => {
    const local = findPublicUser(req.params.id);
    if (local) {
      const profile = publicProfile(local);
      if (req.query.guildId) profile.roles = listUserGuildRoles(req.query.guildId, req.params.id);
      return res.json({ profile });
    }

    // A remote member is addressed by its portable ID (user-id#instance), or
    // by its source UUID together with a remote guildId. Resolve the profile
    // from the owning instance and preserve absolute media URLs.
    const requestedId = String(req.params.id || "");
    const remoteCommunity = req.query.guildId ? remoteCommunityFor(req.user.id, req.query.guildId) : null;
    const separator = requestedId.lastIndexOf("#");
    const remoteUserId = separator > 0 ? requestedId.slice(0, separator) : requestedId;
    const remoteOrigin = separator > 0 ? requestedId.slice(separator + 1) : remoteCommunity?.origin;
    if (!remoteOrigin || !remoteCommunity && separator < 1) return res.status(404).json({ error: "User not found" });

    let identity = findRemoteIdentity(`${remoteUserId}#${remoteOrigin}`);
    if (!identity) {
      try {
        const peer = findPeerByDomain(remoteOrigin);
        if (peer?.status !== "allowed") return res.status(404).json({ error: "User not found" });
        const response = await federationFetch(peer, `/api/v1/federation/identities/${encodeURIComponent(remoteUserId)}`, { headers: { accept: "application/json" } });
        if (response.ok) identity = (await response.json()).identity || null;
      } catch {
        identity = null;
      }
    }
    if (!identity) return res.status(404).json({ error: "User not found" });
    const memberIdentity = (remoteCommunity?.state?.member_identities || []).find((member) =>
      String(member.global_id || `${member.id}#${member.origin || remoteOrigin}`) === `${remoteUserId}#${remoteOrigin}`) || null;
    // The current community snapshot is authoritative for a member's
    // per-community identity and join date. Prefer it over a cached identity.
    const profileSource = memberIdentity?.profile || (identity.profile && typeof identity.profile === "object" ? identity.profile : identity);
    const remoteBase = findPeerByDomain(remoteOrigin)?.base_url || `https://${remoteOrigin}`;
    const remoteAsset = (value) => {
      if (!value) return "";
      try { return new URL(value, `${String(remoteBase).replace(/\/$/, "")}/`).href; } catch { return value; }
    };
    const profile = {
      id: `${remoteUserId}#${remoteOrigin}`,
      username: memberIdentity?.username || identity.username || remoteUserId,
      handle: `${memberIdentity?.username || identity.username || remoteUserId}@${remoteOrigin}`,
      home_server: remoteOrigin,
      display_name: memberIdentity?.display_name || identity.display_name || identity.username || remoteUserId,
      avatar_url: remoteAsset(memberIdentity?.avatar_url || identity.avatar_url),
      banner_url: remoteAsset(memberIdentity?.banner_url || identity.banner_url),
      bio: profileSource.bio || "",
      accent_color: profileSource.accent_color || "#7857ff",
      server_tag: profileSource.server_tag || "",
      server_tag_emoji: profileSource.server_tag_emoji || "",
      profile_css: profileSource.profile_css || "",
      role: "",
      status: profileSource.status || "online",
      status_text: profileSource.status_text || profileSource.statusText || "",
      decoration_id: profileSource.decoration_id || profileSource.selectedDecorationId || "",
      profile_theme_id: profileSource.profile_theme_id || profileSource.selectedProfileThemeId || "",
      server_tags: profileSource.server_tags || profileSource.serverTags || {},
      server_tag_selection: profileSource.server_tag_selection || profileSource.serverTag || null,
      profile_background: profileSource.profile_background || profileSource.profileBackground || "#21152c",
      profile_background_image: profileSource.profile_background_image || profileSource.profileBackgroundImage || "",
      created_at: memberIdentity?.joined_at || identity.created_at || null,
    };
    if (remoteCommunity) {
      const storedMember = remoteCommunity.state?.remote_members?.find((item) => String(item.global_id) === profile.id);
      const roleIds = memberIdentity?.roles || storedMember?.roles || [];
      profile.roles = roleIds.map((roleId) => (remoteCommunity.state.roles || []).find((role) => String(role.id) === String(roleId))).filter(Boolean);
    }
    return res.json({ profile });
  });
  app.put("/api/users/me", requireUser, (req, res) => {
    const username = String(req.body?.username || "")
        .trim()
        .toLowerCase(),
      displayName = String(req.body?.displayName || "")
        .trim()
        .slice(0, 64),
      avatarUrl = imageUrl(req.body?.avatarUrl),
      bannerUrl = imageUrl(req.body?.bannerUrl),
      bio = String(req.body?.bio || "")
        .trim()
        .slice(0, 500),
      accentColor = String(req.body?.accentColor || "#7857ff"),
      profileCss = String(req.body?.profileCss || "")
        .trim()
        .slice(0, 2000),
      serverTag = String(req.body?.serverTag || "").trim().slice(0, 24),
      serverTagEmoji = String(req.body?.serverTagEmoji || "").trim().slice(0, 8),
      input = req.body?.settings || {};
    if (!validUsername(username) || !displayName)
      return res.status(400).json({
        error:
          "Username must be 3-32 lowercase letters, numbers, dots, dashes, or underscores",
      });
    if (avatarUrl === null || bannerUrl === null)
      return res
        .status(400)
        .json({ error: "Avatar and banner must use an http or https URL" });
    if (!/^#[0-9a-f]{6}$/i.test(accentColor))
      return res
        .status(400)
        .json({ error: "Accent color must be a six-digit hex color" });
    if (/[{}@]|url\s*\(|expression\s*\(/i.test(profileCss))
      return res.status(400).json({
        error:
          "Custom CSS may contain declarations only; selectors, imports, and URLs are not allowed",
      });
    const existing = findUserByUsername(username);
    if (existing && existing.id !== req.user.id)
      return res.status(409).json({ error: "That username is already taken" });
    const settings = {
      theme: ["dark", "midnight", "light"].includes(input.theme)
        ? input.theme
        : "dark",
      compact: Boolean(input.compact),
      notifications: input.notifications !== false,
      inputDeviceId: String(input.inputDeviceId || "").slice(0, 256),
      outputDeviceId: String(input.outputDeviceId || "").slice(0, 256),
      inputVolume: Math.max(0, Math.min(100, Number(input.inputVolume) || 100)),
      outputVolume: Math.max(
        0,
        Math.min(100, Number(input.outputVolume) || 100),
      ),
      status: ["online", "idle", "dnd", "offline"].includes(input.status)
        ? input.status
        : "online",
      statusText: String(input.statusText || "")
        .trim()
        .slice(0, 128),
      mutedChannels: Array.isArray(input.mutedChannels)
        ? input.mutedChannels.map(String).slice(0, 500)
        : [],
      selectedDecorationId: String(input.selectedDecorationId || "").slice(
        0,
        160,
      ),
      selectedProfileThemeId: String(input.selectedProfileThemeId || "").slice(
        0,
        160,
      ),
      selectedUsernameStyleIds: Array.isArray(input.selectedUsernameStyleIds)
        ? input.selectedUsernameStyleIds.map(String).slice(0, 12)
        : [],
      serverTags: input.serverTags && typeof input.serverTags === "object"
        ? Object.fromEntries(Object.entries(input.serverTags).slice(0, 200).map(([id, value]) => [String(id), { text: String(value?.text || "").trim().slice(0, 24), emoji: String(value?.emoji || "").trim().slice(0, 8) }]))
        : {},
      serverTag: input.serverTag && typeof input.serverTag === "object"
        ? { text: String(input.serverTag.text || "").trim().slice(0, 24), emoji: String(input.serverTag.emoji || "").trim().slice(0, 8) }
        : null,
      profileBackground: /^#[0-9a-f]{6}$/i.test(input.profileBackground) ? input.profileBackground : "#21152c",
      profileBackgroundImage: String(input.profileBackgroundImage || "").slice(0, 2048),
      profileBackgroundBlur: Math.max(0, Math.min(24, Number(input.profileBackgroundBlur) || 0)),
      profileBackgroundDim: Math.max(0, Math.min(90, Number(input.profileBackgroundDim) || 0)),
    };
    res.json({
      user: publicUser(
        updateProfile(req.user.id, {
          username,
          displayName,
          avatarUrl,
          bannerUrl,
          bio,
          accentColor,
          profileCss,
          serverTag,
          serverTagEmoji,
          settings,
        }),
      ),
    });
  });
  app.post("/api/users/me/images/:kind", requireUser, (req, res) => {
    if (!["avatar", "banner"].includes(req.params.kind))
      return res.status(404).json({ error: "Unknown image type" });
    upload.single("image")(req, res, (error) => {
      if (error) return res.status(400).json({ error: error.message });
      if (!req.file)
        return res.status(400).json({ error: "Choose an image to upload" });
      const extension = detectedImageExtension(req.file.buffer);
      if (!extension)
        return res.status(400).json({
          error: "The file contents are not a valid PNG, JPG, or GIF image",
        });
      const asset = storeAsset(uploadsDirectory, {
        buffer: req.file.buffer,
        mimeType: req.file.mimetype,
        kind: req.params.kind,
        ownerUserId: req.user.id,
      });
      const record = updateProfileImage(
        req.user.id,
        req.params.kind,
        `/api/v1/assets/${asset.id}`,
      );
      res.json({ user: publicUser(record) });
    });
  });
  app.put("/api/users/me/password", requireUser, async (req, res, next) => {
    try {
      const current = String(req.body?.currentPassword || ""),
        nextPassword = String(req.body?.newPassword || ""),
        record = findUserByEmail(req.user.email);
      if (!(await verifyPassword(current, record.password_hash)))
        return res.status(403).json({ error: "Current password is incorrect" });
      if (nextPassword.length < 10 || nextPassword.length > 128)
        return res
          .status(400)
          .json({ error: "New password must contain 10 to 128 characters" });
      updatePassword(req.user.id, await hashPassword(nextPassword));
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  // Versioned Discord-style REST surface. IDs are opaque UUIDs and JSON uses stable resource objects.
  app.get("/api/v1/instance", (_req, res) =>
    res.json({ id: homeServer, ...getInstanceSettings(), api_version: 1 }),
  );
  app.get("/api/v1/developer/apps", requireUser, (req, res) => res.json({ apps: listBotApps(req.user.id) }));
  app.post("/api/v1/developer/apps", requireUser, (req, res) => {
    const name = String(req.body?.name || "").trim().slice(0, 80);
    if (!name) return res.status(400).json({ error: "Application name is required" });
    res.status(201).json({ app: createBotApp(req.user.id, name, String(req.body?.description || "").trim().slice(0, 500), Boolean(req.body?.public)) });
  });
  app.delete("/api/v1/developer/apps/:id", requireUser, (req, res) => deleteBotApp(req.params.id, req.user.id) ? res.status(204).end() : res.status(404).json({ error: "Application not found" }));
  app.get("/api/v1/developer/apps/:id/tokens", requireUser, (req, res) => { const appRecord = findBotApp(req.params.id, req.user.id); return appRecord ? res.json({ tokens: listBotTokens(appRecord.id) }) : res.status(404).json({ error: "Application not found" }); });
  app.post("/api/v1/developer/apps/:id/tokens", requireUser, (req, res) => {
    const appRecord = findBotApp(req.params.id, req.user.id); if (!appRecord) return res.status(404).json({ error: "Application not found" });
    const raw = `lc_bot_${randomBytes(32).toString("base64url")}`;
    const token = createBotToken(appRecord.id, String(req.body?.label || "default").trim().slice(0, 64) || "default", createHash("sha256").update(raw).digest("hex"));
    res.status(201).json({ token: raw, tokenInfo: token });
  });
  app.delete("/api/v1/developer/apps/:id/tokens/:tokenId", requireUser, (req, res) => { const appRecord = findBotApp(req.params.id, req.user.id); return appRecord && revokeBotToken(req.params.tokenId, appRecord.id) ? res.status(204).end() : res.status(404).json({ error: "Token not found" }); });
  app.get("/api/v1/developer/apps/:id/commands", requireUser, (req, res) => { const appRecord = findBotApp(req.params.id, botAppOwner(req)); return appRecord ? res.json({ commands: listBotCommands(appRecord.id) }) : res.status(404).json({ error: "Application not found" }); });
  app.put("/api/v1/developer/apps/:id/commands/:name", requireUser, (req, res) => { const appRecord = findBotApp(req.params.id, botAppOwner(req)), name = String(req.params.name || "").toLowerCase(); if (!appRecord || !/^[a-z0-9_-]{1,32}$/.test(name)) return res.status(400).json({ error: "Invalid application or command name" }); return res.json({ command: upsertBotCommand(appRecord.id, name, String(req.body?.description || "").slice(0, 160), Array.isArray(req.body?.options) ? req.body.options.slice(0, 20) : []) }); });
  app.delete("/api/v1/developer/apps/:id/commands/:commandId", requireUser, (req, res) => { const appRecord = findBotApp(req.params.id, botAppOwner(req)); return appRecord && deleteBotCommand(req.params.commandId, appRecord.id) ? res.status(204).end() : res.status(404).json({ error: "Command not found" }); });
  app.post("/api/v1/developer/apps/:id/invites", requireUser, (req, res) => { const appRecord = findBotApp(req.params.id, req.user.id); if (!appRecord) return res.status(404).json({ error: "Application not found" }); let permissions = "0"; try { permissions = BigInt(String(req.body?.permissions || "0")).toString(); if (BigInt(permissions) < 0n) throw new Error("negative"); } catch { return res.status(400).json({ error: "Permissions must be a non-negative integer mask" }); } res.status(201).json({ invite: createBotInvite(appRecord.id, String(req.body?.guildId || "") || null, permissions, req.user.id, req.body?.expiresAt || null) }); });
  app.get("/api/v1/developer/apps/:id/installs", requireUser, (req, res) => { const appRecord = findBotApp(req.params.id, req.user.id); return appRecord ? res.json({ installs: listBotInstalls(appRecord.id) }) : res.status(404).json({ error: "Application not found" }); });
  app.get("/api/v1/bot-invites/:code", (req, res) => { const invite = findBotInvite(req.params.code); if (!invite) return res.status(404).json({ error: "Bot invite is invalid or expired" }); const appRecord = findBotApp(invite.app_id); res.json({ invite: { ...invite, app_name: appRecord?.name || "Bot", app_description: appRecord?.description || "" } }); });
  app.post("/api/v1/bot-invites/:code/accept", requireUser, (req, res) => { const invite = findBotInvite(req.params.code); if (!invite) return res.status(404).json({ error: "Bot invite is invalid or expired" }); const guildId = String(req.body?.guildId || invite.guild_id || ""); if (!guildId) return res.status(400).json({ error: "Choose a community for this bot" }); const guild = findCommunity(guildId); if (!guild) return res.status(404).json({ error: "Community not found" }); if (!hasPermission(req.user, guildId, Permissions.MANAGE_GUILD)) return res.status(403).json({ error: "You need Manage Server permission to install bots" }); const installed = installBot(invite.app_id, guildId, invite.permissions, req.user.id); res.status(201).json({ install: installed }); });
  app.get("/api/v1/commands", requireUser, (req, res) => res.json({ commands: [
    { name: "shrug", description: "Appends a shrug emoticon to your message.", options: [], app_name: "Built-in", built_in: true },
    { name: "me", description: "Displays text with emphasis.", options: [], app_name: "Built-in", built_in: true },
    ...(req.query.communityId ? listGuildBotCommands(String(req.query.communityId)) : listAllBotCommands()),
  ] }));
  app.get("/api/v1/bot/me", requireBot, (req, res) => res.json({ bot: { id: req.bot.app_id, name: req.bot.app_name, owner_id: req.bot.owner_id } }));
  app.get("/api/v1/users/@me", requireUser, (req, res) =>
    res.json({ user: publicUser(req.user) }),
  );
  app.get("/api/v1/home/posts", requireUser, (_req, res) =>
    res.json({ posts: listSocialPosts() }),
  );
  app.get("/api/v1/federation/home", (_req, res) => {
    const instance = getInstanceSettings();
    res.json({
      protocol: "libracord-home",
      version: 1,
      instance: { domain: homeServer, name: instance.name },
      posts: listSocialPosts(),
      items: listPublishedItems(),
      communities: listCommunities().map((community) => ({
        id: community.id,
        name: community.name,
        description: community.description,
        icon_url: community.icon_url,
        banner_url: community.banner_url,
        profile: community.profile,
        address: `${String(community.name || community.id).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}#${homeServer}`,
      })),
    });
  });
  app.post("/api/v1/federation/inbox", async (req, res, next) => {
    try {
      const result = await processIncomingEnvelope(req.body);
      res.status(result.duplicate ? 200 : 202).json(result);
    } catch (error) {
      if (error.status === 429) res.set("retry-after", "60");
      res.status(error.status || 400).json({ error: error.message });
    }
  });
  app.post("/api/v1/federation/sync", async (req, res) => {
    try {
      await verifyEnvelope(req.body);
      if (req.body.type !== "sync.request") return res.status(400).json({ error: "Expected a sync.request envelope" });
      const events = syncEvents(req.body);
      return res.json({ events, cursor: events.at(-1)?.occurred_at || req.body.payload?.after || "" });
    } catch (error) {
      if (error.status === 429) res.set("retry-after", "60");
      return res.status(error.status || 400).json({ error: error.message });
    }
  });
  app.post("/api/v1/federation/migrations/:id/claim", (req, res) => {
    const migration = claimLocalMigration(req.params.id, req.body?.secret);
    return migration ? res.json({ bundle: migration.bundle }) : res.status(404).json({ error: "Migration claim is invalid or expired" });
  });
  app.get("/api/v1/federation/communities/:id", (req, res) => {
    const community = findCommunityByReference(req.params.id);
    const snapshot = community ? communityFederationSnapshot(community.id, federationDomain()) : null;
    if (!snapshot) return res.status(404).json({ error: "Community not found" });
    // Channel/category/role metadata is public community structure and must be
    // included in the initial join response.  Omitting it leaves the joining
    // instance with an empty remote guild until the next federation snapshot.
    const { permission_overrides: _overrides, members: _members, member_roles: _memberRoles,
      remote_members: _remoteMembers, bans: _bans,
      moderation_actions: _moderation, ...publicCommunity } = snapshot;
    return res.json({ community: publicCommunity });
  });
  app.post("/api/v1/federation/channel", async (req, res) => {
    try {
      await verifyEnvelope(req.body);
      if (req.body?.type !== "channel.request") return res.status(400).json({ error: "Expected a channel.request envelope" });
      const payload = req.body.payload || {};
      const communityId = String(payload.community_id || "");
      const channelId = String(payload.channel_id || "");
      const userGlobalId = String(payload.user_global_id || "");
      const channel = findChannel(channelId);
      if (!communityId || !channel || channel.community_id !== communityId || !["text", "voice"].includes(channel.kind))
        return res.status(404).json({ error: "Channel not found" });
      if (!userGlobalId.endsWith(`#${String(req.body.origin || "").toLowerCase()}`) || remoteMembershipStatus(`${communityId}#${federationDomain()}`, userGlobalId) !== "joined")
        return res.status(403).json({ error: "Remote community membership required" });
      const federatedMessage = (message) => ({
        ...message,
        author_id: String(message.author_id || "").includes("#") ? message.author_id : `${message.author_id}#${federationDomain()}`,
        attachments: (message.attachments || []).map((attachment) => ({
          ...attachment,
          url: federatedAssetUrl(attachment.url),
        })),
      });
      const publishChannelEvent = (type, entityId, eventPayload) => {
        const destinations = new Set(listPeerDomainsForCommunity(communityId, federationDomain()));
        destinations.add(String(req.body.origin || "").toLowerCase());
        for (const destination of destinations) if (destination)
          void queueFederationEvent({ destination, type, entityId, payload: eventPayload }).catch(() => {});
      };
      if (payload.action === "role-picker.toggle") {
        if (!channel.role_picker_enabled) return res.status(404).json({ error: "Role picker not found" });
        const roleIds = toggleRolePickerRole(communityId, channelId, userGlobalId, String(payload.role_id || ""));
        // Membership-role data is part of the community snapshot, so publish
        // it after an opt-in role changes on the home instance.
        void publishCommunitySnapshot(communityId).catch(() => {});
        return res.json({ role_ids: roleIds });
      }
      if (payload.action === "list") return res.json({ messages: listMessages(channelId).map(federatedMessage) });
      if (payload.action === "delete") {
        const messageId = Number(payload.message_id);
        const message = Number.isSafeInteger(messageId) && findMessage(messageId);
        if (!message || message.channel_id !== channelId) return res.status(404).json({ error: "Message not found" });
        if (message.author_id !== userGlobalId) return res.status(403).json({ error: "You can only delete your own federated messages" });
        if (!deleteMessage(messageId, userGlobalId)) return res.status(409).json({ error: "Message was already deleted" });
        const eventPayload = { channel_id: channelId, message_id: messageId };
        publishChannelEvent("channel.message.delete", `${channelId}:${messageId}`, eventPayload);
        federationEvents.emit("remote-channel:deleted", eventPayload);
        return res.status(204).end();
      }
      if (payload.action === "reaction") {
        const messageId = Number(payload.message_id), emoji = String(payload.emoji || "").slice(0, 64);
        const message = Number.isSafeInteger(messageId) && findMessage(messageId);
        if (!message || message.channel_id !== channelId || !emoji) return res.status(400).json({ error: "Invalid reaction" });
        const reactions = toggleMessageReaction(channelId, messageId, emoji);
        const eventPayload = { channel_id: channelId, message_id: messageId, reactions };
        publishChannelEvent("channel.message.reactions", `${channelId}:${messageId}:reactions`, eventPayload);
        federationEvents.emit("remote-channel:reactions", eventPayload);
        return res.json({ reactions });
      }
      if (payload.action !== "create") return res.status(400).json({ error: "Unsupported channel action" });
      const body = String(payload.body || "").trim().slice(0, 4000);
      const attachments = Array.isArray(payload.attachments) ? payload.attachments.slice(0, 8) : [];
      if ((!body && !attachments.length) || !userGlobalId) return res.status(400).json({ error: "Valid message content is required" });
      const message = createMessage({
        channelId,
        authorId: userGlobalId,
        authorName: String(payload.author_name || "Remote user").trim().slice(0, 80),
        body,
        attachments,
        contentWarning: String(payload.content_warning || "").trim().slice(0, 120),
        replyTo: payload.reply_to ? Number(payload.reply_to) : null,
      });
      const publicMessage = federatedMessage(message);
      publishChannelEvent("channel.message.create", `${channelId}:${message.id}`, { channel_id: channelId, message: publicMessage });
      federationEvents.emit("remote-channel:message", { channel_id: channelId, message: publicMessage });
      return res.status(201).json({ message: publicMessage });
    } catch (error) {
      if (error.status === 429) res.set("retry-after", "60");
      return res.status(error.status || 400).json({ error: error.message });
    }
  });
  app.post("/api/v1/federation/voice", async (req, res) => {
    try {
      await verifyEnvelope(req.body);
      if (req.body?.type !== "voice.request") return res.status(400).json({ error: "Expected a voice.request envelope" });
      const payload = req.body.payload || {};
      const communityId = String(payload.community_id || "");
      const channelId = String(payload.channel_id || "");
      const userGlobalId = String(payload.user_global_id || "");
      const status = remoteMembershipStatus(`${communityId}#${federationDomain()}`, userGlobalId);
      if (!communityId || !userGlobalId.endsWith(`#${String(req.body.origin || "").toLowerCase()}`) || status !== "joined")
        return res.status(403).json({ error: "Remote community membership required" });
      if (payload.action === "presence") {
        if (!process.env.LIVEKIT_API_KEY || !process.env.LIVEKIT_API_SECRET) return res.json({ channels: {} });
        const channels = listCommunityChannels(communityId).filter((channel) => channel.kind === "voice");
        const lk = new LiveKitAPI({ host: livekitInternalUrl.replace(/^ws/, "http"), apiKey: process.env.LIVEKIT_API_KEY.trim(), secret: process.env.LIVEKIT_API_SECRET.trim() });
        const entries = await Promise.all(channels.map(async (channel) => {
          const participants = await lk.room.listParticipants(`voice:${communityId}:${channel.id}`);
          return [channel.id, participants.map((participant) => {
            const tracks = participant.tracks || [];
            const identity = String(participant.identity || "");
            return { identity: identity.includes("#") ? identity : `${identity}#${federationDomain()}`, name: participant.name, camera: tracks.some((track) => track.source === 1 && !track.muted), screen: tracks.some((track) => track.source === 3 && !track.muted), muted: tracks.some((track) => track.source === 2 && track.muted) };
          })];
        }));
        return res.json({ channels: Object.fromEntries(entries) });
      }
      const channel = findChannel(channelId);
      if (!channel || channel.community_id !== communityId || channel.kind !== "voice") return res.status(404).json({ error: "Voice channel not found" });
      if (payload.action !== "token") return res.status(400).json({ error: "Unsupported voice action" });
      if (!process.env.LIVEKIT_API_KEY || !process.env.LIVEKIT_API_SECRET) return res.status(503).json({ error: "LiveKit is not configured" });
      const roomName = `voice:${communityId}:${channelId}`;
      const token = new AccessToken(process.env.LIVEKIT_API_KEY.trim(), process.env.LIVEKIT_API_SECRET.trim(), { identity: userGlobalId, name: String(payload.display_name || "Remote user").slice(0, 80), ttl: "2h" });
      token.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true });
      return res.json({ token: await token.toJwt(), url: livekitPublicUrl, room: roomName });
    } catch (error) {
      if (error.status === 429) res.set("retry-after", "60");
      return res.status(error.status || 400).json({ error: error.message });
    }
  });
  app.get("/api/v1/federation/identities/:id", (req, res) => {
    const identity = findPublicUser(req.params.id);
    if (!identity) return res.status(404).json({ error: "Identity not found" });
    const profile = publicProfile(identity);
    return res.json({ identity: {
      ...profile,
      avatar_url: federatedAssetUrl(profile.avatar_url),
      banner_url: federatedAssetUrl(profile.banner_url),
      dm_public_key: identity.dm_public_key || "",
    } });
  });
  app.get("/api/v1/federation/memberships", requireUser, (req, res) =>
    res.json({ communities: listRemoteCommunitiesForUser(`${req.user.id}#${federationDomain()}`) }));
  app.post("/api/v1/federation/memberships", requireUser, async (req, res) => {
    try {
      const event = await createRemoteJoin(req.user, req.body?.address);
      return res.status(202).json({ status: "pending", event_id: event.event_id });
    } catch (error) { return res.status(400).json({ error: error.message }); }
  });
  app.get("/api/v1/home/federated", requireUser, async (_req, res, next) => {
    try {
      const remote = await aggregateFederatedHome(listPeers());
      const localSource = {
        peer_id: null,
        domain: homeServer,
        name: getInstanceSettings().name,
      };
      const posts = listSocialPosts().map((post) => ({
        ...post,
        source: localSource,
      }));
      const items = listPublishedItems().map((item) => ({
        ...item,
        source: localSource,
      }));
      res.json({
        posts: [...posts, ...remote.posts].sort(
          (a, b) => new Date(b.created_at) - new Date(a.created_at),
        ),
        items: [...items, ...remote.items].sort(
          (a, b) => new Date(b.created_at) - new Date(a.created_at),
        ),
        communities: remote.communities,
        sources: [localSource, ...remote.sources],
        unavailable: remote.unavailable,
      });
    } catch (error) {
      next(error);
    }
  });
  app.post("/api/v1/home/posts", requireUser, (req, res) => {
    const body = String(req.body?.body || "")
      .trim()
      .slice(0, 1000);
    if (!body) return res.status(400).json({ error: "Status cannot be empty" });
    return res.status(201).json({
      post: createSocialPost({ id: randomUUID(), userId: req.user.id, body, attachments: Array.isArray(req.body?.attachments) ? req.body.attachments.slice(0, 8) : [], replyTo: req.body?.replyTo || null }),
    });
  });
  app.post("/api/v1/home/posts/:id/boost", requireUser, (req, res) => boostSocialPost(req.params.id) ? res.json({ ok: true }) : res.status(404).json({ error: "Post not found" }));
  app.post("/api/v1/home/posts/:id/attachments", requireUser, (req, res) => {
    messageFileUpload.single("file")(req, res, (error) => {
      if (error) return res.status(400).json({ error: error.message });
      if (!req.file) return res.status(400).json({ error: "Choose an image or file" });
      const asset = storeAsset(uploadsDirectory, { buffer: req.file.buffer, mimeType: req.file.mimetype, kind: "pulse-attachment", ownerUserId: req.user.id });
      return res.status(201).json({ attachment: { id: asset.id, url: `/api/v1/assets/${asset.id}`, name: req.file.originalname, mimeType: req.file.mimetype } });
    });
  });
  app.get("/api/v1/home/published", requireUser, (req, res) => {
    const kind = ["theme", "decoration", "profile-theme"].includes(
      req.query.kind,
    )
      ? req.query.kind
      : null;
    return res.json({ items: listPublishedItems(kind) });
  });
  app.post("/api/v1/home/published", requireUser, (req, res) => {
    const kind = ["theme", "decoration", "profile-theme"].includes(
        req.body?.kind,
      )
        ? req.body.kind
        : null,
      name = String(req.body?.name || "")
        .trim()
        .slice(0, 80),
      description = String(req.body?.description || "")
        .trim()
        .slice(0, 500),
      candidatePayload =
        req.body?.payload && typeof req.body.payload === "object"
          ? req.body.payload
          : {},
      payload =
        JSON.stringify(candidatePayload).length <= 10000
          ? candidatePayload
          : {};
    if (!kind || !name)
      return res
        .status(400)
        .json({ error: "A valid type and name are required" });
    return res.status(201).json({
      item: createPublishedItem({
        id: randomUUID(),
        userId: req.user.id,
        kind,
        name,
        description,
        payload,
      }),
    });
  });
  app.post("/api/v1/home/published/assets", requireUser, (req, res) => {
    upload.single("image")(req, res, (error) => {
      if (error) return res.status(400).json({ error: error.message });
      if (!req.file || !detectedImageExtension(req.file.buffer))
        return res
          .status(400)
          .json({ error: "Choose a valid PNG, JPG, or GIF" });
      const asset = storeAsset(uploadsDirectory, {
        buffer: req.file.buffer,
        mimeType: req.file.mimetype,
        kind: "published-decoration",
        ownerUserId: req.user.id,
      });
      return res.status(201).json({
        asset: { id: asset.id, url: `/api/v1/assets/${asset.id}` },
      });
    });
  });
  app.get("/api/v1/users/@me/collection", requireUser, (req, res) =>
    res.json({ collection: listUserCollection(req.user.id) }),
  );
  app.put("/api/v1/users/@me/collection/:itemId", requireUser, (req, res) =>
    res.json({ item: addUserCollectionItem(req.user.id, req.params.itemId) }),
  );
  app.delete("/api/v1/users/@me/collection/:itemId", requireUser, (req, res) =>
    removeUserCollectionItem(req.user.id, req.params.itemId)
      ? res.status(204).end()
      : res.status(404).json({ error: "Collection item not found" }),
  );
  app.get("/api/v1/emojis", async (req, res) => {
    const viewer = getUser(req);
    const remote = viewer && req.query.guildId ? remoteCommunityFor(viewer.id, req.query.guildId) : null;
    if (remote) {
      let guildEmojis = remote.state?.guild_emojis || [];
      // Older snapshots did not contain emoji metadata. Fetch it from the
      // owner so existing federated memberships do not need to be recreated.
      if (!guildEmojis.length) {
        try {
          const peer = findPeerByDomain(remote.origin);
          const response = peer && await federationFetch(peer, `/api/v1/emojis?guildId=${encodeURIComponent(remote.remote_id)}`, { headers: { accept: "application/json" } });
          if (response?.ok) {
            const payload = await response.json();
            guildEmojis = (payload.guild_emojis || []).map((emoji) => ({ ...emoji, url: emoji.url ? new URL(emoji.url, peer.base_url).href : emoji.url }));
          }
        } catch { /* stale peer or empty emoji set */ }
      }
      return res.json({ emojis: listInstanceEmojis(), guild_emojis: guildEmojis, instance: getInstanceSettings().name });
    }
    return res.json({
      emojis: listInstanceEmojis(),
      guild_emojis: req.query.guildId ? listGuildEmojis(req.query.guildId) : [],
      instance: getInstanceSettings().name,
    });
  });
  app.get("/api/v1/stickers", async (req, res) => {
    const viewer = getUser(req);
    const remote = viewer && req.query.guildId ? remoteCommunityFor(viewer.id, req.query.guildId) : null;
    if (remote) {
      let guildStickers = remote.state?.guild_stickers || [];
      if (!guildStickers.length) {
        try {
          const peer = findPeerByDomain(remote.origin);
          const response = peer && await federationFetch(peer, `/api/v1/stickers?guildId=${encodeURIComponent(remote.remote_id)}`, { headers: { accept: "application/json" } });
          if (response?.ok) {
            const payload = await response.json();
            guildStickers = (payload.guild_stickers || []).map((sticker) => ({ ...sticker, url: sticker.url ? new URL(sticker.url, peer.base_url).href : sticker.url }));
          }
        } catch { /* stale peer or empty sticker set */ }
      }
      return res.json({ stickers: [], guild_stickers: guildStickers });
    }
    return res.json({ stickers: [], guild_stickers: req.query.guildId ? listGuildStickers(req.query.guildId) : [] });
  });
  app.post("/api/v1/admin/emojis", requireAdmin, (req, res) => {
    if (req.user.role !== "owner")
      return res.status(403).json({ error: "Instance owner access required" });
    upload.single("image")(req, res, (error) => {
      if (error) return res.status(400).json({ error: error.message });
      const name = String(req.body?.name || "")
        .trim()
        .toLowerCase();
      if (!/^[a-z0-9_]{2,32}$/.test(name))
        return res.status(400).json({
          error: "Emoji names use 2-32 letters, numbers, or underscores",
        });
      if (!req.file || !detectedImageExtension(req.file.buffer))
        return res
          .status(400)
          .json({ error: "Choose a valid PNG, JPG, or GIF" });
      try {
        const asset = storeAsset(uploadsDirectory, {
          buffer: req.file.buffer,
          mimeType: req.file.mimetype,
          kind: "emoji",
          ownerUserId: req.user.id,
        });
        return res.status(201).json({
          emoji: createInstanceEmoji({
            id: randomUUID(),
            name,
            assetId: asset.id,
            creatorId: req.user.id,
          }),
        });
      } catch {
        return res
          .status(409)
          .json({ error: "That emoji name already exists" });
      }
    });
  });
  app.delete("/api/v1/admin/emojis/:id", requireAdmin, (req, res) => {
    if (req.user.role !== "owner")
      return res.status(403).json({ error: "Instance owner access required" });
    return deleteInstanceEmoji(req.params.id)
      ? res.status(204).end()
      : res.status(404).json({ error: "Emoji not found" });
  });
  app.post(
    "/api/v1/guilds/:id/emojis",
    requireUser,
    requireGuildPermission(Permissions.MANAGE_GUILD),
    (req, res) => {
      upload.single("image")(req, res, (error) => {
        if (error) return res.status(400).json({ error: error.message });
        const name = String(req.body?.name || "")
          .trim()
          .toLowerCase();
        if (!/^[a-z0-9_]{2,32}$/.test(name))
          return res.status(400).json({
            error: "Emoji names use 2-32 letters, numbers, or underscores",
          });
        if (!req.file || !detectedImageExtension(req.file.buffer))
          return res
            .status(400)
            .json({ error: "Choose a valid PNG, JPG, or GIF" });
        try {
          const asset = storeAsset(uploadsDirectory, {
            buffer: req.file.buffer,
            mimeType: req.file.mimetype,
            kind: "guild-emoji",
            ownerUserId: req.user.id,
          });
          return res.status(201).json({
            emoji: createInstanceEmoji({
              id: randomUUID(),
              name,
              assetId: asset.id,
              creatorId: req.user.id,
              guildId: req.params.id,
            }),
          });
        } catch {
          return res
            .status(409)
            .json({ error: "That emoji name already exists" });
        }
      });
    },
  );
  app.delete(
    "/api/v1/guilds/:id/emojis/:emojiId",
    requireUser,
    requireGuildPermission(Permissions.MANAGE_GUILD),
    (req, res) =>
      deleteInstanceEmoji(req.params.emojiId, req.params.id)
        ? res.status(204).end()
        : res.status(404).json({ error: "Emoji not found" }),
  );
  app.post(
    "/api/v1/guilds/:id/stickers",
    requireUser,
    requireGuildPermission(Permissions.MANAGE_GUILD),
    (req, res) => {
      upload.single("image")(req, res, (error) => {
        if (error) return res.status(400).json({ error: error.message });
        const name = String(req.body?.name || "").trim().toLowerCase();
        if (!/^[a-z0-9_]{2,32}$/.test(name))
          return res.status(400).json({ error: "Sticker names use 2-32 letters, numbers, or underscores" });
        if (!req.file || !detectedImageExtension(req.file.buffer))
          return res.status(400).json({ error: "Choose a valid PNG, JPG, or GIF" });
        try {
          const asset = storeAsset(uploadsDirectory, {
            buffer: req.file.buffer,
            mimeType: req.file.mimetype,
            kind: "guild-sticker",
            ownerUserId: req.user.id,
          });
          return res.status(201).json({ sticker: createGuildSticker({
            id: randomUUID(), name, assetId: asset.id, creatorId: req.user.id, guildId: req.params.id,
          }) });
        } catch {
          return res.status(409).json({ error: "That sticker name already exists in this community" });
        }
      });
    },
  );
  app.delete(
    "/api/v1/guilds/:id/stickers/:stickerId",
    requireUser,
    requireGuildPermission(Permissions.MANAGE_GUILD),
    (req, res) => deleteGuildSticker(req.params.stickerId, req.params.id)
      ? res.status(204).end()
      : res.status(404).json({ error: "Sticker not found" }),
  );
  app.patch("/api/v1/admin/instance", requireAdmin, (req, res) => {
    const current = getInstanceSettings(),
      body = req.body || {},
      next = {
        name: String(body.name ?? current.name)
          .trim()
          .slice(0, 80),
        shortDescription: String(
          body.shortDescription ?? current.shortDescription,
        )
          .trim()
          .slice(0, 160),
        description: String(body.description ?? current.description)
          .trim()
          .slice(0, 4000),
        contactEmail: String(body.contactEmail ?? current.contactEmail)
          .trim()
          .slice(0, 254),
        rules: Array.isArray(body.rules)
          ? body.rules
              .map((x) => String(x).trim().slice(0, 500))
              .filter(Boolean)
              .slice(0, 50)
          : current.rules,
        registrations: ["open", "approval", "invite", "closed"].includes(
          body.registrations,
        )
          ? body.registrations
          : current.registrations,
        federationMode: ["open", "allowlist", "closed"].includes(
          body.federationMode,
        )
          ? body.federationMode
          : current.federationMode,
        maxUploadMb: Math.max(
          1,
          Math.min(100, Number(body.maxUploadMb ?? current.maxUploadMb)),
        ),
        retentionDays: Math.max(
          0,
          Math.min(3650, Number(body.retentionDays ?? current.retentionDays)),
        ),
        accentColor: /^#[0-9a-f]{6}$/i.test(body.accentColor)
          ? body.accentColor
          : current.accentColor,
      };
    if (!next.name)
      return res.status(400).json({ error: "Instance name is required" });
    res.json(saveInstanceSettings(next));
  });
  app.get("/api/v1/admin/users", requireAdmin, (_req, res) =>
    res.json({ users: listUsers() }),
  );
  app.patch("/api/v1/admin/users/:id", requireAdmin, (req, res) => {
    const role = ["admin", "member"].includes(req.body?.role)
        ? req.body.role
        : "member",
      updated = setUserAdministration(req.params.id, {
        role,
        suspended: Boolean(req.body?.suspended),
      });
    return updated
      ? res.json({ user: updated })
      : res.status(404).json({ error: "User not found" });
  });
  app.get("/api/v1/admin/moderation", requireAdmin, (_req, res) =>
    res.json({ bans: listInstanceBans(), reports: listInstanceReports(), actions: listInstanceModerationActions(), system_user: publicProfile(getSystemUser()) }));
  app.post("/api/v1/admin/moderation/users/:id/ban", requireAdmin, (req, res) => {
    const target = findPublicUser(req.params.id), reason = String(req.body?.reason || "").trim().slice(0, 1000);
    if (!target) return res.status(404).json({ error: "User not found" });
    if (target.role === "owner" || (target.role === "admin" && req.user.role !== "owner"))
      return res.status(403).json({ error: "Only the instance owner can moderate administrators, and the owner cannot be banned" });
    if (!reason) return res.status(400).json({ error: "A ban reason is required" });
    const expiresAt = req.body?.expiresAt ? new Date(req.body.expiresAt) : null;
    if (expiresAt && (!Number.isFinite(expiresAt.getTime()) || expiresAt <= new Date()))
      return res.status(400).json({ error: "Ban expiry must be a future date" });
    const ban = banInstanceUser(target.id, reason, req.user.id, expiresAt?.toISOString() || null);
    if (!ban) return res.status(403).json({ error: "That account cannot be banned" });
    moderationEvents.emit("account:banned", { userId: target.id, reason });
    return res.status(201).json({ ban });
  });
  app.delete("/api/v1/admin/moderation/users/:id/ban", requireAdmin, (req, res) =>
    unbanInstanceUser(req.params.id, req.user.id) ? res.status(204).end() : res.status(404).json({ error: "Active ban not found" }));
  app.post("/api/v1/admin/moderation/users/:id/message", requireAdmin, (req, res) => {
    const body = String(req.body?.body || "").trim().slice(0, 12000), subject = String(req.body?.subject || "Instance moderation").trim().slice(0, 120);
    if (!body) return res.status(400).json({ error: "A message is required" });
    try {
      const message = createSystemDirectMessage(req.params.id, body, req.user.id, subject || "Instance moderation");
      moderationEvents.emit("system-message", { recipientId: req.params.id, message });
      return res.status(201).json({ message });
    } catch (error) { return res.status(404).json({ error: error.message }); }
  });
  app.patch("/api/v1/admin/moderation/reports/:id", requireAdmin, (req, res) => {
    const status = ["open", "reviewing", "actioned", "dismissed"].includes(req.body?.status) ? req.body.status : null;
    if (!status) return res.status(400).json({ error: "Invalid report status" });
    const report = updateInstanceReport(req.params.id, status, String(req.body?.resolution || "").slice(0, 2000), req.user.id);
    return report ? res.json({ report }) : res.status(404).json({ error: "Report not found" });
  });
  const remoteGuildsFor = (userId) => listRemoteCommunitiesForUser(`${userId}#${federationDomain()}`).map((remote) => ({
    ...remote.state, id: remote.global_id, global_id: remote.global_id, address: remote.address,
    remote: true, origin: remote.origin, membership_status: remote.status,
  }));
  app.get("/api/v1/guilds", requireUser, (_req, res) =>
    res.json({ guilds: [...listCommunities(_req.user.id), ...remoteGuildsFor(_req.user.id)] }),
  );
  app.get("/api/v1/discovery/communities", requireUser, async (_req, res, next) => {
    try {
      const remote = await aggregateFederatedHome(listPeers());
      const memberships = new Map(remoteGuildsFor(_req.user.id).map((community) => [community.address, community.membership_status]));
      const local = listCommunities().map((community) => ({
        ...community,
        address: communityAddress(community, _req),
        remote: false,
      }));
      res.json({ communities: [...local, ...remote.communities.map((community) => ({ ...community, membership_status: memberships.get(community.address) || "" }))], unavailable: remote.unavailable });
    } catch (error) {
      next(error);
    }
  });
  app.post("/api/v1/guilds/import-discord-template/preview", requireUser, async (req, res, next) => {
    try {
      const template = await fetchDiscordTemplate(req.body?.url);
      const source = template.serialized_source;
      const channels = source.channels || [];
      res.json({ template: { code: template.code, name: template.name, description: template.description, roles: source.roles.length, categories: channels.filter((channel) => Number(channel.type) === 4).length, channels: channels.filter((channel) => Number(channel.type) !== 4).length, channelTypes: Object.fromEntries([...new Set(channels.filter((channel) => Number(channel.type) !== 4).map((channel) => Number(channel.type)))].map((type) => [type, channels.filter((channel) => Number(channel.type) === type).length])) } });
    } catch (error) { next(error); }
  });
  app.post("/api/v1/guilds/import-discord-template", requireUser, async (req, res, next) => {
    try {
      const template = await fetchDiscordTemplate(req.body?.url);
      const guild = importDiscordTemplate({ ownerId: req.user.id, name: String(req.body?.name || template.name).trim().slice(0, 80), description: String(req.body?.description ?? template.description).trim().slice(0, 500), source: template });
      res.status(201).json({ guild: { ...guild, address: communityAddress(guild, req) } });
    } catch (error) { next(error); }
  });
  app.post("/api/v1/guilds", requireUser, (req, res) => {
    const name = String(req.body?.name || "")
        .trim()
        .slice(0, 80),
      description = String(req.body?.description || "")
        .trim()
        .slice(0, 500);
    if (!name) return res.status(400).json({ error: "Guild name is required" });
    const guild = createCommunity({
      id: randomUUID(),
      name,
      description,
      ownerId: req.user.id,
      profile: { accessMode: req.body?.accessMode === "invite" ? "invite" : "open" },
    });
    initializeGuildAccess(guild.id, req.user.id, randomUUID());
    const general = createChannel({
      id: randomUUID(),
      communityId: guild.id,
      name: "general",
      kind: "text",
    });
    res.status(201).json({ guild: { ...guild, address: communityAddress(guild, req), channels: [general] } });
  });
  app.patch("/api/v1/guilds/:id", requireUser, (req, res) => {
    const current = findCommunity(req.params.id);
    if (!current) return res.status(404).json({ error: "Guild not found" });
    if (
      current.owner_id !== req.user.id &&
      !["owner", "admin"].includes(req.user.role)
    )
      return res
        .status(403)
        .json({ error: "Guild management permission required" });
    const name = String(req.body?.name ?? current.name)
        .trim()
        .slice(0, 80),
      description = String(req.body?.description ?? current.description)
        .trim()
        .slice(0, 500);
    const oldProfile =
        typeof current.profile === "string"
          ? JSON.parse(current.profile || "{}")
          : {},
      inputProfile = req.body?.profile || oldProfile,
      profile = {
        accessMode: inputProfile.accessMode === "invite" ? "invite" : "open",
        bannerColor: /^#[0-9a-f]{6}$/i.test(inputProfile.bannerColor)
          ? inputProfile.bannerColor
          : "#7857ff",
        memberTag: String(inputProfile.memberTag || "")
          .trim()
          .slice(0, 12),
        memberTagEmoji: String(inputProfile.memberTagEmoji || "")
          .trim()
          .slice(0, 16),
        traits: Array.isArray(inputProfile.traits)
          ? inputProfile.traits
              .map((value) => String(value).trim().slice(0, 30))
              .filter(Boolean)
              .slice(0, 5)
          : [],
        safety: {
          mediaFilter: inputProfile.safety?.mediaFilter !== false,
          requireVerifiedEmail:
            inputProfile.safety?.requireVerifiedEmail !== false,
          blockMentionSpam: inputProfile.safety?.blockMentionSpam !== false,
        },
        onboarding: {
          enabled: Boolean(inputProfile.onboarding?.enabled),
          welcome: String(inputProfile.onboarding?.welcome || "")
            .trim()
            .slice(0, 500),
          defaultChannelId: String(
            inputProfile.onboarding?.defaultChannelId || "",
          ).slice(0, 64),
        },
        atmosphere: {
          mode: ["gradient", "image", "solid"].includes(
            inputProfile.atmosphere?.mode,
          )
            ? inputProfile.atmosphere.mode
            : "gradient",
          start: /^#[0-9a-f]{6}$/i.test(inputProfile.atmosphere?.start)
            ? inputProfile.atmosphere.start
            : "#071426",
          end: /^#[0-9a-f]{6}$/i.test(inputProfile.atmosphere?.end)
            ? inputProfile.atmosphere.end
            : "#32145f",
          angle: Math.max(
            0,
            Math.min(360, Number(inputProfile.atmosphere?.angle) || 135),
          ),
          backgroundUrl: imageUrl(inputProfile.atmosphere?.backgroundUrl) || "",
          glass: Math.max(
            35,
            Math.min(95, Number(inputProfile.atmosphere?.glass) || 72),
          ),
        },
      };
    if (!name) return res.status(400).json({ error: "Guild name is required" });
    res.json({
      guild: updateCommunity(current.id, {
        name,
        description,
        iconAssetId: current.icon_asset_id,
        bannerAssetId: current.banner_asset_id,
        profile,
      }),
    });
  });
  app.post("/api/v1/communities/join", requireUser, async (req, res) => {
    const address = String(req.body?.address || "").trim().toLowerCase();
    const match = address.match(/^([^#]+)#([^#]+)$/);
    if (!match) return res.status(400).json({ error: "Use a community address such as woof#chat.example.com" });
    const [, reference, destination] = match;
    const localDomain = String(process.env.FEDERATION_DOMAIN || req.get("host")).toLowerCase();
    if (destination !== localDomain && destination !== String(req.get("host") || "").toLowerCase()) {
      try {
        const event = await createRemoteJoin(req.user, address);
        return res.status(202).json({ status: "pending", event_id: event.event_id, remote: true });
      } catch (error) { return res.status(400).json({ error: error.message }); }
    }
    const community = findCommunityByReference(reference);
    if (!community) return res.status(404).json({ error: "Community not found" });
    const profile = typeof community.profile === "string" ? JSON.parse(community.profile || "{}") : (community.profile || {});
    if (profile.accessMode === "invite") return res.status(403).json({ error: "This community is invite only" });
    ensureGuildMember(community.id, req.user.id);
    return res.json({ status: "joined", guild_id: community.id });
  });
  app.post(
    "/api/v1/guilds/:id/background",
    requireUser,
    requireGuildPermission(Permissions.MANAGE_GUILD),
    (req, res) => {
      upload.single("image")(req, res, (error) => {
        if (error) return res.status(400).json({ error: error.message });
        if (!req.file || !detectedImageExtension(req.file.buffer))
          return res
            .status(400)
            .json({ error: "Choose a valid PNG, JPG, or GIF background" });
        const current = findCommunity(req.params.id);
        if (!current) return res.status(404).json({ error: "Guild not found" });
        const asset = storeAsset(uploadsDirectory, {
          buffer: req.file.buffer,
          mimeType: req.file.mimetype,
          kind: "guild-background",
          ownerUserId: req.user.id,
        });
        const profile = JSON.parse(current.profile || "{}");
        profile.atmosphere = {
          ...(profile.atmosphere || {}),
          mode: "image",
          backgroundUrl: `/api/v1/assets/${asset.id}`,
        };
        return res.json({
          guild: updateCommunity(current.id, {
            name: current.name,
            description: current.description,
            iconAssetId: current.icon_asset_id,
            bannerAssetId: current.banner_asset_id,
            profile,
          }),
        });
      });
    },
  );
  app.post(
    "/api/v1/guilds/:id/media/:kind",
    requireUser,
    requireGuildPermission(Permissions.MANAGE_GUILD),
    (req, res) => {
      const kind = String(req.params.kind || "");
      if (!["icon", "banner"].includes(kind)) return res.status(400).json({ error: "Unsupported community image" });
      upload.single("image")(req, res, (error) => {
        if (error) return res.status(400).json({ error: error.message });
        if (!req.file || !detectedImageExtension(req.file.buffer)) return res.status(400).json({ error: "Choose a valid PNG, JPG, or GIF image" });
        const current = findCommunity(req.params.id);
        if (!current) return res.status(404).json({ error: "Guild not found" });
        const asset = storeAsset(uploadsDirectory, { buffer: req.file.buffer, mimeType: req.file.mimetype, kind: `guild-${kind}`, ownerUserId: req.user.id });
        const guild = updateCommunity(current.id, {
          name: current.name,
          description: current.description,
          iconAssetId: kind === "icon" ? asset.id : current.icon_asset_id,
          bannerAssetId: kind === "banner" ? asset.id : current.banner_asset_id,
          profile: JSON.parse(current.profile || "{}"),
        });
        return res.json({ guild, asset: { id: asset.id, url: `/api/v1/assets/${asset.id}` } });
      });
    },
  );
  app.delete("/api/v1/guilds/:id", requireUser, (req, res) => {
    const current = findCommunity(req.params.id);
    if (!current) return res.status(404).json({ error: "Guild not found" });
    if (
      current.owner_id !== req.user.id &&
      !["owner", "admin"].includes(req.user.role)
    )
      return res
        .status(403)
        .json({ error: "Guild management permission required" });
    removeCommunity(current.id);
    res.status(204).end();
  });
  app.post("/api/v1/guilds/:id/channels", requireUser, requireGuildPermission(Permissions.MANAGE_CHANNELS), (req, res) => {
    const name = String(req.body?.name || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "-")
        .slice(0, 80),
      kind = ["text", "voice"].includes(req.body?.kind) ? req.body.kind : null,
      rolePicker = Boolean(req.body?.rolePicker) && req.body?.kind === "text";
    if (!name || !kind)
      return res
        .status(400)
        .json({ error: "Valid channel name and kind are required" });
    try {
      return res.status(201).json({
        channel: createChannel({
          id: randomUUID(),
          communityId: req.params.id,
          name,
          kind,
          rolePickerEnabled: rolePicker,
        }),
      });
    } catch {
      return res.status(404).json({ error: "Guild not found" });
    }
  });
  app.put(
    "/api/v1/guilds/:id/channels/order",
    requireUser,
    requireGuildPermission(Permissions.MANAGE_CHANNELS),
    (req, res) => {
      try {
        return res.json({ channels: reorderChannels(req.params.id, req.body?.channels) });
      } catch (error) {
        return res.status(400).json({ error: error.message });
      }
    },
  );
  app.patch(
    "/api/v1/channels/:id",
    requireUser,
    requireGuildPermission(
      Permissions.MANAGE_CHANNELS,
      (req) => findChannel(req.params.id)?.community_id,
    ),
    (req, res) => {
      const name = String(req.body?.name || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "-")
        .slice(0, 80);
      if (!name)
        return res.status(400).json({ error: "Channel name is required" });
      const channel = updateChannel(req.params.id, {
        name,
        categoryId: req.body?.categoryId || null,
        topic: String(req.body?.topic || "").slice(0, 1024),
        slowmodeSeconds: Math.max(
          0,
          Math.min(21600, Number(req.body?.slowmodeSeconds) || 0),
        ),
        contentVisibility: ["default", "spoiler", "age-restricted"].includes(
          req.body?.contentVisibility,
        )
          ? req.body.contentVisibility
          : "default",
        announcement: Boolean(req.body?.announcement),
        nsfw: Boolean(req.body?.nsfw),
        voiceCodec: String(req.body?.voiceCodec || "opus").toLowerCase(),
        voiceBitrate: Math.max(24000, Math.min(320000, Number(req.body?.voiceBitrate) || 64000)),
        voiceSampleRate: [8000, 16000, 24000, 32000, 44100, 48000].includes(Number(req.body?.voiceSampleRate)) ? Number(req.body.voiceSampleRate) : 48000,
        position: Number(req.body?.position) || 0,
        e2eeEnabled: Boolean(req.body?.e2eeEnabled),
      });
      return channel
        ? res.json({ channel })
        : res.status(404).json({ error: "Channel not found" });
    },
  );
  app.delete(
    "/api/v1/channels/:id",
    requireUser,
    requireGuildPermission(
      Permissions.MANAGE_CHANNELS,
      (req) => findChannel(req.params.id)?.community_id,
    ),
    (req, res) =>
      deleteChannel(req.params.id)
        ? res.status(204).end()
        : res.status(404).json({ error: "Channel not found" }),
  );
  app.get("/api/v1/channels/:id/role-picker", requireUser, async (req, res) => {
    const remote = remoteChannelFor(req.user.id, req.params.id);
    if (remote) return res.json({ categories: typeof remote.channel.role_picker === "string" ? JSON.parse(remote.channel.role_picker || "[]") : (remote.channel.role_picker || []), role_ids: remote.remote.roles || [] });
    const channel = findChannel(req.params.id);
    if (!channel || !channel.role_picker_enabled || !isGuildMember(channel.community_id, req.user.id)) return res.status(404).json({ error: "Role picker not found" });
    return res.json({ categories: listChannelRolePicker(channel.id), role_ids: listUserGuildRoles(channel.community_id, req.user.id).map((role) => role.id) });
  });
  app.put("/api/v1/channels/:id/role-picker", requireUser, requireGuildPermission(Permissions.MANAGE_ROLES, (req) => findChannel(req.params.id)?.community_id), (req, res) => {
    const channel = findChannel(req.params.id);
    if (!channel || channel.kind !== "text" || !channel.role_picker_enabled) return res.status(404).json({ error: "Role picker not found" });
    const source = Array.isArray(req.body?.categories) ? req.body.categories.slice(0, 20) : [];
    const roles = new Set(listGuildRoles(channel.community_id).filter((role) => !role.managed).map((role) => String(role.id)));
    const categories = source.map((category) => ({ id: String(category.id || randomUUID()), name: String(category.name || "Roles").trim().slice(0, 80), role_ids: [...new Set((Array.isArray(category.role_ids) ? category.role_ids : []).map(String))].filter((id) => roles.has(id)).slice(0, 100) })).filter((category) => category.name);
    return res.json({ channel: saveChannelRolePicker(channel.id, categories), categories });
  });
  app.post("/api/v1/channels/:id/role-picker/roles/:roleId", requireUser, async (req, res) => {
    const remote = remoteChannelFor(req.user.id, req.params.id);
    if (remote) {
      try { return res.json(await requestRemoteChannel(req, req.params.id, "role-picker.toggle", { role_id: req.params.roleId })); }
      catch (error) { return res.status(400).json({ error: error.message }); }
    }
    const channel = findChannel(req.params.id);
    if (!channel || !channel.role_picker_enabled || !isGuildMember(channel.community_id, req.user.id)) return res.status(404).json({ error: "Role picker not found" });
    try { return res.json({ role_ids: toggleRolePickerRole(channel.community_id, channel.id, req.user.id, req.params.roleId) }); }
    catch (error) { return res.status(400).json({ error: error.message }); }
  });
  app.get("/api/v1/guilds/:id/members", requireUser, async (req, res) => {
    const remote = remoteCommunityFor(req.user.id, req.params.id);
    if (remote) {
      let remoteState = remote.state || {};
      // Refresh the public snapshot when the member list is opened. This lets
      // existing federated memberships converge on profile metadata added by
      // newer peers without requiring users to leave and rejoin.
      try {
        const peer = findPeerByDomain(remote.origin);
        const response = peer && await federationFetch(peer, `/api/v1/federation/communities/${encodeURIComponent(remote.remote_id)}`, { headers: { accept: "application/json" } });
        if (response?.ok) {
          const snapshot = (await response.json()).community;
          if (snapshot?.id) remoteState = saveRemoteCommunity(snapshot, remote.origin, Number(remote.revision || 0)).state || remoteState;
        }
      } catch { /* retain the most recently synchronized snapshot */ }
      const remoteBase = findPeerByDomain(remote.origin)?.base_url || `https://${remote.origin}`;
      const remoteAsset = (value) => {
        if (!value) return "";
        try { return new URL(value, `${String(remoteBase).replace(/\/$/, "")}/`).href; } catch { return value; }
      };
      const memberIdentities = Array.isArray(remoteState.member_identities) && remoteState.member_identities.length
        ? remoteState.member_identities
        : (remoteState.remote_members || []).map((member) => ({ global_id: member.global_id, joined_at: member.joined_at, roles: member.roles || [] }));
      const members = memberIdentities.map((member) => {
        const globalId = member.global_id || `${member.id}#${member.origin || remote.origin}`;
        const identity = findRemoteIdentity(globalId);
        const profile = member.profile || identity?.profile || {};
        return {
          id: globalId,
          user_id: globalId,
          username: member.username || identity?.username || globalId,
          display_name: member.display_name || identity?.display_name || identity?.username || globalId,
          avatar_url: remoteAsset(member.avatar_url || identity?.avatar_url),
          banner_url: remoteAsset(member.banner_url || identity?.banner_url),
          bio: profile.bio || "",
          accent_color: profile.accent_color || "#62efc6",
          profile_css: profile.profile_css || "",
          server_tag_selection: profile.server_tag_selection || profile.serverTag || null,
          presence_status: profile.status || "online",
          status_text: profile.status_text || profile.statusText || "",
          decoration_id: profile.decoration_id || profile.selectedDecorationId || "",
          profile_theme_id: profile.profile_theme_id || profile.selectedProfileThemeId || "",
          username_style_ids: profile.username_style_ids || profile.selectedUsernameStyleIds || [],
          joined_at: member.joined_at || null,
          remote: true,
          roles: (member.roles || []).map((roleId) => (remoteState.roles || []).find((role) => String(role.id) === String(roleId))).filter(Boolean),
        };
      });
      return res.json({ members });
    }
    return isGuildMember(req.params.id, req.user.id)
      ? res.json({ members: listGuildMembers(req.params.id).map((member) => ({ ...member, roles: member.remote ? member.roles : listUserGuildRoles(req.params.id, member.id) })) })
      : res.status(403).json({ error: "Join this community first" });
  });
  app.delete("/api/v1/guilds/:id/members/@me", requireUser, async (req, res) => {
    const remote = remoteCommunityFor(req.user.id, req.params.id);
    if (remote) {
      try {
        const event = await createRemoteLeave(req.user, remote);
        return res.status(202).json({ status: "leaving", event_id: event.event_id });
      } catch (error) { return res.status(400).json({ error: error.message }); }
    }
    return removeGuildMember(req.params.id, req.user.id)
      ? res.status(204).end()
      : res.status(404).json({ error: "Membership not found" });
  });
  app.get("/api/v1/guilds/:id/roles", requireUser, (req, res) => {
    const remote = remoteCommunityFor(req.user.id, req.params.id);
    if (remote) return res.json({ roles: remote.state?.roles || [] });
    return isGuildMember(req.params.id, req.user.id)
      ? res.json({ roles: listGuildRoles(req.params.id) })
      : res.status(403).json({ error: "Join this community first" });
  });
  app.post(
    "/api/v1/guilds/:id/roles",
    requireUser,
    requireGuildPermission(Permissions.MANAGE_ROLES),
    (req, res) => {
      const name = String(req.body?.name || "New role")
          .trim()
          .slice(0, 80),
        color = /^#[0-9a-f]{6}$/i.test(req.body?.color)
          ? req.body.color
          : "#99aab5",
        permissions = String(req.body?.permissions || "0");
      res.status(201).json({
        role: createGuildRole({
          id: randomUUID(),
          guildId: req.params.id,
          name,
          color,
          permissions,
          position: Number(req.body?.position) || 1,
        }),
      });
    },
  );
  app.patch(
    "/api/v1/guilds/:id/roles/:roleId",
    requireUser,
    requireGuildPermission(Permissions.MANAGE_ROLES),
    (req, res) => {
      const name = String(req.body?.name || "")
          .trim()
          .slice(0, 80),
        color = /^#[0-9a-f]{6}$/i.test(req.body?.color)
          ? req.body.color
          : "#99aab5",
        permissions = String(req.body?.permissions || "0"),
        style = ["solid", "gradient", "holographic"].includes(req.body?.style)
          ? req.body.style
          : "solid";
      if (!name)
        return res.status(400).json({ error: "Role name is required" });
      const role = updateGuildRole(req.params.roleId, {
        name,
        color,
        permissions,
        hoist: Boolean(req.body?.hoist),
        mentionable: Boolean(req.body?.mentionable),
        style,
      });
      return role
        ? res.json({ role })
        : res.status(404).json({ error: "Role not found or managed role" });
    },
  );
  app.put(
    "/api/v1/guilds/:id/roles/order",
    requireUser,
    requireGuildPermission(Permissions.MANAGE_ROLES),
    (req, res) => {
      try { return res.json({ roles: reorderGuildRoles(req.params.id, req.body?.roleIds) }); }
      catch (error) { return res.status(400).json({ error: error.message }); }
    },
  );
  app.put(
    "/api/v1/guilds/:id/members/:userId/roles",
    requireUser,
    requireGuildPermission(Permissions.MANAGE_ROLES),
    (req, res, next) => {
      try {
        const roleIds = assertRoleHierarchy(req.params.id, req.user, req.params.userId, Array.isArray(req.body?.roleIds) ? req.body.roleIds : []);
        return res.json({ role_ids: setMemberRoles(req.params.id, req.params.userId, roleIds) });
      } catch (error) { return next(error); }
    },
  );
  app.delete(
    "/api/v1/guilds/:id/members/:userId",
    requireUser,
    requireGuildPermission(Permissions.MANAGE_ROLES),
    (req, res) =>
      removeGuildMember(req.params.id, req.params.userId)
        ? res.status(204).end()
        : res.status(400).json({ error: "The community owner cannot be removed" }),
  );
  app.get("/api/v1/guilds/:id/bans", requireUser, requireGuildPermission(Permissions.MANAGE_ROLES), (req, res) =>
    res.json({ bans: listGuildBans(req.params.id) }));
  app.post("/api/v1/guilds/:id/bans", requireUser, requireGuildPermission(Permissions.MANAGE_ROLES), (req, res) => {
    const actor = String(req.body?.actor || "").trim().slice(0, 300);
    if (!actor || !actor.includes("#")) return res.status(400).json({ error: "Use a portable actor ID such as user-id#instance.example" });
    const localSuffix = `#${federationDomain()}`;
    // A ban always removes an existing membership, whether the target is a
    // local user or a portable user from a federated instance.
    removeGuildMember(req.params.id, actor.endsWith(localSuffix) ? actor.slice(0, -localSuffix.length) : actor);
    return res.status(201).json({ ban: banGuildActor(req.params.id, actor, String(req.body?.reason || "").slice(0, 500), req.user.id) });
  });
  app.delete("/api/v1/guilds/:id/bans/:actor", requireUser, requireGuildPermission(Permissions.MANAGE_ROLES), (req, res) =>
    unbanGuildActor(req.params.id, req.params.actor, req.user.id) ? res.status(204).end() : res.status(404).json({ error: "Ban not found" }));
  app.get("/api/v1/guilds/:id/moderation-actions", requireUser, requireGuildPermission(Permissions.MANAGE_ROLES), (req, res) =>
    res.json({ actions: listModerationActions(req.params.id) }));
  app.get(
    "/api/v1/guilds/:id/permission-overrides",
    requireUser,
    requireGuildPermission(Permissions.MANAGE_ROLES),
    (req, res) =>
      res.json({ overrides: listPermissionOverrides(req.params.id) }),
  );
  app.put(
    "/api/v1/guilds/:id/permission-overrides/:overrideId",
    requireUser,
    requireGuildPermission(Permissions.MANAGE_ROLES),
    (req, res) => {
      const targetType = ["role", "member"].includes(req.body?.targetType)
        ? req.body.targetType
        : null;
      if (!targetType)
        return res.status(400).json({ error: "Invalid override target" });
      res.json({
        override: savePermissionOverride({
          id: req.params.overrideId,
          guildId: req.params.id,
          channelId: req.body?.channelId,
          categoryId: req.body?.categoryId,
          targetType,
          targetId: String(req.body?.targetId || ""),
          allowMask: String(req.body?.allowMask || "0"),
          denyMask: String(req.body?.denyMask || "0"),
        }),
      });
    },
  );
  app.get("/api/v1/guilds/:id/categories", requireUser, (req, res) => {
    const remote = remoteCommunityFor(req.user.id, req.params.id);
    if (remote) return res.json({ categories: remote.state?.categories || [] });
    return isGuildMember(req.params.id, req.user.id)
      ? res.json({ categories: listCategories(req.params.id) })
      : res.status(403).json({ error: "Join this community first" });
  });
  app.post(
    "/api/v1/guilds/:id/categories",
    requireUser,
    requireGuildPermission(Permissions.MANAGE_CHANNELS),
    (req, res) => {
      const name = String(req.body?.name || "")
        .trim()
        .slice(0, 80);
      if (!name)
        return res.status(400).json({ error: "Category name is required" });
      res.status(201).json({
        category: createCategory({
          id: randomUUID(),
          guildId: req.params.id,
          name,
          position: 0,
        }),
      });
    },
  );
  app.patch("/api/v1/categories/:categoryId", requireUser, requireGuildPermission(Permissions.MANAGE_CHANNELS, (req) => findCategory(req.params.categoryId)?.guild_id), (req, res) => {
    const name = String(req.body?.name || "").trim().slice(0, 80);
    if (!name) return res.status(400).json({ error: "Category name is required" });
    const category = updateCategory(req.params.categoryId, name, Number(req.body?.position) || 0);
    return category ? res.json({ category }) : res.status(404).json({ error: "Category not found" });
  });
  app.delete("/api/v1/categories/:categoryId", requireUser, requireGuildPermission(Permissions.MANAGE_CHANNELS, (req) => findCategory(req.params.categoryId)?.guild_id), (req, res) => deleteCategory(req.params.categoryId) ? res.status(204).end() : res.status(404).json({ error: "Category not found" }));
  app.get(
    "/api/v1/guilds/:id/invites",
    requireUser,
    requireGuildPermission(Permissions.CREATE_INVITE),
    (req, res) => res.json({ invites: listInvites(req.params.id) }),
  );
  app.post(
    "/api/v1/guilds/:id/invites",
    requireUser,
    requireGuildPermission(Permissions.CREATE_INVITE),
    (req, res) => {
      const invite = createInvite({
        id: randomUUID(),
        guildId: req.params.id,
        code: randomBytes(9).toString("base64url"),
        creatorId: req.user.id,
        maxUses: Math.max(0, Number(req.body?.maxUses) || 0),
        expiresAt: req.body?.expiresAt || null,
        createdAt: new Date().toISOString(),
      });
      res.status(201).json({ invite });
    },
  );
  app.get("/api/v1/invites/:code", requireUser, (req, res) => {
    const invite = findInvite(req.params.code);
    return invite
      ? res.json({ invite })
      : res.status(404).json({ error: "Invite not found" });
  });
  app.post("/api/v1/browser/policy/check", requireUser, (req, res) => {
    const channel = findChannel(String(req.body?.channelId || ""));
    if (!channel || !userCanAccessChannel(channel.id, req.user.id))
      return res.status(403).json({ error: "Join the channel first" });
    res.json(checkBrowserNavigation(String(req.body?.url || ""), { nsfw: Boolean(channel.nsfw) }));
  });
  app.post("/api/v1/invites/:code/join", requireUser, (req, res) => {
    const result = redeemInvite(req.params.code, req.user.id);
    return result.error
      ? res.status(400).json({ error: result.error })
      : res.json(result);
  });
  app.get(
    "/api/v1/guilds/:id/webhooks",
    requireUser,
    requireGuildPermission(Permissions.MANAGE_WEBHOOKS),
    (req, res) => res.json({ webhooks: listWebhooks(req.params.id) }),
  );
  app.post(
    "/api/v1/guilds/:id/webhooks",
    requireUser,
    requireGuildPermission(Permissions.MANAGE_WEBHOOKS),
    (req, res) => {
      const token = randomBytes(32).toString("base64url"),
        webhook = createWebhook({
          id: randomUUID(),
          guildId: req.params.id,
          channelId: String(req.body?.channelId || ""),
          name: String(req.body?.name || "Webhook")
            .trim()
            .slice(0, 80),
          token,
          tokenHash: createHash("sha256").update(token).digest("hex"),
          createdBy: req.user.id,
          createdAt: new Date().toISOString(),
        });
      res.status(201).json({ webhook });
    },
  );
  app.get("/api/v1/channels/:id/messages", requireUser, async (req, res, next) => {
    if (channelExists(req.params.id, "text") && userCanAccessChannel(req.params.id, req.user.id))
      return res.json({ messages: listMessages(req.params.id) });
    try {
      const remote = await requestRemoteChannel(req, req.params.id, "list");
      return remote ? res.json(remote) : res.status(404).json({ error: "Text channel not found" });
    } catch (error) { return next(error); }
  });
  app.post("/api/v1/channels/:id/messages", requireUser, async (req, res, next) => {
    const body = String(req.body?.content || "")
      .trim()
      .slice(0, 4000);
    const attachments = Array.isArray(req.body?.attachments) ? req.body.attachments.slice(0, 8) : [],
      contentWarning = String(req.body?.contentWarning || "").trim().slice(0, 120),
      replyTo = req.body?.replyTo ? Number(req.body.replyTo) : null;
    if (!channelExists(req.params.id, "text")) {
      try {
        const remote = await requestRemoteChannel(req, req.params.id, "create", {
          body, attachments, content_warning: contentWarning, reply_to: replyTo, author_name: req.user.display_name,
        });
        return remote ? res.status(201).json(remote) : res.status(400).json({ error: "Valid message content and text channel are required" });
      } catch (error) { return next(error); }
    }
    if ((!body && !attachments.length) || !userCanSendToChannel(req.params.id, req.user.id))
      return res.status(400).json({ error: "Valid message content and text channel are required" });
    res.status(201).json({
      message: createMessage({
        channelId: req.params.id,
        authorId: req.user.id,
        authorName: req.user.display_name,
        body, attachments, contentWarning, replyTo,
      }),
    });
  });
  app.delete("/api/v1/channels/:id/messages/:messageId", requireUser, async (req, res, next) => {
    if (channelExists(req.params.id, "text")) return res.status(405).json({ error: "Use the live channel connection to delete local messages" });
    try {
      const remote = await requestRemoteChannel(req, req.params.id, "delete", { message_id: Number(req.params.messageId) });
      return remote !== null ? res.status(204).end() : res.status(404).json({ error: "Text channel not found" });
    } catch (error) { return next(error); }
  });
  app.post("/api/v1/channels/:id/messages/:messageId/reactions", requireUser, async (req, res, next) => {
    if (channelExists(req.params.id, "text")) return res.status(405).json({ error: "Use the live channel connection for local reactions" });
    try {
      const remote = await requestRemoteChannel(req, req.params.id, "reaction", { message_id: Number(req.params.messageId), emoji: String(req.body?.emoji || "").slice(0, 64) });
      return remote !== null ? res.json(remote) : res.status(404).json({ error: "Text channel not found" });
    } catch (error) { return next(error); }
  });
  app.post("/api/v1/channels/:id/attachments", requireUser, (req, res) => {
    const remote = remoteChannelFor(req.user.id, req.params.id);
    if ((!channelExists(req.params.id, "text") && !remote) || (channelExists(req.params.id, "text") && !userCanSendToChannel(req.params.id, req.user.id)))
      return res.status(404).json({ error: "Text channel not found" });
    upload.single("file")(req, res, (error) => {
      if (error || !req.file) return res.status(400).json({ error: error?.message || "Choose an image" });
      const asset = storeAsset(uploadsDirectory, { buffer: req.file.buffer, mimeType: req.file.mimetype, kind: "message-attachment", ownerUserId: req.user.id });
      return res.status(201).json({ attachment: { id: asset.id, url: `/api/v1/assets/${asset.id}`, name: req.file.originalname, mimeType: req.file.mimetype } });
    });
  });
  app.get("/api/v1/voice/channels/:id/messages", requireUser, async (req, res, next) => {
    if (channelExists(req.params.id, "voice") && userCanConnectToChannel(req.params.id, req.user.id))
      return res.json({ messages: listMessages(req.params.id) });
    try {
      const remote = await requestRemoteChannel(req, req.params.id, "list");
      return remote ? res.json(remote) : res.status(404).json({ error: "Voice channel not found" });
    } catch (error) { return next(error); }
  });
  app.post("/api/v1/voice/channels/:id/messages", requireUser, async (req, res, next) => {
    const body = String(req.body?.content || "").trim().slice(0, 4000);
    const attachments = Array.isArray(req.body?.attachments) ? req.body.attachments.slice(0, 8) : [];
    if (!channelExists(req.params.id, "voice")) {
      try {
        const remote = await requestRemoteChannel(req, req.params.id, "create", { body, attachments, author_name: req.user.display_name });
        return remote ? res.status(201).json(remote) : res.status(400).json({ error: "Valid message content and voice channel are required" });
      } catch (error) { return next(error); }
    }
    if ((!body && !attachments.length) || !userCanConnectToChannel(req.params.id, req.user.id))
      return res.status(400).json({ error: "Valid message content and voice channel are required" });
    return res.status(201).json({
      message: createMessage({ channelId: req.params.id, authorId: req.user.id, authorName: req.user.display_name, body, attachments }),
    });
  });
  app.post("/api/v1/voice/channels/:id/attachments", requireUser, (req, res) => {
    const remote = remoteChannelFor(req.user.id, req.params.id);
    if ((!channelExists(req.params.id, "voice") && !remote) || (channelExists(req.params.id, "voice") && !userCanConnectToChannel(req.params.id, req.user.id)))
      return res.status(404).json({ error: "Voice channel not found" });
    messageFileUpload.single("file")(req, res, (error) => {
      if (error || !req.file) return res.status(400).json({ error: error?.message || "Choose a file" });
      const asset = storeAsset(uploadsDirectory, { buffer: req.file.buffer, mimeType: req.file.mimetype, kind: "voice-message-attachment", ownerUserId: req.user.id });
      return res.status(201).json({ attachment: { id: asset.id, url: `/api/v1/assets/${asset.id}`, name: req.file.originalname, mimeType: req.file.mimetype, size: req.file.size } });
    });
  });
  app.get("/api/v1/assets/:id", (req, res) =>
    sendAsset(uploadsDirectory, req.params.id, res),
  );
  app.get("/api/v1/media/library", requireUser, (req, res) => {
    const assets = listMediaAssets().map((asset) => ({
      id: asset.id,
      kind: asset.mime_type.startsWith("audio/") ? "audio" : "video",
      mimeType: asset.mime_type,
      size: asset.size,
      title: asset.filename,
      url: `/api/v1/assets/${asset.id}`,
      createdAt: asset.created_at,
    }));
    res.json({ assets });
  });
  app.post("/api/v1/media/import", requireUser, async (req, res, next) => {
    if (process.env.NODE_ENV !== "development" || process.env.MEDIA_YTDLP_ENABLED !== "true") {
      return res.status(404).json({ error: "Local media import is disabled" });
    }
    const sourceUrl = String(req.body?.url || "").trim();
    if (!/^https?:\/\//i.test(sourceUrl)) return res.status(400).json({ error: "A valid HTTPS or HTTP media URL is required" });
    const output = resolve(uploadsDirectory, `${randomUUID()}.%(ext)s`);
    const configuredYtdlp = process.env.YTDLP_BIN || "yt-dlp";
    const ytdlpBin = configuredYtdlp === "yt-dlp" || isAbsolute(configuredYtdlp)
      ? configuredYtdlp
      : resolve(projectRoot, configuredYtdlp);
    try {
      await execFileAsync(ytdlpBin, [
        "--no-playlist", "--no-warnings", "--no-progress", "--restrict-filenames",
        "--max-filesize", "200M", "-f", "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b", "--merge-output-format", "mp4",
        "-o", output, sourceUrl,
      ], { timeout: 180000, maxBuffer: 1024 * 1024 });
      const downloaded = output.replace("%(ext)s", "mp4");
      const buffer = await readFile(downloaded);
      const asset = storeAsset(uploadsDirectory, { buffer, mimeType: "video/mp4", kind: "media-library", ownerUserId: req.user.id });
      await unlink(downloaded).catch(() => {});
      return res.status(201).json({ asset: { id: asset.id, title: sourceUrl, kind: "video", mimeType: "video/mp4", url: `/api/v1/assets/${asset.id}` } });
    } catch (error) {
      await unlink(output.replace("%(ext)s", "mp4")).catch(() => {});
      if (error.code === "ENOENT") return res.status(503).json({ error: `yt-dlp executable not found: ${ytdlpBin}` });
      if (error.code) return res.status(422).json({ error: String(error.stderr || error.message || "yt-dlp could not import this URL").trim().split("\n").at(-1) });
      return next(error);
    }
  });
  app.get(
    "/api/v1/federation/:peerId/assets/:assetId",
    requireUser,
    async (req, res) => {
      try {
        const max = getInstanceSettings().maxUploadMb * 1024 * 1024,
          asset = await proxyAsset(
            uploadsDirectory,
            req.params.peerId,
            req.params.assetId,
            max,
          );
        return res.redirect(302, `/api/v1/assets/${asset.id}`);
      } catch (error) {
        return res.status(400).json({ error: error.message });
      }
    },
  );

  const communityAddress = (community, req) => `${String(community.name || community.id).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}#${process.env.FEDERATION_DOMAIN || req.get("host")}`;
  app.get("/api/communities", requireUser, (req, res) => {
    deprecatedEndpoint(res, "/api/v1/guilds");
    return res.json([...listCommunities(req.user.id).map((community) => ({ ...community, address: communityAddress(community, req) })), ...remoteGuildsFor(req.user.id)]);
  });
  app.get("/api/v1/friends", requireUser, (req, res) => res.json({ friends: listFriends(req.user.id), requests: listFriendRequests(req.user.id) }));
  app.post("/api/v1/friends/request", requireUser, (req, res) => {
    const lookup = String(req.body?.username || "").trim();
    const localUsername = lookup.match(/^([^@]+)@(?:localhost(?::\d+)?|127\.0\.0\.1(?::\d+)?)$/i)?.[1] || lookup;
    const target = findUserByUsername(localUsername) || findUserByEmail(lookup);
    if (!target) return res.status(404).json({ error: "User not found" });
    if (target.id === getSystemUser().id) return res.status(403).json({ error: "The instance system account cannot accept friend requests" });
    try { sendFriendRequest(req.user.id, target.id); return res.status(201).json({ ok: true }); } catch (e) { return res.status(400).json({ error: e.message }); }
  });
  app.post("/api/v1/friends/:id/accept", requireUser, (req, res) => acceptFriendRequest(req.params.id, req.user.id) ? res.json({ ok: true }) : res.status(404).json({ error: "Request not found" }));
  app.delete("/api/v1/friends/:id", requireUser, (req, res) => removeFriend(req.user.id, req.params.id) ? res.status(204).end() : res.status(404).json({ error: "Friend not found" }));
  app.post("/api/v1/reports", requireUser, (req, res) => {
    const targetType = ["user", "message", "community", "peer"].includes(req.body?.targetType) ? req.body.targetType : null,
      targetId = String(req.body?.targetId || "").trim().slice(0, 300), category = String(req.body?.category || "").trim().slice(0, 80),
      description = String(req.body?.description || "").trim().slice(0, 2000);
    if (!targetType || !targetId || !category) return res.status(400).json({ error: "Report target and category are required" });
    if (targetType === "user" && !findPublicUser(targetId)) return res.status(404).json({ error: "Reported user not found" });
    if (targetType === "user" && targetId === req.user.id) return res.status(400).json({ error: "You cannot report your own account" });
    const report = createInstanceReport({ reporterId: req.user.id, targetType, targetId, category, description,
      evidence: req.body?.evidence && typeof req.body.evidence === "object" ? req.body.evidence : {} });
    moderationEvents.emit("report:created", { reportId: report.id });
    return res.status(201).json({ report });
  });
  app.get("/api/v1/dms", requireUser, (req, res) => res.json({ conversations: listDirectMessageContacts(req.user.id) }));
  app.get("/api/v1/dms/:userId", requireUser, (req, res) => {
    const target = findPublicUser(req.params.userId);
    if (!target) return res.status(404).json({ error: "User not found" });
    res.json({ messages: listDirectMessages(req.user.id, target.id), user: target });
  });
  app.get("/api/v1/crypto/key/:userId", requireUser, (req, res) => {
    const target = findPublicUser(req.params.userId);
    target ? res.json({ publicKey: target.dm_public_key || "" }) : res.status(404).json({ error: "User not found" });
  });
  app.put("/api/v1/crypto/key", requireUser, (req, res) => {
    const publicKey = String(req.body?.publicKey || "");
    if (!publicKey || publicKey.length > 10000) return res.status(400).json({ error: "Invalid public key" });
    const saved = setDmPublicKey(req.user.id, publicKey), fingerprint = createHash("sha256").update(saved).digest("base64url");
    for (const peer of listPeers().filter((item) => item.status === "allowed"))
      void queueFederationEvent({ peer, type: "dm.key.upsert", entityId: `${req.user.id}#${federationDomain()}:dm-key`,
        payload: { global_user_id: `${req.user.id}#${federationDomain()}`, key_id: `identity:${fingerprint.slice(0, 24)}`, public_key: saved } }).catch(() => {});
    res.json({ publicKey: saved, keyId: `identity:${fingerprint.slice(0, 24)}`, fingerprint });
  });
  app.get("/api/v1/crypto/federated-key", requireUser, (req, res) => {
    const globalUserId = String(req.query.user || ""), keyId = String(req.query.keyId || "");
    const identity = findRemoteIdentity(globalUserId), key = keyId ? findFederatedDmKey(globalUserId, keyId) : null;
    if (!identity && !key) return res.status(404).json({ error: "Remote identity key not found" });
    const publicKey = key?.public_key || identity.public_key;
    const fingerprint = key?.fingerprint || (publicKey ? createHash("sha256").update(publicKey).digest("base64url") : "");
    return res.json({ global_user_id: globalUserId, key_id: key?.key_id || `identity:${fingerprint.slice(0, 24)}`,
      public_key: publicKey, fingerprint, verification_status: key?.verification_status || "unverified" });
  });
  app.put("/api/v1/crypto/federated-key/verify", requireUser, (req, res) => {
    const key = verifyDmKey(String(req.body?.globalUserId || ""), String(req.body?.keyId || ""),
      String(req.body?.fingerprint || ""), req.user.id);
    return key ? res.json({ key }) : res.status(409).json({ error: "The fingerprint does not match the stored key" });
  });
  app.get("/api/v1/federation/dms", requireUser, (req, res) => {
    const other = String(req.query.with || ""), me = `${req.user.id}#${federationDomain()}`;
    return other ? res.json({ messages: listFederatedDms(me, other) }) : res.status(400).json({ error: "A remote user handle is required" });
  });
  app.post("/api/v1/federation/dms", requireUser, async (req, res) => {
    const recipient = String(req.body?.recipient || ""), separator = recipient.lastIndexOf("#"), ciphertext = String(req.body?.ciphertext || "");
    if (separator < 1 || !ciphertext || ciphertext.length > 256_000) return res.status(400).json({ error: "Recipient and ciphertext are required" });
    const destination = recipient.slice(separator + 1).toLowerCase(), sender = `${req.user.id}#${federationDomain()}`;
    const message = { message_id: randomUUID(), sender_global_id: sender, recipient_global_id: recipient,
      ciphertext, algorithm: String(req.body?.algorithm || "xchacha20-poly1305").slice(0, 64),
      sender_key_id: String(req.body?.senderKeyId || "").slice(0, 128), recipient_key_id: String(req.body?.recipientKeyId || "").slice(0, 128),
      created_at: new Date().toISOString() };
    if (!message.sender_key_id || !message.recipient_key_id) return res.status(400).json({ error: "Both encryption key IDs are required" });
    try {
      const event = await queueFederationEvent({ destination, type: "dm.encrypted", entityId: message.message_id, payload: message });
      return res.status(202).json({ message: { ...message, event_id: event.event_id } });
    } catch (error) { return res.status(400).json({ error: error.message }); }
  });
  app.post("/api/v1/identity/migrations", requireUser, (req, res) => {
    const targetDomain = String(req.body?.targetDomain || "").trim().toLowerCase();
    if (!findPeerByDomain(targetDomain)) return res.status(400).json({ error: "Migration target must be an allowed peer" });
    return res.status(201).json(createMigrationBundle(req.user, targetDomain));
  });
  app.post("/api/v1/identity/migrations/import", requireUser, async (req, res) => {
    try {
      const supplied = req.body?.bundle, origin = String(supplied?.origin || ""), peer = findPeerByDomain(origin);
      if (!peer || !req.body?.secret || !supplied?.payload?.migration_id) throw new Error("A valid peer bundle and claim secret are required");
      const claimResponse = await federationFetch(peer, `/api/v1/federation/migrations/${encodeURIComponent(supplied.payload.migration_id)}/claim`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ secret: req.body.secret }),
      });
      if (!claimResponse.ok) throw new Error("The source instance rejected the migration claim");
      const claimed = (await claimResponse.json()).bundle;
      if (canonicalJson(claimed) !== canonicalJson(supplied)) throw new Error("Migration bundle changed during claim");
      await verifyEnvelope(claimed, { consumeRate: false });
      const p = claimed.payload.identity;
      saveRemoteIdentity({ globalId: claimed.payload.source_global_id, origin, remoteUserId: p.id, username: p.username,
        displayName: p.display_name, avatarUrl: p.avatar_url, bannerUrl: p.banner_url, publicKey: p.dm_public_key,
        keyFingerprint: p.dm_public_key ? createHash("sha256").update(p.dm_public_key).digest("base64url") : "", profile: { migrated_to: req.user.id }, verifiedAt: new Date().toISOString() });
      const current = findPublicUser(req.user.id);
      const migratedUser = updateProfile(req.user.id, { username: current.username, displayName: p.display_name || current.display_name,
        avatarUrl: imageUrl(p.avatar_url) ?? current.avatar_url, bannerUrl: imageUrl(p.banner_url) ?? current.banner_url,
        bio: String(p.bio || "").slice(0, 500), accentColor: /^#[0-9a-f]{6}$/i.test(p.accent_color) ? p.accent_color : current.accent_color,
        profileCss: current.profile_css || "", settings: typeof current.settings === "string" ? JSON.parse(current.settings || "{}") : current.settings || {} });
      return res.json({ migrated_identity: claimed.payload.source_global_id, linked_local_user_id: req.user.id,
        community_memberships: claimed.payload.community_memberships || [], user: publicUser(migratedUser) });
    } catch (error) { return res.status(400).json({ error: error.message }); }
  });
  app.post("/api/v1/dms/:userId", requireUser, (req, res) => {
    const target = findPublicUser(req.params.userId), body = String(req.body?.body || "").trim().slice(0, 4000);
    if (!target) return res.status(404).json({ error: "User not found" });
    if (target.id === getSystemUser().id) return res.status(403).json({ error: "The instance system conversation is read-only" });
    if (!body) return res.status(400).json({ error: "Message is required" });
    res.status(201).json({ message: createDirectMessage(req.user.id, target.id, body) });
  });
  app.get("/api/channels/:id/messages", requireUser, (req, res) => {
    deprecatedEndpoint(res, `/api/v1/channels/${encodeURIComponent(req.params.id)}/messages`);
    return channelExists(req.params.id, "text") && userCanAccessChannel(req.params.id, req.user.id)
      ? res.json(listMessages(req.params.id))
      : res.status(404).json({ error: "Text channel not found" });
  });
  app.post("/api/livekit/token", requireUser, async (req, res) => {
    const { channelId, dmUserId } = req.body || {};
    if (dmUserId) {
      const target = findPublicUser(String(dmUserId));
      if (!target) return res.status(404).json({ error: "DM user not found" });
      if (target.id === getSystemUser().id) return res.status(403).json({ error: "The instance system account cannot join calls" });
      if (!process.env.LIVEKIT_API_KEY || !process.env.LIVEKIT_API_SECRET) return res.status(503).json({ error: "LiveKit is not configured" });
      const roomName = `dm:${[req.user.id, target.id].sort().join(":")}`;
      const token = new AccessToken(process.env.LIVEKIT_API_KEY.trim(), process.env.LIVEKIT_API_SECRET.trim(), { identity: req.user.id, name: req.user.display_name, ttl: "2h" });
      token.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true });
      return res.json({ token: await token.toJwt(), url: livekitPublicUrl, room: roomName });
    }
    if (!channelExists(channelId, "voice")) {
      const remote = await requestRemoteVoice(req, { channelId, action: "token", input: { display_name: req.user.display_name } });
      if (remote) return res.json(remote);
    }
    if (!channelExists(channelId, "voice") || !userCanConnectToChannel(channelId, req.user.id))
      return res.status(404).json({ error: "Voice channel not found" });
    const voiceChannel = findChannel(String(channelId));
    const roomName = `voice:${voiceChannel.community_id}:${channelId}`;
    if (!process.env.LIVEKIT_API_KEY || !process.env.LIVEKIT_API_SECRET)
      return res.status(503).json({ error: "LiveKit is not configured. Set LIVEKIT_API_KEY and LIVEKIT_API_SECRET in the root .env, then restart the API." });
    const token = new AccessToken(
      process.env.LIVEKIT_API_KEY.trim(),
      process.env.LIVEKIT_API_SECRET.trim(),
      { identity: req.user.id, name: req.user.display_name, ttl: "2h" },
    );
    token.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
    });
    res.json({
      token: await token.toJwt(),
      url: livekitPublicUrl,
    });
  });
  app.get("/api/v1/voice/presence", requireUser, async (req, res) => {
    const communityId = String(req.query.communityId || "");
    if (remoteCommunityFor(req.user.id, communityId)) {
      try {
        const remote = await requestRemoteVoice(req, { communityId, action: "presence" });
        return res.json(remote || { channels: {} });
      } catch { return res.json({ channels: {} }); }
    }
    const channels = listCommunityChannels(communityId).filter((channel) => channel.kind === "voice");
    if (!process.env.LIVEKIT_API_KEY || !process.env.LIVEKIT_API_SECRET)
      return res.json({ channels: {} });
    try {
      const lk = new LiveKitAPI({ host: livekitInternalUrl.replace(/^ws/, "http"), apiKey: process.env.LIVEKIT_API_KEY.trim(), secret: process.env.LIVEKIT_API_SECRET.trim() });
      const entries = await Promise.all(channels.map(async (channel) => {
        const participants = await lk.room.listParticipants(`voice:${communityId}:${channel.id}`);
        return [channel.id, participants.map((participant) => {
          const tracks = participant.tracks || [];
          return {
            identity: participant.identity,
            name: participant.name,
            camera: tracks.some((track) => track.source === 1 && !track.muted),
            screen: tracks.some((track) => track.source === 3 && !track.muted),
            muted: tracks.some((track) => track.source === 2 && track.muted),
          };
        })];
      }));
      return res.json({ channels: Object.fromEntries(entries) });
    } catch { return res.json({ channels: {} }); }
  });
  app.post("/api/v1/voice/browser", requireUser, async (req, res) => {
    const channelId = String(req.body?.channelId || "");
    const channel = findChannel(channelId);
    const communityId = String(req.body?.communityId || channel?.community_id || "");
    if (!channel || channel.kind !== "voice" || !communityId || channel.community_id !== communityId || !userCanConnectToChannel(channelId, req.user.id))
      return res.status(403).json({ error: "Join a voice channel first" });
    const base = (process.env.BROWSER_SERVICE_URL || "http://localhost:8090").replace(/\/$/, "");
    if (process.env.BROWSER_DESKTOP_URL) {
      try {
        const lk = new LiveKitAPI({ host: livekitInternalUrl.replace(/^ws/, "http"), apiKey: process.env.LIVEKIT_API_KEY, secret: process.env.LIVEKIT_API_SECRET });
        const ingress = await lk.ingress.createIngress(IngressInput.RTMP_INPUT, {
          name: `Firefox · ${channelId}`,
          roomName: `voice:${communityId}:${channelId}`,
          participantIdentity: `browser-${communityId}-${channelId}`,
          participantName: "Shared Firefox",
          participantMetadata: JSON.stringify({ type: "shared-firefox", communityId, channelId }),
          enableTranscoding: true,
        });
        const control = process.env.BROWSER_DESKTOP_CONTROL_URL || "http://localhost:8091";
        const rtmpBase = String(ingress.url || "rtmp://localhost:1935/live").replace(/localhost|127\.0\.0\.1/g, process.env.BROWSER_RTMP_HOST || "host.docker.internal");
        const rtmpUrl = rtmpBase
          ? `${rtmpBase.replace(/\/$/, "")}/${ingress.streamKey}`
          : `rtmp://localhost:1935/live/${ingress.streamKey}`;
        await fetch(`${control}/stream`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ rtmpUrl, fps: req.body?.fps || 30 }) });
        return res.status(201).json({ id: ingress.ingressId, browser: "firefox", url: process.env.BROWSER_DESKTOP_URL, stream: true });
      } catch (error) {
        console.error("Firefox LiveKit bridge failed", error);
        return res.status(503).json({ error: "Firefox bridge could not connect to LiveKit Ingress." });
      }
    }
    fetch(`${base}/sessions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ communityId, channelId, url: req.body?.url || "https://www.wikipedia.org", nsfw: Boolean(channel.nsfw) }) })
      .then(async (response) => { const data = await response.json(); return response.ok ? res.status(201).json({ ...data, communityId, channelId, url: `${base}${data.url}` }) : res.status(response.status).json(data); })
      .catch(() => res.status(503).json({ error: "Firefox browser service is offline. Start the browser profile with docker compose --profile browser up -d." }));
  });

  app.get("/api/admin/federation", requireAdmin, (_req, res) =>
    res.json(listPeers()),
  );
  app.post("/api/admin/federation", requireAdmin, (req, res) => {
    const input = peerInput(req.body);
    if (!input)
      return res
        .status(400)
        .json({ error: "A valid name, URL, and status are required" });
    try {
      return res.status(201).json(createPeer({ id: randomUUID(), ...input }));
    } catch (error) {
      if (String(error).includes("UNIQUE"))
        return res
          .status(409)
          .json({ error: "That instance is already configured" });
      throw error;
    }
  });
  app.put("/api/admin/federation/:id", requireAdmin, (req, res) => {
    const input = peerInput(req.body);
    if (!input)
      return res.status(400).json({ error: "Invalid federation instance" });
    const peer = updatePeer(req.params.id, input);
    return peer
      ? res.json(peer)
      : res.status(404).json({ error: "Instance not found" });
  });
  app.delete("/api/admin/federation/:id", requireAdmin, (req, res) =>
    deletePeer(req.params.id)
      ? res.status(204).end()
      : res.status(404).json({ error: "Instance not found" }),
  );
  app.get("/api/admin/federation/:id/check", requireAdmin, async (req, res) => {
    const peer = listPeers().find((item) => item.id === req.params.id);
    if (!peer) return res.status(404).json({ error: "Instance not found" });
    try {
      const [health, discovery] = await Promise.all([checkFederationPeer(peer), discoverFederationPeer(peer)]);
      return res.json({ ...health, federation: { domain: discovery.domain, signing_key: discovery.signing_key, capabilities: discovery.capabilities || [] } });
    } catch (error) {
      return res.status(502).json({ error: error.message });
    }
  });
  app.get("/api/admin/federation-policies", requireAdmin, (_req, res) => res.json({ peers: listPeerPolicies() }));
  app.put("/api/admin/federation-policies/:peerId", requireAdmin, (req, res) => {
    if (!listPeers().some((peer) => peer.id === req.params.peerId)) return res.status(404).json({ error: "Peer not found" });
    return res.json({ policy: savePeerPolicy(req.params.peerId, req.body || {}) });
  });
  app.post("/api/v1/federation/abuse-reports", requireUser, (req, res) => {
    const category = String(req.body?.category || "").trim().slice(0, 80);
    if (!category) return res.status(400).json({ error: "An abuse category is required" });
    return res.status(201).json({ report: createAbuseReport({ reporterUserId: req.user.id,
      peerId: String(req.body?.peerId || "") || null, remoteActor: String(req.body?.remoteActor || "").slice(0, 300),
      category, evidence: req.body?.evidence && typeof req.body.evidence === "object" ? req.body.evidence : {} }) });
  });
  app.get("/api/admin/federation-abuse-reports", requireAdmin, (_req, res) => res.json({ reports: listAbuseReports() }));
  app.get("/.well-known/libracord", (req, res) => {
    const forwardedProto = String(req.get("x-forwarded-proto") || "").split(",")[0].trim();
    const forwardedHost = String(req.get("x-forwarded-host") || "").split(",")[0].trim();
    const requestOrigin = `${forwardedProto || req.protocol}://${forwardedHost || req.get("host")}`;
    const publicOrigin = String(process.env.PUBLIC_URL || requestOrigin).replace(/\/$/, "");
    return res.json({
      protocol: "libracord",
      version: "1.0",
      domain: federationDomain(),
      instance: publicOrigin,
      api: `${publicOrigin}/api/v1`,
      inbox: `${publicOrigin}/api/v1/federation/inbox`,
      signing_key: publicFederationIdentity(),
      capabilities: [
        "discovery",
        "guilds",
        "text-channels",
        "livekit-voice",
        "uuid-assets",
        "asset-proxy",
        "community-directory",
        "signed-events",
        "durable-remote-membership",
        "event-reconciliation",
        "portable-identity",
        "encrypted-federated-dm",
        "peer-trust-policy",
      ],
    });
  });

  // Production mode serves the compiled Vue app from the same origin as the
  // API and Socket.IO gateway. This lets a reverse proxy expose one upstream
  // port instead of separately proxying Vite and the API.
  const clientDist = resolve(projectRoot, process.env.CLIENT_DIST_PATH || "client/dist");
  if (existsSync(clientDist)) {
    app.use(express.static(clientDist, { index: "index.html", maxAge: "1h" }));
    app.use((req, res, next) => {
      if (req.path.startsWith("/api/") || req.path.startsWith("/socket.io/") || req.path.startsWith("/uploads/")) return next();
      return res.sendFile(resolve(clientDist, "index.html"));
    });
  }
  app.use((error, _req, res, _next) => {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  });
  return app;
}
