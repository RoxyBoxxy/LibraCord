import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const dbPath = resolve(projectRoot, process.env.DATABASE_PATH || "data/libracord.db");
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`
 PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
 CREATE TABLE IF NOT EXISTS communities(id TEXT PRIMARY KEY,name TEXT NOT NULL,description TEXT NOT NULL DEFAULT '');
 CREATE TABLE IF NOT EXISTS channels(id TEXT PRIMARY KEY,community_id TEXT NOT NULL,name TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('text','voice')),FOREIGN KEY(community_id) REFERENCES communities(id));
 CREATE TABLE IF NOT EXISTS messages(id INTEGER PRIMARY KEY AUTOINCREMENT,channel_id TEXT NOT NULL,author_id TEXT NOT NULL,author_name TEXT NOT NULL,body TEXT NOT NULL,created_at TEXT NOT NULL,attachments TEXT NOT NULL DEFAULT '[]',content_warning TEXT NOT NULL DEFAULT '',reply_to INTEGER,FOREIGN KEY(channel_id) REFERENCES channels(id));
 CREATE TABLE IF NOT EXISTS direct_messages(id INTEGER PRIMARY KEY AUTOINCREMENT,sender_id TEXT NOT NULL,recipient_id TEXT NOT NULL,body TEXT NOT NULL,created_at TEXT NOT NULL,FOREIGN KEY(sender_id) REFERENCES users(id) ON DELETE CASCADE,FOREIGN KEY(recipient_id) REFERENCES users(id) ON DELETE CASCADE);
 CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,display_name TEXT NOT NULL,password_hash TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('owner','admin','member')),created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions(id_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires_at TEXT NOT NULL,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
 CREATE TABLE IF NOT EXISTS federation_peers(id TEXT PRIMARY KEY,name TEXT NOT NULL,base_url TEXT NOT NULL UNIQUE,status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','allowed','blocked')),created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS assets(id TEXT PRIMARY KEY,owner_user_id TEXT,kind TEXT NOT NULL,mime_type TEXT NOT NULL,size INTEGER NOT NULL,sha256 TEXT NOT NULL,filename TEXT NOT NULL,origin_instance TEXT,origin_asset_id TEXT,created_at TEXT NOT NULL,FOREIGN KEY(owner_user_id) REFERENCES users(id));
 CREATE TABLE IF NOT EXISTS instance_settings(id INTEGER PRIMARY KEY CHECK(id=1),data TEXT NOT NULL,updated_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS guild_roles(id TEXT PRIMARY KEY,guild_id TEXT NOT NULL,name TEXT NOT NULL,color TEXT NOT NULL DEFAULT '#99aab5',permissions TEXT NOT NULL DEFAULT '0',position INTEGER NOT NULL DEFAULT 0,managed INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS guild_members(guild_id TEXT NOT NULL,user_id TEXT NOT NULL,nickname TEXT,joined_at TEXT NOT NULL,PRIMARY KEY(guild_id,user_id));
 CREATE TABLE IF NOT EXISTS member_roles(guild_id TEXT NOT NULL,user_id TEXT NOT NULL,role_id TEXT NOT NULL,PRIMARY KEY(guild_id,user_id,role_id));
 CREATE TABLE IF NOT EXISTS channel_categories(id TEXT PRIMARY KEY,guild_id TEXT NOT NULL,name TEXT NOT NULL,position INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS permission_overrides(id TEXT PRIMARY KEY,guild_id TEXT NOT NULL,channel_id TEXT,category_id TEXT,target_type TEXT NOT NULL CHECK(target_type IN ('role','member')),target_id TEXT NOT NULL,allow_mask TEXT NOT NULL DEFAULT '0',deny_mask TEXT NOT NULL DEFAULT '0');
 CREATE TABLE IF NOT EXISTS guild_invites(id TEXT PRIMARY KEY,guild_id TEXT NOT NULL,code TEXT NOT NULL UNIQUE,creator_id TEXT NOT NULL,max_uses INTEGER NOT NULL DEFAULT 0,uses INTEGER NOT NULL DEFAULT 0,expires_at TEXT,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS guild_webhooks(id TEXT PRIMARY KEY,guild_id TEXT NOT NULL,channel_id TEXT NOT NULL,name TEXT NOT NULL,token_hash TEXT NOT NULL,created_by TEXT NOT NULL,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS instance_emojis(id TEXT PRIMARY KEY,name TEXT NOT NULL UNIQUE COLLATE NOCASE,asset_id TEXT NOT NULL,creator_id TEXT NOT NULL,guild_id TEXT,created_at TEXT NOT NULL,FOREIGN KEY(asset_id) REFERENCES assets(id),FOREIGN KEY(creator_id) REFERENCES users(id));
 CREATE TABLE IF NOT EXISTS social_posts(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,body TEXT NOT NULL,created_at TEXT NOT NULL,FOREIGN KEY(user_id) REFERENCES users(id));
 CREATE TABLE IF NOT EXISTS published_items(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('theme','decoration','profile-theme')),name TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',payload TEXT NOT NULL DEFAULT '{}',created_at TEXT NOT NULL,FOREIGN KEY(user_id) REFERENCES users(id));
 CREATE TABLE IF NOT EXISTS user_collections(user_id TEXT NOT NULL,item_id TEXT NOT NULL,added_at TEXT NOT NULL,PRIMARY KEY(user_id,item_id),FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
 CREATE TABLE IF NOT EXISTS friend_requests(id TEXT PRIMARY KEY,from_user TEXT NOT NULL,to_user TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',created_at TEXT NOT NULL,UNIQUE(from_user,to_user),FOREIGN KEY(from_user) REFERENCES users(id) ON DELETE CASCADE,FOREIGN KEY(to_user) REFERENCES users(id) ON DELETE CASCADE);
`);
for (const [name, definition] of [["attachments", "TEXT NOT NULL DEFAULT '[]'"], ["content_warning", "TEXT NOT NULL DEFAULT ''"], ["reply_to", "INTEGER"]]) {
  if (!db.prepare("SELECT 1 FROM pragma_table_info('messages') WHERE name=?").get(name))
    db.exec(`ALTER TABLE messages ADD COLUMN ${name} ${definition}`);
}
// Keep upgrades compatible with databases created by earlier LibraCord versions.
if (
  !db
    .prepare("SELECT 1 FROM pragma_table_info('users') WHERE name='settings'")
    .get()
) {
  db.exec("ALTER TABLE users ADD COLUMN settings TEXT NOT NULL DEFAULT '{}'");
}
for (const [name, definition] of [
  ["username", "TEXT NOT NULL DEFAULT ''"],
  ["avatar_url", "TEXT NOT NULL DEFAULT ''"],
  ["banner_url", "TEXT NOT NULL DEFAULT ''"],
  ["bio", "TEXT NOT NULL DEFAULT ''"],
  ["accent_color", "TEXT NOT NULL DEFAULT '#7857ff'"],
  ["profile_css", "TEXT NOT NULL DEFAULT ''"],
  ["suspended", "INTEGER NOT NULL DEFAULT 0"],
]) {
  if (
    !db
      .prepare("SELECT 1 FROM pragma_table_info('users') WHERE name=?")
      .get(name)
  )
    db.exec(`ALTER TABLE users ADD COLUMN ${name} ${definition}`);
}
if (!db.prepare("SELECT 1 FROM pragma_table_info('users') WHERE name='dm_public_key'").get())
  db.exec("ALTER TABLE users ADD COLUMN dm_public_key TEXT NOT NULL DEFAULT ''");
