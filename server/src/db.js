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
 CREATE TABLE IF NOT EXISTS federation_identity(id INTEGER PRIMARY KEY CHECK(id=1),key_id TEXT NOT NULL,public_key TEXT NOT NULL,private_key TEXT NOT NULL,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS federation_events(event_id TEXT PRIMARY KEY,direction TEXT NOT NULL,origin TEXT NOT NULL,destination TEXT NOT NULL,type TEXT NOT NULL,entity_id TEXT NOT NULL,sequence INTEGER NOT NULL,envelope TEXT NOT NULL,status TEXT NOT NULL,error TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,processed_at TEXT);
 CREATE INDEX IF NOT EXISTS federation_events_origin_created ON federation_events(origin,created_at);
 CREATE TABLE IF NOT EXISTS federation_outbox(event_id TEXT NOT NULL,peer_id TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,next_attempt_at TEXT NOT NULL,last_error TEXT NOT NULL DEFAULT '',delivered_at TEXT,PRIMARY KEY(event_id,peer_id),FOREIGN KEY(event_id) REFERENCES federation_events(event_id) ON DELETE CASCADE,FOREIGN KEY(peer_id) REFERENCES federation_peers(id) ON DELETE CASCADE);
 CREATE TABLE IF NOT EXISTS federation_entity_heads(origin TEXT NOT NULL,entity_id TEXT NOT NULL,sequence INTEGER NOT NULL,event_id TEXT NOT NULL,occurred_at TEXT NOT NULL,PRIMARY KEY(origin,entity_id));
 CREATE TABLE IF NOT EXISTS remote_identities(global_id TEXT PRIMARY KEY,origin TEXT NOT NULL,remote_user_id TEXT NOT NULL,username TEXT NOT NULL,display_name TEXT NOT NULL,avatar_url TEXT NOT NULL DEFAULT '',banner_url TEXT NOT NULL DEFAULT '',public_key TEXT NOT NULL DEFAULT '',key_fingerprint TEXT NOT NULL DEFAULT '',profile TEXT NOT NULL DEFAULT '{}',verified_at TEXT,updated_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS remote_communities(global_id TEXT PRIMARY KEY,origin TEXT NOT NULL,remote_id TEXT NOT NULL,address TEXT NOT NULL,name TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',icon_url TEXT NOT NULL DEFAULT '',banner_url TEXT NOT NULL DEFAULT '',revision INTEGER NOT NULL DEFAULT 0,state TEXT NOT NULL DEFAULT '{}',updated_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS remote_memberships(community_global_id TEXT NOT NULL,user_global_id TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('pending','joined','left','banned')),roles TEXT NOT NULL DEFAULT '[]',joined_at TEXT,updated_at TEXT NOT NULL,PRIMARY KEY(community_global_id,user_global_id));
 CREATE TABLE IF NOT EXISTS federated_dm_keys(global_user_id TEXT NOT NULL,key_id TEXT NOT NULL,public_key TEXT NOT NULL,fingerprint TEXT NOT NULL,verification_status TEXT NOT NULL DEFAULT 'unverified',verified_by TEXT,verified_at TEXT,updated_at TEXT NOT NULL,PRIMARY KEY(global_user_id,key_id));
 CREATE TABLE IF NOT EXISTS federated_direct_messages(message_id TEXT PRIMARY KEY,event_id TEXT NOT NULL UNIQUE,sender_global_id TEXT NOT NULL,recipient_global_id TEXT NOT NULL,ciphertext TEXT NOT NULL,algorithm TEXT NOT NULL,sender_key_id TEXT NOT NULL,recipient_key_id TEXT NOT NULL,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS federation_peer_policy(peer_id TEXT PRIMARY KEY,trust_score INTEGER NOT NULL DEFAULT 50,state TEXT NOT NULL DEFAULT 'normal',requests_per_minute INTEGER NOT NULL DEFAULT 120,burst INTEGER NOT NULL DEFAULT 30,window_started_at TEXT,count INTEGER NOT NULL DEFAULT 0,last_success_at TEXT,last_failure_at TEXT,failure_count INTEGER NOT NULL DEFAULT 0,FOREIGN KEY(peer_id) REFERENCES federation_peers(id) ON DELETE CASCADE);
 CREATE TABLE IF NOT EXISTS federation_abuse_reports(id TEXT PRIMARY KEY,reporter_user_id TEXT NOT NULL,peer_id TEXT,remote_actor TEXT NOT NULL DEFAULT '',category TEXT NOT NULL,evidence TEXT NOT NULL DEFAULT '{}',status TEXT NOT NULL DEFAULT 'open',created_at TEXT NOT NULL,updated_at TEXT NOT NULL,FOREIGN KEY(reporter_user_id) REFERENCES users(id) ON DELETE CASCADE);
 CREATE TABLE IF NOT EXISTS identity_migrations(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,source_global_id TEXT NOT NULL,target_domain TEXT NOT NULL,bundle TEXT NOT NULL,secret_hash TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'created',expires_at TEXT NOT NULL,created_at TEXT NOT NULL,completed_at TEXT,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
 CREATE TABLE IF NOT EXISTS guild_bans(guild_id TEXT NOT NULL,actor_global_id TEXT NOT NULL,reason TEXT NOT NULL DEFAULT '',moderator_id TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(guild_id,actor_global_id));
 CREATE TABLE IF NOT EXISTS moderation_actions(id TEXT PRIMARY KEY,guild_id TEXT NOT NULL,action TEXT NOT NULL,target_global_id TEXT NOT NULL,reason TEXT NOT NULL DEFAULT '',moderator_id TEXT NOT NULL,metadata TEXT NOT NULL DEFAULT '{}',created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS instance_bans(user_id TEXT PRIMARY KEY,reason TEXT NOT NULL DEFAULT '',moderator_id TEXT NOT NULL,created_at TEXT NOT NULL,expires_at TEXT,revoked_at TEXT,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
 CREATE TABLE IF NOT EXISTS instance_reports(id TEXT PRIMARY KEY,reporter_id TEXT NOT NULL,target_type TEXT NOT NULL CHECK(target_type IN ('user','message','community','peer')),target_id TEXT NOT NULL,category TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',evidence TEXT NOT NULL DEFAULT '{}',status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','reviewing','actioned','dismissed')),reviewer_id TEXT,resolution TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,updated_at TEXT NOT NULL,FOREIGN KEY(reporter_id) REFERENCES users(id) ON DELETE CASCADE);
 CREATE TABLE IF NOT EXISTS instance_moderation_actions(id TEXT PRIMARY KEY,action TEXT NOT NULL,target_user_id TEXT,moderator_id TEXT NOT NULL,reason TEXT NOT NULL DEFAULT '',metadata TEXT NOT NULL DEFAULT '{}',created_at TEXT NOT NULL);
`);
for (const [name, definition] of [
  ["federation_domain", "TEXT NOT NULL DEFAULT ''"],
  ["signing_key_id", "TEXT NOT NULL DEFAULT ''"],
  ["signing_public_key", "TEXT NOT NULL DEFAULT ''"],
]) {
  if (!db.prepare("SELECT 1 FROM pragma_table_info('federation_peers') WHERE name=?").get(name))
    db.exec(`ALTER TABLE federation_peers ADD COLUMN ${name} ${definition}`);
}
for (const [name, definition] of [["attachments", "TEXT NOT NULL DEFAULT '[]'"], ["content_warning", "TEXT NOT NULL DEFAULT ''"], ["reply_to", "INTEGER"]]) {
  if (!db.prepare("SELECT 1 FROM pragma_table_info('messages') WHERE name=?").get(name))
    db.exec(`ALTER TABLE messages ADD COLUMN ${name} ${definition}`);
}
for (const [name, definition] of [["kind", "TEXT NOT NULL DEFAULT 'user'"], ["metadata", "TEXT NOT NULL DEFAULT '{}'" ]]) {
  if (!db.prepare("SELECT 1 FROM pragma_table_info('direct_messages') WHERE name=?").get(name))
    db.exec(`ALTER TABLE direct_messages ADD COLUMN ${name} ${definition}`);
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
const systemUserId = "00000000-0000-4000-8000-000000000001";
const systemDisplayName = `${String(getInstanceSettings().name || "LibraCord").slice(0, 64)} System`;
if (!db.prepare("SELECT id FROM users WHERE id=?").get(systemUserId))
  db.prepare(`INSERT INTO users(id,email,username,display_name,password_hash,role,created_at,settings,bio,accent_color)
    VALUES(?,?,?,?,?,'member',?,?,?,?)`).run(systemUserId, "system@internal.invalid", "libracord-system-00000001", systemDisplayName,
      "disabled", new Date().toISOString(), JSON.stringify({ system: true, status: "online", statusText: "Official instance message" }),
      "Official messages from this LibraCord instance.", "#62efc6");
else db.prepare("UPDATE users SET display_name=? WHERE id=?").run(systemDisplayName, systemUserId);
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
  return db.prepare("SELECT COUNT(*) AS count FROM users WHERE id<>'00000000-0000-4000-8000-000000000001'").get().count;
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
  releaseExpiredInstanceBans();
  return db.prepare("SELECT * FROM users WHERE email=?").get(email);
}
function releaseExpiredInstanceBans() {
  const now = new Date().toISOString();
  const expired = db.prepare("SELECT user_id FROM instance_bans WHERE revoked_at IS NULL AND expires_at IS NOT NULL AND expires_at<=?").all(now);
  for (const ban of expired) {
    db.prepare("UPDATE instance_bans SET revoked_at=? WHERE user_id=?").run(now, ban.user_id);
    db.prepare("UPDATE users SET suspended=0 WHERE id=?").run(ban.user_id);
  }
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
  db.prepare("INSERT INTO federation_peers(id,name,base_url,status,created_at,updated_at) VALUES(?,?,?,?,?,?)").run(
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
  db.prepare("UPDATE users SET display_name=? WHERE id=?").run(`${String(data.name || "LibraCord").slice(0, 64)} System`, systemUserId);
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
export function findCommunityByReference(reference) {
  const wanted = String(reference || "");
  const direct = findCommunity(wanted);
  if (direct) return direct;
  const slug = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return db.prepare("SELECT * FROM communities").all().find((community) => slug(community.name) === slug(wanted));
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
      "SELECT id,email,username,display_name,role,suspended,created_at FROM users WHERE id<>'00000000-0000-4000-8000-000000000001' ORDER BY created_at",
    )
    .all();
}
export function setUserAdministration(id, { role, suspended }) {
  db.prepare(
    `UPDATE users SET role=?,suspended=CASE WHEN EXISTS(
      SELECT 1 FROM instance_bans WHERE user_id=? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>?)
    ) THEN 1 ELSE ? END WHERE id=? AND role<>'owner'`,
  ).run(role, id, new Date().toISOString(), suspended ? 1 : 0, id);
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
  const local = db
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
  const globalCommunityId = `${guildId}#${federationDomainForDb()}`;
  const rolesById = new Map(listGuildRoles(guildId).map((role) => [role.id, role]));
  const remote = db.prepare(`SELECT i.global_id AS id,i.username,i.display_name,i.avatar_url,i.banner_url,
    COALESCE(json_extract(i.profile,'$.accent_color'),'#62efc6') AS accent_color,'remote' AS role,
    'online' AS presence_status,'' AS status_text,'' AS decoration_id,'' AS profile_theme_id,'[]' AS username_style_ids,
    NULL AS nickname,m.joined_at,m.roles FROM remote_memberships m JOIN remote_identities i ON i.global_id=m.user_global_id
    WHERE m.community_global_id=? AND m.status='joined' ORDER BY i.display_name`).all(globalCommunityId)
    .map((member) => ({ ...member, remote: true, roles: JSON.parse(member.roles || "[]").map((id) => rolesById.get(id)).filter(Boolean) }));
  return [...local, ...remote];
}
export function removeGuildMember(guildId, userId) {
  const guild = findCommunity(guildId);
  if (!guild || guild.owner_id === userId) return false;
  if (String(userId).includes("#"))
    return db.prepare("DELETE FROM remote_memberships WHERE community_global_id=? AND user_global_id=?")
      .run(`${guildId}#${federationDomainForDb()}`, userId).changes > 0;
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
  if (String(userId).includes("#")) {
    const communityGlobalId = `${guildId}#${federationDomainForDb()}`;
    const member = db.prepare("SELECT status FROM remote_memberships WHERE community_global_id=? AND user_global_id=?").get(communityGlobalId, userId);
    if (!member) throw new Error("Remote member not found");
    saveRemoteMembership(communityGlobalId, userId, member.status, roleIds);
    return roleIds;
  }
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
  return db.prepare(`SELECT m.*,u.display_name AS author_name,u.username,u.avatar_url,u.banner_url
    FROM direct_messages m JOIN users u ON u.id=m.sender_id
    WHERE (m.sender_id=? AND m.recipient_id=?) OR (m.sender_id=? AND m.recipient_id=?)
    ORDER BY m.created_at`).all(userId, otherUserId, otherUserId, userId)
    .map((message) => ({ ...message, metadata: JSON.parse(message.metadata || "{}") }));
}
export function createDirectMessage(senderId, recipientId, body, { kind = "user", metadata = {} } = {}) {
  const createdAt = new Date().toISOString();
  const result = db.prepare("INSERT INTO direct_messages(sender_id,recipient_id,body,created_at,kind,metadata) VALUES(?,?,?,?,?,?)")
    .run(senderId, recipientId, body, createdAt, kind, JSON.stringify(metadata));
  const message = db.prepare(`SELECT m.*,u.display_name AS author_name,u.username,u.avatar_url,u.banner_url FROM direct_messages m JOIN users u ON u.id=m.sender_id WHERE m.id=?`).get(result.lastInsertRowid);
  return { ...message, metadata: JSON.parse(message.metadata || "{}") };
}
export function listDirectMessageContacts(userId) {
  return db.prepare(`SELECT u.id,u.username,u.display_name,u.avatar_url,u.banner_url,u.accent_color,u.settings,
    MAX(m.created_at) AS last_message_at
    FROM direct_messages m JOIN users u ON u.id=CASE WHEN m.sender_id=? THEN m.recipient_id ELSE m.sender_id END
    WHERE m.sender_id=? OR m.recipient_id=? GROUP BY u.id ORDER BY last_message_at DESC`).all(userId, userId, userId)
    .map((user) => {
      const settings = JSON.parse(user.settings || "{}");
      return { ...user, settings: undefined, status_text: settings.statusText || "", system: Boolean(settings.system) };
    });
}
export function getSystemUser() {
  return findPublicUser(systemUserId);
}
export function createSystemDirectMessage(recipientId, body, moderatorId, subject = "Instance moderation") {
  if (!findPublicUser(recipientId) || recipientId === systemUserId) throw new Error("Recipient not found");
  const message = createDirectMessage(systemUserId, recipientId, body, { kind: "system", metadata: { subject } });
  db.prepare("INSERT INTO instance_moderation_actions VALUES(?,?,?,?,?,?,?)")
    .run(randomUUID(), "system_message", recipientId, moderatorId, subject, JSON.stringify({ message_id: message.id }), message.created_at);
  return message;
}
export function banInstanceUser(userId, reason, moderatorId, expiresAt = null) {
  const target = db.prepare("SELECT id,role FROM users WHERE id=?").get(userId);
  if (!target || target.role === "owner" || userId === systemUserId) return null;
  const now = new Date().toISOString();
  db.exec("BEGIN");
  try {
    db.prepare(`INSERT INTO instance_bans(user_id,reason,moderator_id,created_at,expires_at,revoked_at) VALUES(?,?,?,?,?,NULL)
      ON CONFLICT(user_id) DO UPDATE SET reason=excluded.reason,moderator_id=excluded.moderator_id,created_at=excluded.created_at,expires_at=excluded.expires_at,revoked_at=NULL`)
      .run(userId, reason, moderatorId, now, expiresAt);
    db.prepare("UPDATE users SET suspended=1 WHERE id=?").run(userId);
    db.prepare("DELETE FROM sessions WHERE user_id=?").run(userId);
    db.prepare("INSERT INTO instance_moderation_actions VALUES(?,?,?,?,?,?,?)")
      .run(randomUUID(), "ban", userId, moderatorId, reason, JSON.stringify({ expires_at: expiresAt }), now);
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
  return db.prepare("SELECT * FROM instance_bans WHERE user_id=?").get(userId);
}
export function unbanInstanceUser(userId, moderatorId) {
  const ban = db.prepare("SELECT * FROM instance_bans WHERE user_id=? AND revoked_at IS NULL").get(userId);
  if (!ban) return false;
  const now = new Date().toISOString();
  db.exec("BEGIN");
  try {
    db.prepare("UPDATE instance_bans SET revoked_at=? WHERE user_id=?").run(now, userId);
    db.prepare("UPDATE users SET suspended=0 WHERE id=?").run(userId);
    db.prepare("INSERT INTO instance_moderation_actions VALUES(?,?,?,?,?,?,?)")
      .run(randomUUID(), "unban", userId, moderatorId, "", "{}", now);
    db.exec("COMMIT");
    return true;
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}
export function listInstanceBans() {
  return db.prepare(`SELECT b.*,u.username,u.display_name,m.display_name AS moderator_name FROM instance_bans b
    JOIN users u ON u.id=b.user_id LEFT JOIN users m ON m.id=b.moderator_id WHERE b.revoked_at IS NULL ORDER BY b.created_at DESC`).all();
}
export function createInstanceReport(value) {
  const now = new Date().toISOString(), id = randomUUID();
  db.prepare(`INSERT INTO instance_reports(id,reporter_id,target_type,target_id,category,description,evidence,status,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,'open',?,?)`).run(id, value.reporterId, value.targetType, value.targetId, value.category,
      value.description, JSON.stringify(value.evidence || {}), now, now);
  return getInstanceReport(id);
}
export function getInstanceReport(id) {
  const row = db.prepare(`SELECT r.*,reporter.display_name AS reporter_name,reviewer.display_name AS reviewer_name
    FROM instance_reports r JOIN users reporter ON reporter.id=r.reporter_id LEFT JOIN users reviewer ON reviewer.id=r.reviewer_id WHERE r.id=?`).get(id);
  return row ? { ...row, evidence: JSON.parse(row.evidence || "{}") } : null;
}
export function listInstanceReports() {
  return db.prepare(`SELECT r.*,reporter.display_name AS reporter_name,reviewer.display_name AS reviewer_name
    FROM instance_reports r JOIN users reporter ON reporter.id=r.reporter_id LEFT JOIN users reviewer ON reviewer.id=r.reviewer_id ORDER BY r.created_at DESC`).all()
    .map((row) => ({ ...row, evidence: JSON.parse(row.evidence || "{}") }));
}
export function updateInstanceReport(id, status, resolution, reviewerId) {
  const now = new Date().toISOString();
  const changed = db.prepare("UPDATE instance_reports SET status=?,resolution=?,reviewer_id=?,updated_at=? WHERE id=?")
    .run(status, resolution, reviewerId, now, id).changes;
  if (!changed) return null;
  db.prepare("INSERT INTO instance_moderation_actions VALUES(?,?,?,?,?,?,?)")
    .run(randomUUID(), `report.${status}`, null, reviewerId, resolution, JSON.stringify({ report_id: id }), now);
  return getInstanceReport(id);
}
export function listInstanceModerationActions() {
  return db.prepare(`SELECT a.*,target.display_name AS target_name,moderator.display_name AS moderator_name
    FROM instance_moderation_actions a LEFT JOIN users target ON target.id=a.target_user_id
    LEFT JOIN users moderator ON moderator.id=a.moderator_id ORDER BY a.created_at DESC LIMIT 1000`).all()
    .map((row) => ({ ...row, metadata: JSON.parse(row.metadata || "{}") }));
}

// Federation persistence deliberately exposes protocol-shaped operations rather
// than the database handle. Remote objects never share tables with authoritative
// local objects, which prevents a peer from overwriting local state.
export function getFederationIdentityRecord() {
  return db.prepare("SELECT * FROM federation_identity WHERE id=1").get();
}
export function saveFederationIdentityRecord({ keyId, publicKey, privateKey }) {
  db.prepare("INSERT OR REPLACE INTO federation_identity(id,key_id,public_key,private_key,created_at) VALUES(1,?,?,?,?)")
    .run(keyId, publicKey, privateKey, new Date().toISOString());
  return getFederationIdentityRecord();
}
export function findPeerByDomain(domain) {
  const wanted = String(domain || "").toLowerCase();
  return listPeers().find((peer) => {
    try { return (peer.federation_domain || new URL(peer.base_url).host).toLowerCase() === wanted; }
    catch { return false; }
  });
}
export function cachePeerSigningIdentity(peerId, domain, keyId, publicKey) {
  db.prepare("UPDATE federation_peers SET federation_domain=?,signing_key_id=?,signing_public_key=?,updated_at=? WHERE id=?")
    .run(domain, keyId, publicKey, new Date().toISOString(), peerId);
}
export function getFederationEvent(eventId) {
  return db.prepare("SELECT * FROM federation_events WHERE event_id=?").get(eventId);
}
export function saveFederationEvent(envelope, direction, status = "stored", error = "") {
  const result = db.prepare(`INSERT OR IGNORE INTO federation_events
    (event_id,direction,origin,destination,type,entity_id,sequence,envelope,status,error,created_at,processed_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      envelope.event_id, direction, envelope.origin, envelope.destination,
      envelope.type, envelope.entity_id, envelope.sequence,
      JSON.stringify(envelope), status, error, envelope.occurred_at,
      status === "processed" ? new Date().toISOString() : null,
    );
  return result.changes > 0;
}
export function markFederationEvent(eventId, status, error = "") {
  db.prepare("UPDATE federation_events SET status=?,error=?,processed_at=? WHERE event_id=?")
    .run(status, String(error || "").slice(0, 1000), new Date().toISOString(), eventId);
}
export function nextFederationSequence(origin, entityId) {
  const row = db.prepare("SELECT sequence FROM federation_entity_heads WHERE origin=? AND entity_id=?").get(origin, entityId);
  return Number(row?.sequence || 0) + 1;
}
export function acceptFederationHead(envelope) {
  const current = db.prepare("SELECT * FROM federation_entity_heads WHERE origin=? AND entity_id=?").get(envelope.origin, envelope.entity_id);
  const wins = !current || envelope.sequence > current.sequence ||
    (envelope.sequence === current.sequence && (envelope.occurred_at > current.occurred_at ||
      (envelope.occurred_at === current.occurred_at && envelope.event_id > current.event_id)));
  if (!wins) return false;
  db.prepare(`INSERT INTO federation_entity_heads(origin,entity_id,sequence,event_id,occurred_at) VALUES(?,?,?,?,?)
    ON CONFLICT(origin,entity_id) DO UPDATE SET sequence=excluded.sequence,event_id=excluded.event_id,occurred_at=excluded.occurred_at`)
    .run(envelope.origin, envelope.entity_id, envelope.sequence, envelope.event_id, envelope.occurred_at);
  return true;
}
export function queueFederationOutbox(eventId, peerId, when = new Date().toISOString()) {
  db.prepare("INSERT OR IGNORE INTO federation_outbox(event_id,peer_id,next_attempt_at) VALUES(?,?,?)").run(eventId, peerId, when);
}
export function listDueFederationOutbox(limit = 50) {
  return db.prepare(`SELECT o.*,e.envelope,p.base_url,p.status AS peer_status
    FROM federation_outbox o JOIN federation_events e ON e.event_id=o.event_id
    JOIN federation_peers p ON p.id=o.peer_id
    WHERE o.state IN ('pending','failed') AND o.next_attempt_at<=? AND p.status='allowed'
    ORDER BY o.next_attempt_at LIMIT ?`).all(new Date().toISOString(), Math.min(200, limit));
}
export function markFederationDelivery(eventId, peerId, ok, error = "") {
  if (ok) {
    db.prepare("UPDATE federation_outbox SET state='delivered',attempts=attempts+1,last_error='',delivered_at=? WHERE event_id=? AND peer_id=?")
      .run(new Date().toISOString(), eventId, peerId);
    db.prepare("INSERT OR IGNORE INTO federation_peer_policy(peer_id) VALUES(?)").run(peerId);
    db.prepare("UPDATE federation_peer_policy SET last_success_at=?,failure_count=0,trust_score=min(100,trust_score+1) WHERE peer_id=?").run(new Date().toISOString(), peerId);
    return;
  }
  const current = db.prepare("SELECT attempts FROM federation_outbox WHERE event_id=? AND peer_id=?").get(eventId, peerId);
  const attempts = Number(current?.attempts || 0) + 1;
  const delay = Math.min(3600, 2 ** Math.min(attempts, 10));
  db.prepare("UPDATE federation_outbox SET state='failed',attempts=?,last_error=?,next_attempt_at=? WHERE event_id=? AND peer_id=?")
    .run(attempts, String(error).slice(0, 1000), new Date(Date.now() + delay * 1000).toISOString(), eventId, peerId);
  db.prepare("INSERT OR IGNORE INTO federation_peer_policy(peer_id) VALUES(?)").run(peerId);
  db.prepare("UPDATE federation_peer_policy SET last_failure_at=?,failure_count=failure_count+1,trust_score=max(0,trust_score-2) WHERE peer_id=?").run(new Date().toISOString(), peerId);
}
export function recordPeerVerification(peerId, success) {
  db.prepare("INSERT OR IGNORE INTO federation_peer_policy(peer_id) VALUES(?)").run(peerId);
  db.prepare(`UPDATE federation_peer_policy SET trust_score=max(0,min(100,trust_score+?)),
    last_success_at=CASE WHEN ?=1 THEN ? ELSE last_success_at END,
    last_failure_at=CASE WHEN ?=0 THEN ? ELSE last_failure_at END,
    failure_count=CASE WHEN ?=1 THEN 0 ELSE failure_count+1 END WHERE peer_id=?`)
    .run(success ? 1 : -5, success ? 1 : 0, new Date().toISOString(), success ? 1 : 0, new Date().toISOString(), success ? 1 : 0, peerId);
}
export function listFederationEventsForPeer(peerDomain, after = "", limit = 200) {
  return db.prepare(`SELECT envelope FROM federation_events WHERE direction='outbound' AND destination=?
    AND created_at>? ORDER BY created_at,event_id LIMIT ?`).all(peerDomain, after || "1970-01-01T00:00:00.000Z", Math.min(500, limit)).map((row) => JSON.parse(row.envelope));
}
export function consumePeerRate(peerId) {
  db.prepare("INSERT OR IGNORE INTO federation_peer_policy(peer_id) VALUES(?)").run(peerId);
  const policy = db.prepare("SELECT * FROM federation_peer_policy WHERE peer_id=?").get(peerId);
  if (policy.state === "blocked") return { allowed: false, policy };
  const now = Date.now(), start = Date.parse(policy.window_started_at || "");
  const reset = !Number.isFinite(start) || now - start >= 60_000;
  const count = reset ? 1 : policy.count + 1;
  db.prepare("UPDATE federation_peer_policy SET window_started_at=?,count=? WHERE peer_id=?")
    .run(reset ? new Date(now).toISOString() : policy.window_started_at, count, peerId);
  const multiplier = policy.state === "trusted" ? 2 : policy.state === "restricted" ? 0.25 : 1;
  const limit = Math.max(1, Math.floor(policy.requests_per_minute * multiplier)) + policy.burst;
  return { allowed: count <= limit, policy: { ...policy, count, effective_limit: limit } };
}
export function listPeerPolicies() {
  return db.prepare(`SELECT p.id,p.name,p.base_url,p.status,COALESCE(x.trust_score,50) trust_score,
    COALESCE(x.state,'normal') state,COALESCE(x.requests_per_minute,120) requests_per_minute,
    COALESCE(x.burst,30) burst,x.last_success_at,x.last_failure_at,COALESCE(x.failure_count,0) failure_count
    FROM federation_peers p LEFT JOIN federation_peer_policy x ON x.peer_id=p.id ORDER BY p.name`).all();
}
export function savePeerPolicy(peerId, input) {
  db.prepare(`INSERT INTO federation_peer_policy(peer_id,trust_score,state,requests_per_minute,burst)
    VALUES(?,?,?,?,?) ON CONFLICT(peer_id) DO UPDATE SET trust_score=excluded.trust_score,state=excluded.state,
    requests_per_minute=excluded.requests_per_minute,burst=excluded.burst`).run(
      peerId, Math.max(0, Math.min(100, Number(input.trustScore) || 0)),
      ["trusted","normal","restricted","blocked"].includes(input.state) ? input.state : "normal",
      Math.max(1, Math.min(10000, Number(input.requestsPerMinute) || 120)),
      Math.max(0, Math.min(1000, Number(input.burst) || 30)),
    );
  return listPeerPolicies().find((item) => item.id === peerId);
}
export function saveRemoteIdentity(identity) {
  db.prepare(`INSERT INTO remote_identities(global_id,origin,remote_user_id,username,display_name,avatar_url,banner_url,public_key,key_fingerprint,profile,verified_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(global_id) DO UPDATE SET username=excluded.username,display_name=excluded.display_name,
    avatar_url=excluded.avatar_url,banner_url=excluded.banner_url,public_key=excluded.public_key,key_fingerprint=excluded.key_fingerprint,
    profile=excluded.profile,verified_at=excluded.verified_at,updated_at=excluded.updated_at`).run(
      identity.globalId, identity.origin, identity.remoteUserId, identity.username, identity.displayName,
      identity.avatarUrl || "", identity.bannerUrl || "", identity.publicKey || "", identity.keyFingerprint || "",
      JSON.stringify(identity.profile || {}), identity.verifiedAt || null, new Date().toISOString());
}
export function findRemoteIdentity(globalId) {
  const row = db.prepare("SELECT * FROM remote_identities WHERE global_id=?").get(globalId);
  return row ? { ...row, profile: JSON.parse(row.profile || "{}") } : null;
}
export function saveRemoteCommunity(snapshot, origin, sequence) {
  const id = snapshot.global_id || `${snapshot.id}#${origin}`;
  db.prepare(`INSERT INTO remote_communities(global_id,origin,remote_id,address,name,description,icon_url,banner_url,revision,state,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(global_id) DO UPDATE SET address=excluded.address,name=excluded.name,description=excluded.description,
    icon_url=excluded.icon_url,banner_url=excluded.banner_url,revision=excluded.revision,state=excluded.state,updated_at=excluded.updated_at`).run(
      id, origin, snapshot.id, snapshot.address || id, snapshot.name, snapshot.description || "", snapshot.icon_url || "",
      snapshot.banner_url || "", sequence, JSON.stringify(snapshot), new Date().toISOString());
  for (const member of snapshot.remote_members || []) saveRemoteMembership(id, member.global_id, member.status || "joined", member.roles || []);
  return findRemoteCommunity(id);
}
export function findRemoteCommunity(globalId) {
  const row = db.prepare("SELECT * FROM remote_communities WHERE global_id=? OR address=?").get(globalId, globalId);
  return row ? { ...row, state: JSON.parse(row.state || "{}") } : null;
}
export function removeRemoteCommunity(globalId) {
  db.prepare("DELETE FROM remote_memberships WHERE community_global_id=?").run(globalId);
  return db.prepare("DELETE FROM remote_communities WHERE global_id=?").run(globalId).changes > 0;
}
export function listRemoteCommunitiesForUser(globalUserId) {
  return db.prepare(`SELECT c.*,m.status,m.roles FROM remote_memberships m JOIN remote_communities c ON c.global_id=m.community_global_id
    WHERE m.user_global_id=? AND m.status IN ('pending','joined') ORDER BY c.name`).all(globalUserId).map((row) => ({ ...row, state: JSON.parse(row.state || "{}"), roles: JSON.parse(row.roles || "[]") }));
}
export function saveRemoteMembership(communityGlobalId, userGlobalId, status, roles = []) {
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO remote_memberships(community_global_id,user_global_id,status,roles,joined_at,updated_at) VALUES(?,?,?,?,?,?)
    ON CONFLICT(community_global_id,user_global_id) DO UPDATE SET status=excluded.status,roles=excluded.roles,updated_at=excluded.updated_at`)
    .run(communityGlobalId, userGlobalId, status, JSON.stringify(roles), status === "joined" ? now : null, now);
}
export function communityFederationSnapshot(guildId, domain) {
  const community = findCommunity(guildId);
  if (!community) return null;
  const origin = String(process.env.PUBLIC_URL || `http://${domain}`).replace(/\/$/, "");
  const asset = (id) => id ? `${origin}/api/v1/assets/${id}` : "";
  const profile = JSON.parse(community.profile || "{}");
  if (String(profile.atmosphere?.backgroundUrl || "").startsWith("/"))
    profile.atmosphere.backgroundUrl = new URL(profile.atmosphere.backgroundUrl, `${origin}/`).href;
  return {
    id: community.id, global_id: `${community.id}#${domain}`, address: `${community.name.toLowerCase().replace(/[^a-z0-9]+/g,"-")}#${domain}`,
    name: community.name, description: community.description, icon_url: asset(community.icon_asset_id), banner_url: asset(community.banner_asset_id),
    profile, channels: listCommunityChannels(guildId), categories: listCategories(guildId),
    roles: listGuildRoles(guildId), permission_overrides: listPermissionOverrides(guildId),
    members: db.prepare("SELECT guild_id,user_id,nickname,joined_at FROM guild_members WHERE guild_id=?").all(guildId),
    member_roles: db.prepare("SELECT guild_id,user_id,role_id FROM member_roles WHERE guild_id=?").all(guildId),
    remote_members: db.prepare("SELECT user_global_id AS global_id,status,roles,joined_at FROM remote_memberships WHERE community_global_id=?").all(`${guildId}#${domain}`).map((m) => ({ ...m, roles: JSON.parse(m.roles || "[]") })),
    bans: db.prepare("SELECT actor_global_id,reason,created_at FROM guild_bans WHERE guild_id=?").all(guildId),
    moderation_actions: db.prepare("SELECT id,action,target_global_id,reason,metadata,created_at FROM moderation_actions WHERE guild_id=? ORDER BY created_at DESC LIMIT 500").all(guildId).map((a) => ({ ...a, metadata: JSON.parse(a.metadata || "{}") })),
  };
}
export function listPeerDomainsForCommunity(guildId, domain) {
  const globalId = `${guildId}#${domain}`;
  return db.prepare("SELECT user_global_id FROM remote_memberships WHERE community_global_id=? AND status='joined'").all(globalId)
    .map((row) => row.user_global_id.slice(row.user_global_id.lastIndexOf("#") + 1)).filter(Boolean);
}
export function listGuildBans(guildId) {
  return db.prepare("SELECT * FROM guild_bans WHERE guild_id=? ORDER BY created_at DESC").all(guildId);
}
export function banGuildActor(guildId, actorGlobalId, reason, moderatorId) {
  const now = new Date().toISOString();
  db.prepare("INSERT OR REPLACE INTO guild_bans VALUES(?,?,?,?,?)").run(guildId, actorGlobalId, reason, moderatorId, now);
  db.prepare("UPDATE remote_memberships SET status='banned',updated_at=? WHERE community_global_id=? AND user_global_id=?")
    .run(now, `${guildId}#${federationDomainForDb()}`, actorGlobalId);
  createModerationAction(guildId, "ban", actorGlobalId, reason, moderatorId, {});
  return db.prepare("SELECT * FROM guild_bans WHERE guild_id=? AND actor_global_id=?").get(guildId, actorGlobalId);
}
function federationDomainForDb() {
  if (process.env.FEDERATION_DOMAIN) return process.env.FEDERATION_DOMAIN.toLowerCase();
  try { return new URL(process.env.PUBLIC_URL || "http://localhost:3002").host.toLowerCase(); } catch { return "localhost:3002"; }
}
export function unbanGuildActor(guildId, actorGlobalId, moderatorId) {
  const changed = db.prepare("DELETE FROM guild_bans WHERE guild_id=? AND actor_global_id=?").run(guildId, actorGlobalId).changes;
  if (changed) createModerationAction(guildId, "unban", actorGlobalId, "", moderatorId, {});
  return changed > 0;
}
export function createModerationAction(guildId, action, targetGlobalId, reason, moderatorId, metadata = {}) {
  const value = { id: randomUUID(), guild_id: guildId, action, target_global_id: targetGlobalId, reason,
    moderator_id: moderatorId, metadata, created_at: new Date().toISOString() };
  db.prepare("INSERT INTO moderation_actions VALUES(?,?,?,?,?,?,?)").run(value.id, guildId, action, targetGlobalId, reason,
    moderatorId, JSON.stringify(metadata), value.created_at);
  return value;
}
export function listModerationActions(guildId) {
  return db.prepare("SELECT * FROM moderation_actions WHERE guild_id=? ORDER BY created_at DESC LIMIT 500").all(guildId)
    .map((row) => ({ ...row, metadata: JSON.parse(row.metadata || "{}") }));
}
export function saveFederatedDm(message) {
  db.prepare(`INSERT OR IGNORE INTO federated_direct_messages(message_id,event_id,sender_global_id,recipient_global_id,ciphertext,algorithm,sender_key_id,recipient_key_id,created_at)
    VALUES(?,?,?,?,?,?,?,?,?)`).run(message.message_id, message.event_id, message.sender_global_id, message.recipient_global_id,
      message.ciphertext, message.algorithm, message.sender_key_id, message.recipient_key_id, message.created_at);
}
export function listFederatedDms(globalUserId, otherGlobalId) {
  return db.prepare(`SELECT * FROM federated_direct_messages WHERE (sender_global_id=? AND recipient_global_id=?) OR
    (sender_global_id=? AND recipient_global_id=?) ORDER BY created_at`).all(globalUserId, otherGlobalId, otherGlobalId, globalUserId);
}
export function saveFederatedDmKey(value) {
  db.prepare(`INSERT INTO federated_dm_keys(global_user_id,key_id,public_key,fingerprint,verification_status,verified_by,verified_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(global_user_id,key_id) DO UPDATE SET public_key=excluded.public_key,fingerprint=excluded.fingerprint,
    verification_status=excluded.verification_status,verified_by=excluded.verified_by,verified_at=excluded.verified_at,updated_at=excluded.updated_at`)
    .run(value.globalUserId, value.keyId, value.publicKey, value.fingerprint, value.status || "unverified", value.verifiedBy || null,
      value.status === "verified" ? new Date().toISOString() : null, new Date().toISOString());
}
export function findFederatedDmKey(globalUserId, keyId) {
  return db.prepare("SELECT * FROM federated_dm_keys WHERE global_user_id=? AND key_id=?").get(globalUserId, keyId);
}
export function createAbuseReport(value) {
  const now = new Date().toISOString(), id = randomUUID();
  db.prepare("INSERT INTO federation_abuse_reports VALUES(?,?,?,?,?,?,?,?)").run(id, value.reporterUserId, value.peerId || null,
    value.remoteActor || "", value.category, JSON.stringify(value.evidence || {}), "open", now, now);
  return { id, status: "open", created_at: now };
}
export function listAbuseReports() {
  return db.prepare("SELECT * FROM federation_abuse_reports ORDER BY created_at DESC").all().map((r) => ({ ...r, evidence: JSON.parse(r.evidence || "{}") }));
}
export function createIdentityMigration(value) {
  db.prepare("INSERT INTO identity_migrations VALUES(?,?,?,?,?,?,?,?,?,NULL)").run(value.id, value.userId, value.sourceGlobalId,
    value.targetDomain, JSON.stringify(value.bundle), value.secretHash, "created", value.expiresAt, value.createdAt);
}
export function claimIdentityMigration(id, secretHash) {
  const row = db.prepare("SELECT * FROM identity_migrations WHERE id=? AND secret_hash=? AND state='created' AND expires_at>?").get(id, secretHash, new Date().toISOString());
  if (!row) return null;
  db.prepare("UPDATE identity_migrations SET state='claimed',completed_at=? WHERE id=?").run(new Date().toISOString(), id);
  return { ...row, bundle: JSON.parse(row.bundle) };
}
