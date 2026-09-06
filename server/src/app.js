import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
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
  deleteChannel,
  findChannel,
  listPermissionOverrides,
  savePermissionOverride,
  setMemberRoles,
  listInstanceEmojis,
  listGuildEmojis,
  createInstanceEmoji,
  deleteInstanceEmoji,
  listSocialPosts,
  createSocialPost,
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
  listDirectMessages,
  createDirectMessage,
  setDmPublicKey,
  listFriends, sendFriendRequest, listFriendRequests, acceptFriendRequest, removeFriend,
} from "./db.js";
import { proxyAsset, sendAsset, storeAsset } from "./assets.js";
import { aggregateFederatedHome, checkFederationPeer } from "./federated-home.js";
import { checkBrowserNavigation } from "./plugins/browser-policy.js";
import { Permissions, requireGuildPermission } from "./permissions.js";
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
const livekitPublicUrl = process.env.LIVEKIT_URL || "ws://localhost:7880";
const livekitInternalUrl = process.env.LIVEKIT_INTERNAL_URL || livekitPublicUrl;
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
    profile_css: user.profile_css || "",
    role: user.role,
    status: profileSettings.status || "online",
    status_text: profileSettings.statusText || "",
    decoration_id: profileSettings.selectedDecorationId || "",
    profile_theme_id: profileSettings.selectedProfileThemeId || "",
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

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(
    cors({
      origin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "32kb" }));
  app.use(
    "/uploads",
    express.static(uploadsDirectory, { fallthrough: false, maxAge: "7d" }),
  );
  app.get("/health", (_req, res) => res.json({ ok: true }));

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
  app.get("/api/users/:id/profile", requireUser, (req, res) => {
    const profile = publicProfile(findPublicUser(req.params.id));
    if (profile && req.query.guildId)
      profile.roles = listUserGuildRoles(req.query.guildId, req.params.id);
    return profile
      ? res.json({ profile })
      : res.status(404).json({ error: "User not found" });
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
      post: createSocialPost({ id: randomUUID(), userId: req.user.id, body }),
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
  app.get("/api/v1/emojis", (req, res) =>
    res.json({
      emojis: listInstanceEmojis(),
      guild_emojis: req.query.guildId ? listGuildEmojis(req.query.guildId) : [],
      instance: getInstanceSettings().name,
    }),
  );
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
  app.get("/api/v1/guilds", requireUser, (_req, res) =>
    res.json({ guilds: listCommunities(_req.user.id) }),
  );
  app.get("/api/v1/discovery/communities", requireUser, async (_req, res, next) => {
    try {
      const remote = await aggregateFederatedHome(listPeers());
      const local = listCommunities().map((community) => ({
        ...community,
        address: communityAddress(community, _req),
        remote: false,
      }));
      res.json({ communities: [...local, ...remote.communities], unavailable: remote.unavailable });
    } catch (error) {
      next(error);
    }
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
        bannerColor: /^#[0-9a-f]{6}$/i.test(inputProfile.bannerColor)
          ? inputProfile.bannerColor
          : "#7857ff",
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
      kind = ["text", "voice"].includes(req.body?.kind) ? req.body.kind : null;
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
  app.get("/api/v1/guilds/:id/members", requireUser, (req, res) =>
    isGuildMember(req.params.id, req.user.id)
      ? res.json({ members: listGuildMembers(req.params.id).map((member) => ({ ...member, roles: listUserGuildRoles(req.params.id, member.id) })) })
      : res.status(403).json({ error: "Join this community first" }),
  );
  app.get("/api/v1/guilds/:id/roles", requireUser, (req, res) =>
    isGuildMember(req.params.id, req.user.id)
      ? res.json({ roles: listGuildRoles(req.params.id) })
      : res.status(403).json({ error: "Join this community first" }),
  );
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
    "/api/v1/guilds/:id/members/:userId/roles",
    requireUser,
    requireGuildPermission(Permissions.MANAGE_ROLES),
    (req, res) =>
      res.json({
        role_ids: setMemberRoles(
          req.params.id,
          req.params.userId,
          Array.isArray(req.body?.roleIds) ? req.body.roleIds : [],
        ),
      }),
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
  app.get("/api/v1/guilds/:id/categories", requireUser, (req, res) =>
    isGuildMember(req.params.id, req.user.id)
      ? res.json({ categories: listCategories(req.params.id) })
      : res.status(403).json({ error: "Join this community first" }),
  );
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
  app.get("/api/v1/channels/:id/messages", requireUser, (req, res) =>
    channelExists(req.params.id, "text") && userCanAccessChannel(req.params.id, req.user.id)
      ? res.json({ messages: listMessages(req.params.id) })
      : res.status(404).json({ error: "Text channel not found" }),
  );
  app.post("/api/v1/channels/:id/messages", requireUser, (req, res) => {
    const body = String(req.body?.content || "")
      .trim()
      .slice(0, 4000);
    const attachments = Array.isArray(req.body?.attachments) ? req.body.attachments.slice(0, 8) : [],
      contentWarning = String(req.body?.contentWarning || "").trim().slice(0, 120),
      replyTo = req.body?.replyTo ? Number(req.body.replyTo) : null;
    if ((!body && !attachments.length) || !channelExists(req.params.id, "text") || !userCanSendToChannel(req.params.id, req.user.id))
      return res
        .status(400)
        .json({ error: "Valid message content and text channel are required" });
    res.status(201).json({
      message: createMessage({
        channelId: req.params.id,
        authorId: req.user.id,
        authorName: req.user.display_name,
        body, attachments, contentWarning, replyTo,
      }),
    });
  });
  app.post("/api/v1/channels/:id/attachments", requireUser, (req, res) => {
    if (!channelExists(req.params.id, "text") || !userCanSendToChannel(req.params.id, req.user.id))
      return res.status(404).json({ error: "Text channel not found" });
    upload.single("file")(req, res, (error) => {
      if (error || !req.file) return res.status(400).json({ error: error?.message || "Choose an image" });
      const asset = storeAsset(uploadsDirectory, { buffer: req.file.buffer, mimeType: req.file.mimetype, kind: "message-attachment", ownerUserId: req.user.id });
      return res.status(201).json({ attachment: { id: asset.id, url: `/api/v1/assets/${asset.id}`, name: req.file.originalname, mimeType: req.file.mimetype } });
    });
  });
  app.get("/api/v1/assets/:id", (req, res) =>
    sendAsset(uploadsDirectory, req.params.id, res),
  );
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
  app.get("/api/communities", requireUser, (req, res) =>
    res.json(listCommunities(req.user.id).map((community) => ({ ...community, address: communityAddress(community, req) }))),
  );
  app.get("/api/v1/friends", requireUser, (req, res) => res.json({ friends: listFriends(req.user.id), requests: listFriendRequests(req.user.id) }));
  app.post("/api/v1/friends/request", requireUser, (req, res) => {
    const lookup = String(req.body?.username || "").trim();
    const localUsername = lookup.match(/^([^@]+)@(?:localhost(?::\d+)?|127\.0\.0\.1(?::\d+)?)$/i)?.[1] || lookup;
    const target = findUserByUsername(localUsername) || findUserByEmail(lookup);
    if (!target) return res.status(404).json({ error: "User not found" });
    try { sendFriendRequest(req.user.id, target.id); return res.status(201).json({ ok: true }); } catch (e) { return res.status(400).json({ error: e.message }); }
  });
  app.post("/api/v1/friends/:id/accept", requireUser, (req, res) => acceptFriendRequest(req.params.id, req.user.id) ? res.json({ ok: true }) : res.status(404).json({ error: "Request not found" }));
  app.delete("/api/v1/friends/:id", requireUser, (req, res) => removeFriend(req.user.id, req.params.id) ? res.status(204).end() : res.status(404).json({ error: "Friend not found" }));
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
    res.json({ publicKey: setDmPublicKey(req.user.id, publicKey) });
  });
  app.post("/api/v1/dms/:userId", requireUser, (req, res) => {
    const target = findPublicUser(req.params.userId), body = String(req.body?.body || "").trim().slice(0, 4000);
    if (!target) return res.status(404).json({ error: "User not found" });
    if (!body) return res.status(400).json({ error: "Message is required" });
    res.status(201).json({ message: createDirectMessage(req.user.id, target.id, body) });
  });
  app.get("/api/channels/:id/messages", requireUser, (req, res) =>
    channelExists(req.params.id, "text") && userCanAccessChannel(req.params.id, req.user.id)
      ? res.json(listMessages(req.params.id))
      : res.status(404).json({ error: "Text channel not found" }),
  );
  app.post("/api/livekit/token", requireUser, async (req, res) => {
    const { channelId, dmUserId } = req.body || {};
    if (dmUserId) {
      const target = findPublicUser(String(dmUserId));
      if (!target) return res.status(404).json({ error: "DM user not found" });
      if (!process.env.LIVEKIT_API_KEY || !process.env.LIVEKIT_API_SECRET) return res.status(503).json({ error: "LiveKit is not configured" });
      const roomName = `dm:${[req.user.id, target.id].sort().join(":")}`;
      const token = new AccessToken(process.env.LIVEKIT_API_KEY.trim(), process.env.LIVEKIT_API_SECRET.trim(), { identity: req.user.id, name: req.user.display_name, ttl: "2h" });
      token.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true });
      return res.json({ token: await token.toJwt(), url: livekitPublicUrl, room: roomName });
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
    const channels = listCommunityChannels(communityId).filter((channel) => channel.kind === "voice");
    if (!process.env.LIVEKIT_API_KEY || !process.env.LIVEKIT_API_SECRET)
      return res.json({ channels: {} });
    try {
      const lk = new LiveKitAPI({ host: livekitInternalUrl.replace(/^ws/, "http"), apiKey: process.env.LIVEKIT_API_KEY.trim(), secret: process.env.LIVEKIT_API_SECRET.trim() });
      const entries = await Promise.all(channels.map(async (channel) => {
        const participants = await lk.room.listParticipants(`voice:${communityId}:${channel.id}`);
        return [channel.id, participants.map((participant) => ({ identity: participant.identity, name: participant.name }))];
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
      return res.json(await checkFederationPeer(peer));
    } catch (error) {
      return res.status(502).json({ error: error.message });
    }
  });
  app.get("/.well-known/libracord", (req, res) => {
    const forwardedProto = String(req.get("x-forwarded-proto") || "").split(",")[0].trim();
    const forwardedHost = String(req.get("x-forwarded-host") || "").split(",")[0].trim();
    const requestOrigin = `${forwardedProto || req.protocol}://${forwardedHost || req.get("host")}`;
    const publicOrigin = String(process.env.PUBLIC_URL || requestOrigin).replace(/\/$/, "");
    return res.json({
      protocol: "libracord",
      version: "1.0",
      instance: publicOrigin,
      api: `${publicOrigin}/api/v1`,
      capabilities: [
        "discovery",
        "guilds",
        "text-channels",
        "livekit-voice",
        "uuid-assets",
        "asset-proxy",
        "community-directory",
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