db.exec(
  "UPDATE users SET username='user_' || lower(substr(replace(id,'-',''),1,8)) WHERE username='' ; CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique ON users(username COLLATE NOCASE)",
);
if (
  !db
    .prepare(
      "SELECT 1 FROM pragma_table_info('communities') WHERE name='owner_id'",
    )
    .get()
)
  db.exec("ALTER TABLE communities ADD COLUMN owner_id TEXT");
if (
  !db
    .prepare(
      "SELECT 1 FROM pragma_table_info('communities') WHERE name='icon_asset_id'",
    )
    .get()
)
  db.exec("ALTER TABLE communities ADD COLUMN icon_asset_id TEXT");
if (
  !db
    .prepare(
      "SELECT 1 FROM pragma_table_info('communities') WHERE name='banner_asset_id'",
    )
    .get()
)
  db.exec("ALTER TABLE communities ADD COLUMN banner_asset_id TEXT");
if (
  !db
    .prepare(
      "SELECT 1 FROM pragma_table_info('communities') WHERE name='profile'",
    )
    .get()
)
  db.exec(
    "ALTER TABLE communities ADD COLUMN profile TEXT NOT NULL DEFAULT '{}'",
  );
if (
  !db
    .prepare(
      "SELECT 1 FROM pragma_table_info('channels') WHERE name='category_id'",
    )
    .get()
)
  db.exec("ALTER TABLE channels ADD COLUMN category_id TEXT");
for (const [name, definition] of [
  ["topic", "TEXT NOT NULL DEFAULT ''"],
  ["slowmode_seconds", "INTEGER NOT NULL DEFAULT 0"],
  ["content_visibility", "TEXT NOT NULL DEFAULT 'default'"],
  ["announcement", "INTEGER NOT NULL DEFAULT 0"],
  ["nsfw", "INTEGER NOT NULL DEFAULT 0"],
  ["voice_codec", "TEXT NOT NULL DEFAULT 'opus'"],
  ["voice_bitrate", "INTEGER NOT NULL DEFAULT 64000"],
  ["voice_sample_rate", "INTEGER NOT NULL DEFAULT 48000"],
  ["position", "INTEGER NOT NULL DEFAULT 0"],
])
  if (
    !db
      .prepare("SELECT 1 FROM pragma_table_info('channels') WHERE name=?")
      .get(name)
  )
    db.exec(`ALTER TABLE channels ADD COLUMN ${name} ${definition}`);
for (const [name, definition] of [
  ["hoist", "INTEGER NOT NULL DEFAULT 0"],
  ["mentionable", "INTEGER NOT NULL DEFAULT 0"],
  ["style", "TEXT NOT NULL DEFAULT 'solid'"],
])
  if (
    !db
      .prepare("SELECT 1 FROM pragma_table_info('guild_roles') WHERE name=?")
      .get(name)
  )
    db.exec(`ALTER TABLE guild_roles ADD COLUMN ${name} ${definition}`);
if (
  !db
    .prepare(
      "SELECT 1 FROM pragma_table_info('instance_emojis') WHERE name='guild_id'",
    )
    .get()
)
  db.exec("ALTER TABLE instance_emojis ADD COLUMN guild_id TEXT");
if (!db.prepare("SELECT id FROM instance_settings WHERE id=1").get())
  db.prepare("INSERT INTO instance_settings VALUES(1,?,?)").run(
    JSON.stringify({
      name: "LibraCord",
      shortDescription: "A federated community",
      description: "",
      contactEmail: "",
      rules: [],
      registrations: "open",
      federationMode: "allowlist",
      maxUploadMb: 8,
      retentionDays: 0,
      accentColor: "#7857ff",
    }),
    new Date().toISOString(),
  );
for (const guild of db.prepare("SELECT id FROM communities").all()) {
  if (
    !db
      .prepare("SELECT id FROM guild_roles WHERE guild_id=? AND managed=1")
      .get(guild.id)
  )
    db.prepare(
      "INSERT INTO guild_roles(id,guild_id,name,color,permissions,position,managed) VALUES(?,?,?,?,?,?,?)",
    ).run(randomUUID(), guild.id, "@everyone", "#99aab5", "1051649", 0, 1);
}
db.prepare(
  "UPDATE guild_roles SET permissions='1051649' WHERE managed=1 AND permissions='1537'",
).run();
if (db.prepare("SELECT COUNT(*) AS count FROM communities").get().count === 0) {
  db.prepare("INSERT INTO communities(id,name,description) VALUES(?,?,?)").run(
    "libracord",
    "LibraCord",
    "The first community on this instance",
  );
  const insert = db.prepare(
    "INSERT INTO channels(id,community_id,name,kind) VALUES(?,?,?,?)",
  );
  insert.run("general", "libracord", "general", "text");
  insert.run("lounge", "libracord", "Lounge", "voice");
}
export function listCommunities(userId = null) {
  const communities = userId
    ? db.prepare("SELECT c.* FROM communities c JOIN guild_members m ON m.guild_id=c.id WHERE m.user_id=? ORDER BY c.name").all(userId)
    : db.prepare("SELECT * FROM communities ORDER BY name").all();
  const channels = db
    .prepare("SELECT * FROM channels ORDER BY position,kind,name")
    .all();
  return communities.map((c) => ({
    ...c,
    icon_url: c.icon_asset_id ? `/api/v1/assets/${c.icon_asset_id}` : "",
    banner_url: c.banner_asset_id ? `/api/v1/assets/${c.banner_asset_id}` : "",
    profile:
      typeof c.profile === "string" ? JSON.parse(c.profile || "{}") : c.profile,
    channels: channels.filter((x) => x.community_id === c.id && (!userId || userCanAccessChannel(x.id, userId))),
  }));
}
export function channelExists(id, kind) {
  return Boolean(
    db.prepare("SELECT id FROM channels WHERE id=? AND kind=?").get(id, kind),
  );
}
export function isGuildMember(guildId, userId) {
  return Boolean(
    db.prepare("SELECT 1 FROM guild_members WHERE guild_id=? AND user_id=?").get(guildId, userId),
  );
}
export function userHasChannelPermission(channelId, userId, permissionBit) {
  const channel = db.prepare("SELECT * FROM channels WHERE id=?").get(channelId);
  if (!channel) return false;
  const guild = db.prepare("SELECT * FROM communities WHERE id=?").get(channel.community_id);
  if (!guild) return false;
  if (guild.owner_id === userId) return true;
  const member = db.prepare("SELECT 1 FROM guild_members WHERE guild_id=? AND user_id=?").get(channel.community_id, userId);
  if (!member) return false;
  const roles = db.prepare(`SELECT r.* FROM guild_roles r WHERE r.guild_id=? AND (r.managed=1 OR r.id IN (SELECT role_id FROM member_roles WHERE guild_id=? AND user_id=?))`).all(channel.community_id, channel.community_id, userId);
  let mask = roles.reduce((value, role) => value | BigInt(role.permissions || 0), 0n);
  if (mask & (1n << 3n)) return true;
  for (const override of db.prepare("SELECT * FROM permission_overrides WHERE guild_id=? AND target_id IN (SELECT role_id FROM member_roles WHERE guild_id=? AND user_id=? UNION SELECT id FROM guild_roles WHERE guild_id=? AND managed=1) AND (channel_id IS NULL OR channel_id=? OR category_id=?)").all(channel.community_id, channel.community_id, userId, channel.community_id, channel.id, channel.category_id || null)) {
    mask &= ~BigInt(override.deny_mask || 0);
    mask |= BigInt(override.allow_mask || 0);
  }
  return Boolean(mask & BigInt(permissionBit));
}
export function userCanAccessChannel(channelId, userId) {
  return userHasChannelPermission(channelId, userId, 1n << 10n);
}
export function userCanSendToChannel(channelId, userId) {
  return userHasChannelPermission(channelId, userId, 1n << 11n);
}
export function userCanConnectToChannel(channelId, userId) {
  return userHasChannelPermission(channelId, userId, 1n << 20n);
}
export function listMessages(id) {
  return db
    .prepare(
      "SELECT * FROM messages WHERE channel_id=? ORDER BY id DESC LIMIT 100",
    )
    .all(id)
    .reverse()
    .map((message) => ({
      ...message,
      attachments: (() => { try { return JSON.parse(message.attachments || "[]"); } catch { return []; } })(),
    }));
}
export function createMessage({ channelId, authorId, authorName, body, attachments = [], contentWarning = "", replyTo = null }) {
  const createdAt = new Date().toISOString();
  const result = db
    .prepare(
      "INSERT INTO messages(channel_id,author_id,author_name,body,created_at,attachments,content_warning,reply_to) VALUES(?,?,?,?,?,?,?,?)",
    )
    .run(channelId, authorId, authorName, body, createdAt, JSON.stringify(attachments), contentWarning, replyTo);
  return {
    id: Number(result.lastInsertRowid),
    channel_id: channelId,
    author_id: authorId,
    author_name: authorName,
    body,
    created_at: createdAt,
    attachments,
    content_warning: contentWarning,
    reply_to: replyTo,
  };
}

export function countUsers() {
  return db.prepare("SELECT COUNT(*) AS count FROM users").get().count;
}
export function createUser({
  id,
  email,
  username,
  displayName,
  passwordHash,
  role,
}) {
  const createdAt = new Date().toISOString();
  db.prepare(
    "INSERT INTO users(id,email,username,display_name,password_hash,role,created_at) VALUES(?,?,?,?,?,?,?)",
  ).run(id, email, username, displayName, passwordHash, role, createdAt);
  return {
    id,
    email,
    username,
    display_name: displayName,
    avatar_url: "",
    banner_url: "",
    bio: "",
    settings: {},
    role,
    created_at: createdAt,
  };
}
export function findUserByEmail(email) {
  return db.prepare("SELECT * FROM users WHERE email=?").get(email);
}
export function findUserByUsername(username) {
  return db
    .prepare("SELECT * FROM users WHERE username=? COLLATE NOCASE")
    .get(username);
}
export function listFriends(userId) {
  return db.prepare(`SELECT u.id,u.username,u.display_name,u.avatar_url,u.banner_url,u.accent_color,
    COALESCE(json_extract(u.settings,'$.statusText'),'') AS status_text,
    COALESCE(json_extract(u.settings,'$.selectedUsernameStyleIds'),'[]') AS username_style_ids
    FROM users u JOIN friend_requests f ON f.status='accepted' AND ((f.from_user=? AND f.to_user=u.id) OR (f.to_user=? AND f.from_user=u.id))`).all(userId, userId);
}
export function sendFriendRequest(fromUser, toUser) {
  if (!toUser || fromUser === toUser) throw new Error("Invalid friend");
  const id = randomUUID();
  db.prepare("INSERT INTO friend_requests(id,from_user,to_user,created_at) VALUES(?,?,?,?) ON CONFLICT(from_user,to_user) DO UPDATE SET status='pending'").run(id, fromUser, toUser, new Date().toISOString());
  return id;
}
export function listFriendRequests(userId) {
  return db.prepare(`SELECT f.id,f.status,u.id AS user_id,u.username,u.display_name,u.avatar_url,u.accent_color FROM friend_requests f JOIN users u ON u.id=f.from_user WHERE f.to_user=? AND f.status='pending'`).all(userId);
}
export function acceptFriendRequest(id, userId) { return db.prepare("UPDATE friend_requests SET status='accepted' WHERE id=? AND to_user=?").run(id, userId).changes > 0; }
export function removeFriend(userId, otherId) { return db.prepare("DELETE FROM friend_requests WHERE status='accepted' AND ((from_user=? AND to_user=?) OR (from_user=? AND to_user=?))").run(userId, otherId, otherId, userId).changes > 0; }
export function findPublicUser(id) {
  return db
    .prepare(
      "SELECT id,username,display_name,avatar_url,banner_url,bio,accent_color,profile_css,role,settings,created_at,dm_public_key FROM users WHERE id=?",
    )
    .get(id);
}
export function setDmPublicKey(userId, key) {
  db.prepare("UPDATE users SET dm_public_key=? WHERE id=?").run(String(key || "").slice(0, 10000), userId);
  return db.prepare("SELECT dm_public_key FROM users WHERE id=?").get(userId)?.dm_public_key || "";
}
export function createSession(idHash, userId, expiresAt) {
  db.prepare("INSERT INTO sessions VALUES(?,?,?)").run(
    idHash,
    userId,
    expiresAt,
  );
}
export function deleteSession(idHash) {
  db.prepare("DELETE FROM sessions WHERE id_hash=?").run(idHash);
}
export function findUserBySession(idHash) {
  return db
    .prepare(
      `SELECT users.id,users.email,users.username,users.display_name,users.avatar_url,users.banner_url,users.bio,users.accent_color,users.profile_css,users.role,users.suspended,users.created_at,users.settings FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.id_hash=? AND sessions.expires_at>?`,
    )
    .get(idHash, new Date().toISOString());
}
export function updateProfile(
  id,
  {
    username,
    displayName,
    avatarUrl,
    bannerUrl,
    bio,
    accentColor,
    profileCss,
    settings,
  },
) {
  db.prepare(
    "UPDATE users SET username=?,display_name=?,avatar_url=?,banner_url=?,bio=?,accent_color=?,profile_css=?,settings=? WHERE id=?",
  ).run(
    username,
    displayName,
    avatarUrl,
    bannerUrl,
    bio,
    accentColor,
    profileCss,
    JSON.stringify(settings),
    id,
  );
  return db
    .prepare(
      "SELECT id,email,username,display_name,avatar_url,banner_url,bio,accent_color,profile_css,role,created_at,settings FROM users WHERE id=?",
    )
    .get(id);
}
export function updateProfileImage(id, kind, url) {
  const column = kind === "avatar" ? "avatar_url" : "banner_url";
  db.prepare(`UPDATE users SET ${column}=? WHERE id=?`).run(url, id);
  return db
    .prepare(
      "SELECT id,email,username,display_name,avatar_url,banner_url,bio,accent_color,profile_css,role,created_at,settings FROM users WHERE id=?",
    )
    .get(id);
}
export function updatePassword(id, passwordHash) {
  db.prepare("UPDATE users SET password_hash=? WHERE id=?").run(
    passwordHash,
    id,
  );
}
export function listPeers() {
  return db.prepare("SELECT * FROM federation_peers ORDER BY name").all();
}
export function createPeer({ id, name, baseUrl, status }) {
  const now = new Date().toISOString();
  db.prepare("INSERT INTO federation_peers VALUES(?,?,?,?,?,?)").run(
    id,
    name,
    baseUrl,
    status,
    now,
    now,
  );
  return db.prepare("SELECT * FROM federation_peers WHERE id=?").get(id);
}
export function updatePeer(id, { name, baseUrl, status }) {
  db.prepare(
    "UPDATE federation_peers SET name=?,base_url=?,status=?,updated_at=? WHERE id=?",
  ).run(name, baseUrl, status, new Date().toISOString(), id);
  return db.prepare("SELECT * FROM federation_peers WHERE id=?").get(id);
}
export function deletePeer(id) {
  return (
    db.prepare("DELETE FROM federation_peers WHERE id=?").run(id).changes > 0
  );
}
export function getInstanceSettings() {
  const row = db
    .prepare("SELECT data,updated_at FROM instance_settings WHERE id=1")
    .get();
  return { ...JSON.parse(row.data), updated_at: row.updated_at };
}
export function saveInstanceSettings(data) {
  const updatedAt = new Date().toISOString();
  db.prepare("UPDATE instance_settings SET data=?,updated_at=? WHERE id=1").run(
    JSON.stringify(data),
    updatedAt,
  );
  return { ...data, updated_at: updatedAt };
}
export function createCommunity({ id, name, description, ownerId }) {
  db.prepare(
    "INSERT INTO communities(id,name,description,owner_id) VALUES(?,?,?,?)",
  ).run(id, name, description, ownerId);
  const community = db.prepare("SELECT * FROM communities WHERE id=?").get(id);
  return { ...community, profile: JSON.parse(community.profile || "{}") };
}
export function updateCommunity(
  id,
  { name, description, iconAssetId, bannerAssetId, profile },
) {
  db.prepare(
    "UPDATE communities SET name=?,description=?,icon_asset_id=?,banner_asset_id=?,profile=? WHERE id=?",
  ).run(
    name,
    description,
    iconAssetId,
    bannerAssetId,
    JSON.stringify(profile || {}),
    id,
  );
  const community = db.prepare("SELECT * FROM communities WHERE id=?").get(id);
  return {
    ...community,
    icon_url: community.icon_asset_id ? `/api/v1/assets/${community.icon_asset_id}` : "",
    banner_url: community.banner_asset_id ? `/api/v1/assets/${community.banner_asset_id}` : "",
    profile: JSON.parse(community.profile || "{}"),
  };
}
export function findCommunity(id) {
  return db.prepare("SELECT * FROM communities WHERE id=?").get(id);
}
export function listCommunityChannels(communityId) {
  return db.prepare("SELECT * FROM channels WHERE community_id=? ORDER BY name").all(communityId);
}
export function removeCommunity(id) {
  db.exec("BEGIN");
  try {
    db.prepare(
      "DELETE FROM messages WHERE channel_id IN (SELECT id FROM channels WHERE community_id=?)",
    ).run(id);
    db.prepare("DELETE FROM channels WHERE community_id=?").run(id);
    const changed = db
      .prepare("DELETE FROM communities WHERE id=?")
      .run(id).changes;
    db.exec("COMMIT");
    return changed > 0;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
export function createChannel({ id, communityId, name, kind, position = 0 }) {
  db.prepare(
    "INSERT INTO channels(id,community_id,name,kind,position) VALUES(?,?,?,?,?)",
  ).run(id, communityId, name, kind, position);
  return db.prepare("SELECT * FROM channels WHERE id=?").get(id);
}
export function listUsers() {
  return db
    .prepare(
      "SELECT id,email,username,display_name,role,suspended,created_at FROM users ORDER BY created_at",
    )
    .all();
}
export function setUserAdministration(id, { role, suspended }) {
  db.prepare(
    "UPDATE users SET role=?,suspended=? WHERE id=? AND role<>'owner'",
  ).run(role, suspended ? 1 : 0, id);
  return db
    .prepare(
      "SELECT id,email,username,display_name,role,suspended,created_at FROM users WHERE id=?",
    )
    .get(id);
}
export function createAsset(asset) {
  db.prepare(
    "INSERT INTO assets(id,owner_user_id,kind,mime_type,size,sha256,filename,origin_instance,origin_asset_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
  ).run(
    asset.id,
    asset.ownerUserId,
    asset.kind,
    asset.mimeType,
    asset.size,
    asset.sha256,
    asset.filename,
    asset.originInstance || null,
    asset.originAssetId || null,
    asset.createdAt,
  );
  return findAsset(asset.id);
}
export function findAsset(id) {
  return db.prepare("SELECT * FROM assets WHERE id=?").get(id);
}
export function findAllowedPeer(id) {
  return db
    .prepare("SELECT * FROM federation_peers WHERE id=? AND status='allowed'")
    .get(id);
}
export function initializeGuildAccess(guildId, userId, roleId) {
  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO guild_roles(id,guild_id,name,color,permissions,position,managed) VALUES(?,?,?,?,?,?,?)",
  ).run(roleId, guildId, "@everyone", "#99aab5", "1051649", 0, 1);
  db.prepare("INSERT OR IGNORE INTO guild_members VALUES(?,?,?,?)").run(
    guildId,
    userId,
    null,
    now,
  );
}
export function listGuildMembers(guildId) {
  return db
    .prepare(
      `SELECT u.id,u.username,u.display_name,u.avatar_url,u.banner_url,u.accent_color,u.role,
       COALESCE(json_extract(u.settings,'$.status'),'online') AS presence_status,
       COALESCE(json_extract(u.settings,'$.statusText'),'') AS status_text,
       COALESCE(json_extract(u.settings,'$.selectedDecorationId'),'') AS decoration_id,
       COALESCE(json_extract(u.settings,'$.selectedProfileThemeId'),'') AS profile_theme_id,
       COALESCE(json_extract(u.settings,'$.selectedUsernameStyleIds'),'[]') AS username_style_ids,
       m.nickname,m.joined_at FROM guild_members m JOIN users u ON u.id=m.user_id
       WHERE m.guild_id=? ORDER BY COALESCE(m.nickname,u.display_name)`,
    )
    .all(guildId);
}
export function removeGuildMember(guildId, userId) {
  const guild = findCommunity(guildId);
  if (!guild || guild.owner_id === userId) return false;
  db.prepare("DELETE FROM member_roles WHERE guild_id=? AND user_id=?").run(guildId, userId);
  return db.prepare("DELETE FROM guild_members WHERE guild_id=? AND user_id=?").run(guildId, userId).changes > 0;
}
export function listGuildRoles(guildId) {
  return db
    .prepare(
      "SELECT * FROM guild_roles WHERE guild_id=? ORDER BY position DESC",
    )
    .all(guildId);
}
export function listUserGuildRoles(guildId, userId) {
  return db
    .prepare(
      `SELECT r.id,r.name,r.color,r.position FROM guild_roles r
       WHERE r.guild_id=? AND (r.managed=1 OR r.id IN
       (SELECT role_id FROM member_roles WHERE guild_id=? AND user_id=?))
       ORDER BY r.position DESC`,
    )
    .all(guildId, guildId, userId);
}
export function createGuildRole(role) {
  db.prepare(
    "INSERT INTO guild_roles(id,guild_id,name,color,permissions,position,managed) VALUES(?,?,?,?,?,?,?)",
  ).run(
    role.id,
    role.guildId,
    role.name,
    role.color,
    role.permissions,
    role.position,
    0,
  );
  return db.prepare("SELECT * FROM guild_roles WHERE id=?").get(role.id);
}
export function updateGuildRole(
  id,
  { name, color, permissions, hoist, mentionable, style },
) {
  const result = db
    .prepare(
      "UPDATE guild_roles SET name=?,color=?,permissions=?,hoist=?,mentionable=?,style=? WHERE id=? AND managed=0",
    )
    .run(
      name,
      color,
      permissions,
      hoist ? 1 : 0,
      mentionable ? 1 : 0,
      style,
      id,
    );
  return result.changes
    ? db.prepare("SELECT * FROM guild_roles WHERE id=?").get(id)
    : null;
}
export function createCategory(category) {
  db.prepare("INSERT INTO channel_categories VALUES(?,?,?,?)").run(
    category.id,
    category.guildId,
    category.name,
    category.position || 0,
  );
  return category;
}
export function updateCategory(id, name, position = 0) {
  db.prepare("UPDATE channel_categories SET name=?,position=? WHERE id=?").run(name, position, id);
  return db.prepare("SELECT * FROM channel_categories WHERE id=?").get(id);
}
export function findCategory(id) {
  return db.prepare("SELECT * FROM channel_categories WHERE id=?").get(id);
}
export function deleteCategory(id) {
  db.prepare("UPDATE channels SET category_id=NULL WHERE category_id=?").run(id);
  return db.prepare("DELETE FROM channel_categories WHERE id=?").run(id).changes > 0;
}

export function reorderChannels(guildId, channels) {
  const existing = new Set(
    db.prepare("SELECT id FROM channels WHERE community_id=?").all(guildId).map((row) => row.id),
  );
  const requested = Array.isArray(channels) ? channels : [];
  if (!requested.length || requested.some((item) => !existing.has(String(item.id || ""))))
    throw new Error("Invalid channel order");
  const update = db.prepare(
    "UPDATE channels SET position=?,category_id=? WHERE id=? AND community_id=?",
  );
  db.exec("BEGIN");
  try {
    requested.forEach((item, position) =>
      update.run(position, item.categoryId || null, String(item.id), guildId),
    );
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return listCommunityChannels(guildId);
}
export function listCategories(guildId) {
  return db
    .prepare(
      "SELECT * FROM channel_categories WHERE guild_id=? ORDER BY position,name",
    )
    .all(guildId);
}
export function createInvite(invite) {
  db.prepare("INSERT INTO guild_invites VALUES(?,?,?,?,?,?,?,?)").run(
    invite.id,
    invite.guildId,
    invite.code,
    invite.creatorId,
    invite.maxUses,
    0,
    invite.expiresAt,
    invite.createdAt,
  );
  return db
    .prepare(
      "SELECT id,guild_id,code,max_uses,uses,expires_at,created_at FROM guild_invites WHERE id=?",
    )
    .get(invite.id);
}
export function listInvites(guildId) {
  return db
    .prepare(
      "SELECT id,guild_id,code,max_uses,uses,expires_at,created_at FROM guild_invites WHERE guild_id=?",
    )
    .all(guildId);
}
export function findInvite(code) {
  return db.prepare(`SELECT i.*,c.name AS guild_name,c.description AS guild_description,
    (SELECT COUNT(*) FROM guild_members WHERE guild_id=i.guild_id) AS member_count
    FROM guild_invites i JOIN communities c ON c.id=i.guild_id WHERE i.code=?`).get(code);
}
export function redeemInvite(code, userId) {
  const invite = findInvite(code);
  if (!invite) return { error: "Invite not found" };
  if (invite.expires_at && new Date(invite.expires_at) <= new Date()) return { error: "Invite expired" };
  if (invite.max_uses && invite.uses >= invite.max_uses) return { error: "Invite has reached its use limit" };
  const existing = db.prepare("SELECT 1 FROM guild_members WHERE guild_id=? AND user_id=?").get(invite.guild_id, userId);
  if (!existing) {
    db.prepare("INSERT INTO guild_members(guild_id,user_id,nickname,joined_at) VALUES(?,?,NULL,?)").run(invite.guild_id, userId, new Date().toISOString());
    db.prepare("UPDATE guild_invites SET uses=uses+1 WHERE id=?").run(invite.id);
  }
  return { invite, joined: !existing };
}
export function createWebhook(webhook) {
  db.prepare("INSERT INTO guild_webhooks VALUES(?,?,?,?,?,?,?)").run(
    webhook.id,
    webhook.guildId,
    webhook.channelId,
    webhook.name,
    webhook.tokenHash,
    webhook.createdBy,
    webhook.createdAt,
  );
  return {
    id: webhook.id,
    guild_id: webhook.guildId,
    channel_id: webhook.channelId,
    name: webhook.name,
    token: webhook.token,
    created_at: webhook.createdAt,
  };
}
export function listWebhooks(guildId) {
  return db
    .prepare(
      "SELECT id,guild_id,channel_id,name,created_at FROM guild_webhooks WHERE guild_id=?",
    )
    .all(guildId);
}
export function updateChannel(
  id,
  { name, categoryId, topic, slowmodeSeconds, contentVisibility, announcement, nsfw, voiceCodec, voiceBitrate, voiceSampleRate, position },
) {
  db.prepare(
    "UPDATE channels SET name=?,category_id=?,topic=?,slowmode_seconds=?,content_visibility=?,announcement=?,nsfw=?,voice_codec=?,voice_bitrate=?,voice_sample_rate=?,position=? WHERE id=?",
  ).run(
    name,
    categoryId || null,
    topic || "",
    slowmodeSeconds || 0,
    contentVisibility || "default",
    announcement ? 1 : 0,
    nsfw ? 1 : 0,
    voiceCodec || "opus",
    Number(voiceBitrate) || 64000,
    Number(voiceSampleRate) || 48000,
    Number(position) || 0,
    id,
  );
  return db.prepare("SELECT * FROM channels WHERE id=?").get(id);
}
export function findChannel(id) {
  return db.prepare("SELECT * FROM channels WHERE id=?").get(id);
}
export function deleteChannel(id) {
  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM messages WHERE channel_id=?").run(id);
    db.prepare("DELETE FROM permission_overrides WHERE channel_id=?").run(id);
    db.prepare("DELETE FROM guild_webhooks WHERE channel_id=?").run(id);
    const changed = db
      .prepare("DELETE FROM channels WHERE id=?")
      .run(id).changes;
    db.exec("COMMIT");
    return changed > 0;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
export function permissionSnapshot(guildId, userId, channelId = null) {
  const guild = findCommunity(guildId),
    member = isGuildMember(guildId, userId),
    roles = db
      .prepare(
        `SELECT r.* FROM guild_roles r WHERE r.guild_id=? AND (r.managed=1 OR r.id IN (SELECT role_id FROM member_roles WHERE guild_id=? AND user_id=?))`,
      )
      .all(guildId, guildId, userId),
    channel = channelId
      ? db
          .prepare("SELECT * FROM channels WHERE id=? AND community_id=?")
          .get(channelId, guildId)
      : null,
    targets = [userId, ...roles.map((r) => r.id)],
    overrides = targets.length
      ? db
          .prepare(
            `SELECT * FROM permission_overrides WHERE guild_id=? AND target_id IN (${targets.map(() => "?").join(",")}) AND (channel_id IS NULL OR channel_id=? OR category_id=?)`,
          )
          .all(guildId, ...targets, channelId, channel?.category_id || null)
      : [];
  return { guild, member, roles, overrides };
}
export function listPermissionOverrides(guildId) {
  return db
    .prepare("SELECT * FROM permission_overrides WHERE guild_id=?")
    .all(guildId);
}
export function savePermissionOverride(value) {
  db.prepare(
    `INSERT INTO permission_overrides(id,guild_id,channel_id,category_id,target_type,target_id,allow_mask,deny_mask) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET allow_mask=excluded.allow_mask,deny_mask=excluded.deny_mask`,
  ).run(
    value.id,
    value.guildId,
    value.channelId || null,
    value.categoryId || null,
    value.targetType,
    value.targetId,
    value.allowMask,
    value.denyMask,
  );
  return db
    .prepare("SELECT * FROM permission_overrides WHERE id=?")
    .get(value.id);
}
export function setMemberRoles(guildId, userId, roleIds) {
  db.prepare("DELETE FROM member_roles WHERE guild_id=? AND user_id=?").run(
    guildId,
    userId,
  );
  const insert = db.prepare("INSERT INTO member_roles VALUES(?,?,?)");
  for (const roleId of roleIds) insert.run(guildId, userId, roleId);
  return roleIds;
}
export function listInstanceEmojis() {
  return db
    .prepare(
      "SELECT id,name,asset_id,creator_id,guild_id,created_at FROM instance_emojis WHERE guild_id IS NULL ORDER BY name COLLATE NOCASE",
    )
    .all()
    .map((emoji) => ({ ...emoji, url: `/api/v1/assets/${emoji.asset_id}` }));
}
export function listGuildEmojis(guildId) {
  return db
    .prepare(
      "SELECT id,name,asset_id,creator_id,guild_id,created_at FROM instance_emojis WHERE guild_id=? ORDER BY name COLLATE NOCASE",
    )
    .all(guildId)
    .map((emoji) => ({ ...emoji, url: `/api/v1/assets/${emoji.asset_id}` }));
}
export function createInstanceEmoji({
  id,
  name,
  assetId,
  creatorId,
  guildId = null,
}) {
  const createdAt = new Date().toISOString();
  db.prepare(
    "INSERT INTO instance_emojis(id,name,asset_id,creator_id,guild_id,created_at) VALUES(?,?,?,?,?,?)",
  ).run(id, name, assetId, creatorId, guildId, createdAt);
  return {
    id,
    name,
    asset_id: assetId,
    creator_id: creatorId,
    guild_id: guildId,
    created_at: createdAt,
    url: `/api/v1/assets/${assetId}`,
  };
}
export function deleteInstanceEmoji(id, guildId = undefined) {
  if (guildId === undefined)
    return (
      db.prepare("DELETE FROM instance_emojis WHERE id=?").run(id).changes > 0
    );
  return (
    db
      .prepare("DELETE FROM instance_emojis WHERE id=? AND guild_id=?")
      .run(id, guildId).changes > 0
  );
}
export function listSocialPosts() {
  return db
    .prepare(
      `SELECT p.id,p.body,p.created_at,u.id AS author_id,u.username,u.display_name,u.avatar_url,u.accent_color
      FROM social_posts p JOIN users u ON u.id=p.user_id ORDER BY p.created_at DESC LIMIT 100`,
    )
    .all();
}
export function createSocialPost({ id, userId, body }) {
  const createdAt = new Date().toISOString();
  db.prepare(
    "INSERT INTO social_posts(id,user_id,body,created_at) VALUES(?,?,?,?)",
  ).run(id, userId, body, createdAt);
  return db
    .prepare(
      `SELECT p.id,p.body,p.created_at,u.id AS author_id,u.username,u.display_name,u.avatar_url,u.accent_color
    FROM social_posts p JOIN users u ON u.id=p.user_id WHERE p.id=?`,
    )
    .get(id);
}
const builtInDecorations = [
  [
    "kawaii-cat-frame",
    "Kawaii Cat Dream",
    "A glossy pastel cat frame with stars, moonlight, and a heart bow.",
    "#ff9ed8",
    "#b99cff",
    "✦",
    "kawaii",
  ],
  [
    "sakura-sparkle",
    "Sakura Sparkle",
    "Soft cherry blossoms, rosy glass, and a tiny sparkle crown.",
    "#ff8fcf",
    "#ffd6ee",
    "✦",
    "petal",
  ],
  [
    "pastel-princess",
    "Pastel Princess",
    "A dreamy lavender and pink halo with pearl highlights.",
    "#c69cff",
    "#ffb9df",
    "♕",
    "pearl",
  ],
  [
    "candy-heart",
    "Candy Heart",
    "Bubblegum color, floating hearts, and sweet glossy edges.",
    "#ff5fa2",
    "#ffcfdf",
    "♥",
    "heart",
  ],
  [
    "moonlit-lace",
    "Moonlit Lace",
    "Elegant midnight violet with silver moon details.",
    "#8267d8",
    "#ded7ff",
    "☾",
    "lace",
  ],
  [
    "iron-vanguard",
    "Iron Vanguard",
    "Brushed steel framing with a bold ember core.",
    "#ff7148",
    "#4b5563",
    "◆",
    "armor",
  ],
  [
    "neon-ronin",
    "Neon Ronin",
    "Electric cyan edges cut through deep tactical black.",
    "#18d5ff",
    "#172033",
    "⚡",
    "blade",
  ],
  [
    "timber-wolf",
    "Timber Wolf",
    "Forest green, weathered bronze, and a rugged crest.",
    "#5fa86d",
    "#8a6543",
    "▲",
    "crest",
  ],
  [
    "midnight-racer",
    "Midnight Racer",
    "Carbon black with hot red track lines and motion glow.",
    "#f04444",
    "#151923",
    "➤",
    "carbon",
  ],
].map(
  ([slug, name, description, accentColor, secondaryColor, icon, frame]) => ({
    id: `builtin:${slug}`,
    user_id: null,
    kind: "decoration",
    name,
    description,
    payload: {
      accentColor,
      secondaryColor,
      icon,
      frame,
      effect: slug,
    },
    created_at: "2026-01-01T00:00:00.000Z",
    username: "studio",
    display_name: "LibraCord Studio",
    built_in: true,
  }),
);
// Built-in username treatments share the decoration collection so they are
// immediately available across profiles, member lists, messages and voice.
builtInDecorations.push(
  ...[
    ["pride-spectrum", "Pride Spectrum", "Animated rainbow pride gradient.", "#ff5f6d", "#845ec2", "pride"],
    ["trans-glow", "Trans Glow", "Soft blue, pink and white motion gradient.", "#5bcefa", "#f5abb9", "trans"],
    ["glitch-pop", "Glitch Pop", "Electric cyan and magenta glitch text.", "#00f5d4", "#f15bb5", "glitch"],
    ["solar-flare", "Solar Flare", "Warm gold-to-coral animated lettering.", "#ffd166", "#ef476f", "solar"],
  ].map(([slug, name, description, accentColor, secondaryColor, usernameEffect]) => ({ id: `builtin:${slug}`, user_id: null, kind: "decoration", name, description, payload: { accentColor, secondaryColor, icon: "✦", frame: "username", effect: slug, usernameEffect }, created_at: "2026-01-01T00:00:00.000Z", username: "studio", display_name: "LibraCord Studio", built_in: true })),
);
const builtInProfileThemes = [
  [
    "rosewater-dream",
    "Rosewater Dream",
    "Blush glass, warm cream, and soft rosy light.",
    "#ff8fb8",
    "#6b244b",
    "#fff1f7",
    "dream",
  ],
  [
    "starlight-princess",
    "Starlight Princess",
    "Lavender night skies with pearlescent highlights.",
    "#c6a0ff",
    "#321b61",
    "#f4ebff",
    "stars",
  ],
  [
    "mint-melody",
    "Mint Melody",
    "Fresh mint, aqua glass, and playful highlights.",
    "#62efc6",
    "#0b5b64",
    "#e9fff9",
    "bubbles",
  ],
  [
    "ember-forge",
    "Ember Forge",
    "Charcoal panels, molten orange, and forged edges.",
    "#ff7043",
    "#291713",
    "#fff0e9",
    "forge",
  ],
  [
    "deep-ocean",
    "Deep Ocean",
    "A crisp navy profile with electric blue depth.",
    "#38bdf8",
    "#071c35",
    "#e5f8ff",
    "waves",
  ],
  [
    "urban-carbon",
    "Urban Carbon",
    "Graphite geometry with precise silver contrast.",
    "#aeb8c4",
    "#11151b",
    "#f5f7fa",
    "grid",
  ],
].map(
  ([
    slug,
    name,
    description,
    accentColor,
    backgroundColor,
    textColor,
    pattern,
  ]) => ({
    id: `builtin:${slug}`,
    user_id: null,
    kind: "profile-theme",
    name,
    description,
    payload: {
      accentColor,
      backgroundColor,
      textColor,
      secondaryColor: backgroundColor,
      pattern,
    },
    created_at: "2026-01-01T00:00:00.000Z",
    username: "studio",
    display_name: "LibraCord Studio",
    built_in: true,
  }),
);
export function listPublishedItems(kind = null) {
  const rows = kind
    ? db
        .prepare(
          `SELECT i.*,u.username,u.display_name FROM published_items i JOIN users u ON u.id=i.user_id WHERE i.kind=? ORDER BY i.created_at DESC`,
        )
        .all(kind)
    : db
        .prepare(
          `SELECT i.*,u.username,u.display_name FROM published_items i JOIN users u ON u.id=i.user_id ORDER BY i.created_at DESC`,
        )
        .all();
  const published = rows.map((item) => ({
    ...item,
    payload: JSON.parse(item.payload || "{}"),
  }));
  return [
    ...[...builtInDecorations, ...builtInProfileThemes].filter(
      (item) => !kind || item.kind === kind,
    ),
    ...published,
  ];
}
export function createPublishedItem({
  id,
  userId,
  kind,
  name,
  description,
  payload,
}) {
  const createdAt = new Date().toISOString();
  db.prepare(
    "INSERT INTO published_items(id,user_id,kind,name,description,payload,created_at) VALUES(?,?,?,?,?,?,?)",
  ).run(
    id,
    userId,
    kind,
    name,
    description,
    JSON.stringify(payload || {}),
    createdAt,
  );
  return listPublishedItems().find((item) => item.id === id);
}
export function listUserCollection(userId) {
  return db
    .prepare("SELECT item_id,added_at FROM user_collections WHERE user_id=? ORDER BY added_at DESC")
    .all(userId);
}
export function addUserCollectionItem(userId, itemId) {
  db.prepare("INSERT OR REPLACE INTO user_collections(user_id,item_id,added_at) VALUES(?,?,?)").run(userId, itemId, new Date().toISOString());
  return { item_id: itemId };
}
export function removeUserCollectionItem(userId, itemId) {
  return db.prepare("DELETE FROM user_collections WHERE user_id=? AND item_id=?").run(userId, itemId).changes > 0;
}
export function ensureGuildMember(guildId, userId) {
  db.prepare("INSERT OR IGNORE INTO guild_members(guild_id,user_id,nickname,joined_at) VALUES(?,?,NULL,?)").run(guildId, userId, new Date().toISOString());
}
export function listDirectMessages(userId, otherUserId) {
  return db.prepare(`SELECT m.*,u.display_name AS author_name,u.username,u.avatar_url
    FROM direct_messages m JOIN users u ON u.id=m.sender_id
    WHERE (m.sender_id=? AND m.recipient_id=?) OR (m.sender_id=? AND m.recipient_id=?)
    ORDER BY m.created_at`).all(userId, otherUserId, otherUserId, userId);
}
export function createDirectMessage(senderId, recipientId, body) {
  const createdAt = new Date().toISOString();
  const result = db.prepare("INSERT INTO direct_messages(sender_id,recipient_id,body,created_at) VALUES(?,?,?,?)").run(senderId, recipientId, body, createdAt);
  return db.prepare(`SELECT m.*,u.display_name AS author_name,u.username,u.avatar_url FROM direct_messages m JOIN users u ON u.id=m.sender_id WHERE m.id=?`).get(result.lastInsertRowid);
}
