import {
  createHash,
  generateKeyPairSync,
  randomBytes,
  randomUUID,
  sign,
  verify,
} from "node:crypto";
import { EventEmitter } from "node:events";
import { lookup } from "node:dns/promises";
import {
  acceptFederationHead,
  cachePeerSigningIdentity,
  claimIdentityMigration,
  communityFederationSnapshot,
  consumePeerRate,
  createIdentityMigration,
  findCommunity,
  findCommunityByReference,
  findFederatedDmKey,
  findPeerByDomain,
  findPublicUser,
  getFederationEvent,
  getFederationIdentityRecord,
  listDueFederationOutbox,
  listCommunities,
  listFederationEventsForPeer,
  listPeerDomainsForCommunity,
  listPeers,
  markFederationDelivery,
  markFederationEvent,
  nextFederationSequence,
  queueFederationOutbox,
  recordPeerVerification,
  removeRemoteCommunity,
  saveFederatedDm,
  saveFederatedDmKey,
  saveFederationEvent,
  saveFederationIdentityRecord,
  saveRemoteCommunity,
  saveRemoteIdentity,
  saveRemoteMembership,
} from "./db.js";

export const federationEvents = new EventEmitter();
federationEvents.setMaxListeners(25);

function privateAddress(value) {
  return value === "::1" || value.startsWith("127.") || value.startsWith("10.") || value.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(value) || value.startsWith("169.254.") || value.startsWith("fc") ||
    value.startsWith("fd") || value.startsWith("fe80:");
}

export async function federationFetch(peer, path, options = {}) {
  const base = new URL(peer.base_url);
  if (!["http:", "https:"].includes(base.protocol)) throw new Error("Unsupported federation peer protocol");
  const addresses = await lookup(base.hostname, { all: true });
  if (process.env.ALLOW_PRIVATE_FEDERATION !== "true" && addresses.some((item) => privateAddress(item.address)))
    throw new Error("Private federation target blocked");
  return fetch(new URL(path, base), { redirect: "error", signal: AbortSignal.timeout(10000), ...options });
}

export function federationDomain() {
  if (process.env.FEDERATION_DOMAIN) return process.env.FEDERATION_DOMAIN.toLowerCase();
  try { return new URL(process.env.PUBLIC_URL || "http://localhost:3002").host.toLowerCase(); }
  catch { return "localhost:3002"; }
}

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function federationIdentity() {
  let identity = getFederationIdentityRecord();
  if (identity) return identity;
  const pair = generateKeyPairSync("ed25519");
  const publicKey = pair.publicKey.export({ type: "spki", format: "pem" });
  const privateKey = pair.privateKey.export({ type: "pkcs8", format: "pem" });
  const fingerprint = createHash("sha256").update(publicKey).digest("base64url").slice(0, 32);
  identity = saveFederationIdentityRecord({ keyId: `ed25519:${fingerprint}`, publicKey, privateKey });
  return identity;
}

export function publicFederationIdentity() {
  const identity = federationIdentity();
  return { key_id: identity.key_id, algorithm: "Ed25519", public_key: identity.public_key };
}

function unsignedEnvelope(envelope) {
  const { signature: _signature, ...unsigned } = envelope;
  return unsigned;
}

export function signEnvelope(input) {
  const identity = federationIdentity();
  const envelope = {
    protocol: "libracord-federation",
    version: "1.0",
    event_id: input.event_id || randomUUID(),
    origin: input.origin || federationDomain(),
    destination: String(input.destination || "").toLowerCase(),
    type: String(input.type || "").slice(0, 120),
    entity_id: String(input.entity_id || "").slice(0, 300),
    sequence: Number(input.sequence || 1),
    occurred_at: input.occurred_at || new Date().toISOString(),
    expires_at: input.expires_at || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    key_id: identity.key_id,
    payload: input.payload ?? {},
  };
  envelope.signature = sign(null, Buffer.from(canonicalJson(envelope)), identity.private_key).toString("base64url");
  return envelope;
}

export async function discoverFederationPeer(peer) {
  const response = await federationFetch(peer, "/.well-known/libracord", { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`Peer discovery returned ${response.status}`);
  const discovery = await response.json();
  const domain = String(discovery.domain || new URL(peer.base_url).host).toLowerCase();
  if (discovery.protocol !== "libracord" || discovery.signing_key?.algorithm !== "Ed25519" || !discovery.signing_key?.public_key)
    throw new Error("Peer has no supported federation identity");
  cachePeerSigningIdentity(peer.id, domain, discovery.signing_key.key_id, discovery.signing_key.public_key);
  return { ...discovery, domain };
}

async function peerKey(peer, envelope) {
  if (peer.signing_public_key && peer.signing_key_id === envelope.key_id) return peer.signing_public_key;
  const discovery = await discoverFederationPeer(peer);
  if (discovery.domain !== envelope.origin || discovery.signing_key?.key_id !== envelope.key_id)
    throw new Error("Peer identity does not match the signed origin");
  return discovery.signing_key.public_key;
}

export async function verifyEnvelope(envelope, { consumeRate = true } = {}) {
  if (!envelope || envelope.protocol !== "libracord-federation" || envelope.version !== "1.0") throw new Error("Unsupported federation envelope");
  for (const field of ["event_id","origin","destination","type","entity_id","occurred_at","expires_at","key_id","signature"])
    if (!envelope[field] || typeof envelope[field] !== "string") throw new Error(`Missing federation field: ${field}`);
  if (envelope.destination.toLowerCase() !== federationDomain()) throw new Error("Event is addressed to another instance");
  if (!Number.isSafeInteger(envelope.sequence) || envelope.sequence < 1) throw new Error("Invalid event sequence");
  const occurred = Date.parse(envelope.occurred_at), expires = Date.parse(envelope.expires_at), now = Date.now();
  if (!Number.isFinite(occurred) || !Number.isFinite(expires) || occurred > now + 5 * 60_000 || expires < now || expires - occurred > 7 * 24 * 60 * 60_000)
    throw new Error("Federation event timestamp is invalid or expired");
  const peer = findPeerByDomain(envelope.origin);
  if (!peer || peer.status !== "allowed") throw new Error("Federation peer is not allowed");
  if (consumeRate && !consumePeerRate(peer.id).allowed) {
    const error = new Error("Peer rate limit exceeded"); error.status = 429; throw error;
  }
  try {
    const publicKey = await peerKey(peer, envelope);
    const valid = verify(null, Buffer.from(canonicalJson(unsignedEnvelope(envelope))), publicKey, Buffer.from(envelope.signature, "base64url"));
    if (!valid) throw new Error("Invalid federation signature");
    recordPeerVerification(peer.id, true);
    return peer;
  } catch (error) {
    recordPeerVerification(peer.id, false);
    throw error;
  }
}

export async function queueFederationEvent({ peer, destination, type, entityId, payload, expiresAt }) {
  const target = peer || findPeerByDomain(destination);
  if (!target || target.status !== "allowed") throw new Error("Destination peer is not allowed");
  const targetDomain = (target.federation_domain || (await discoverFederationPeer(target)).domain).toLowerCase();
  const envelope = signEnvelope({ destination: targetDomain, type, entity_id: entityId,
    sequence: nextFederationSequence(federationDomain(), entityId), payload, expires_at: expiresAt });
  acceptFederationHead(envelope);
  saveFederationEvent(envelope, "outbound", "queued");
  queueFederationOutbox(envelope.event_id, target.id);
  void deliverFederationOutbox();
  return envelope;
}

export async function publishCommunitySnapshot(guildId) {
  const snapshot = communityFederationSnapshot(guildId, federationDomain());
  if (!snapshot) return [];
  const relevantDomains = new Set(listPeerDomainsForCommunity(guildId, federationDomain()));
  return Promise.all(listPeers().filter((peer) => peer.status === "allowed" && relevantDomains.has(
    (peer.federation_domain || new URL(peer.base_url).host).toLowerCase())).map((peer) =>
    queueFederationEvent({ peer, type: "community.snapshot", entityId: snapshot.global_id, payload: snapshot })));
}

export async function publishCommunityDeleted(guildId, peers) {
  const globalId = `${guildId}#${federationDomain()}`;
  return Promise.all(peers.map((peer) => queueFederationEvent({ peer, type: "community.delete", entityId: globalId,
    payload: { global_id: globalId, deleted_at: new Date().toISOString() } })));
}

let deliveringOutbox = false;
export async function deliverFederationOutbox() {
  if (deliveringOutbox) return 0;
  deliveringOutbox = true;
  try {
  const due = listDueFederationOutbox(50);
  await Promise.allSettled(due.map(async (item) => {
    try {
      const response = await federationFetch({ base_url: item.base_url }, "/api/v1/federation/inbox", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" }, body: item.envelope,
      });
      if (!response.ok && response.status !== 409) throw new Error(`Peer returned ${response.status}`);
      markFederationDelivery(item.event_id, item.peer_id, true);
    } catch (error) { markFederationDelivery(item.event_id, item.peer_id, false, error.message); }
  }));
  return due.length;
  } finally {
    deliveringOutbox = false;
  }
}

function identityFromPayload(payload, origin) {
  const value = payload?.identity || payload;
  const remoteUserId = String(value.id || "");
  if (!remoteUserId) throw new Error("Remote identity is missing an id");
  return {
    globalId: `${remoteUserId}#${origin}`, origin, remoteUserId,
    username: String(value.username || "remote-user").slice(0, 64),
    displayName: String(value.display_name || value.username || "Remote user").slice(0, 80),
    avatarUrl: String(value.avatar_url || "").slice(0, 2048), bannerUrl: String(value.banner_url || "").slice(0, 2048),
    publicKey: String(value.dm_public_key || "").slice(0, 10000),
    keyFingerprint: value.dm_public_key ? createHash("sha256").update(value.dm_public_key).digest("base64url") : "",
    profile: value.profile || {}, verifiedAt: new Date().toISOString(),
  };
}

export async function processIncomingEnvelope(envelope) {
  await verifyEnvelope(envelope);
  if (getFederationEvent(envelope.event_id)) return { duplicate: true, event_id: envelope.event_id };
  if (!saveFederationEvent(envelope, "inbound", "stored")) return { duplicate: true, event_id: envelope.event_id };
  if (!acceptFederationHead(envelope)) {
    markFederationEvent(envelope.event_id, "superseded");
    return { accepted: false, superseded: true, event_id: envelope.event_id };
  }
  try {
    if (envelope.type === "identity.upsert") {
      const identity = identityFromPayload(envelope.payload, envelope.origin);
      saveRemoteIdentity(identity);
      if (identity.publicKey) saveFederatedDmKey({ globalUserId: identity.globalId, keyId: `identity:${identity.keyFingerprint.slice(0, 24)}`,
        publicKey: identity.publicKey, fingerprint: identity.keyFingerprint, status: "unverified" });
    }
    else if (envelope.type === "community.snapshot") {
      const community = saveRemoteCommunity(envelope.payload, envelope.origin, envelope.sequence);
      federationEvents.emit("remote-community:changed", { communityGlobalId: community.global_id });
    }
    else if (envelope.type === "community.delete") {
      removeRemoteCommunity(envelope.payload?.global_id || envelope.entity_id);
      federationEvents.emit("community:deleted", { communityGlobalId: envelope.entity_id });
    }
    else if (envelope.type === "membership.join.request") {
      const community = findCommunity(String(envelope.payload?.community_id || ""));
      if (!community) throw new Error("Community not found");
      const communityProfile = typeof community.profile === "string" ? JSON.parse(community.profile || "{}") : (community.profile || {});
      if (communityProfile.accessMode === "invite") throw new Error("This community is invite only");
      const identity = identityFromPayload(envelope.payload, envelope.origin);
      saveRemoteIdentity(identity);
      if (identity.publicKey) saveFederatedDmKey({ globalUserId: identity.globalId, keyId: `identity:${identity.keyFingerprint.slice(0, 24)}`,
        publicKey: identity.publicKey, fingerprint: identity.keyFingerprint, status: "unverified" });
      const communityGlobalId = `${community.id}#${federationDomain()}`;
      saveRemoteMembership(communityGlobalId, identity.globalId, "joined", []);
      await queueFederationEvent({ destination: envelope.origin, type: "membership.upsert", entityId: `${communityGlobalId}:${identity.globalId}`,
        payload: { community_global_id: communityGlobalId, user_global_id: identity.globalId, status: "joined", roles: [], snapshot: communityFederationSnapshot(community.id, federationDomain()) } });
      federationEvents.emit("community:changed", { communityId: community.id });
    } else if (envelope.type === "membership.upsert") {
      const p = envelope.payload;
      if (p.snapshot) saveRemoteCommunity(p.snapshot, envelope.origin, envelope.sequence);
      saveRemoteMembership(p.community_global_id, p.user_global_id, p.status, p.roles || []);
      federationEvents.emit("membership:changed", p);
    } else if (["role.upsert","permission.upsert","ban.upsert","moderation.action"].includes(envelope.type)) {
      // Fine-grained moderation events carry the authoritative community snapshot
      // so an offline receiver can atomically converge to the same revision.
      if (envelope.payload?.snapshot) saveRemoteCommunity(envelope.payload.snapshot, envelope.origin, envelope.sequence);
    } else if (envelope.type === "dm.encrypted") {
      const message = envelope.payload;
      if (!message?.ciphertext || String(message.ciphertext).length > 256_000) throw new Error("Invalid encrypted message");
      saveFederatedDm({ ...message, event_id: envelope.event_id });
      federationEvents.emit("dm:encrypted", message);
    } else if (envelope.type === "dm.key.upsert") {
      const p = envelope.payload;
      saveFederatedDmKey({ globalUserId: p.global_user_id, keyId: p.key_id, publicKey: p.public_key,
        fingerprint: createHash("sha256").update(p.public_key).digest("base64url"), status: "unverified" });
    } else if (envelope.type === "identity.migration") saveRemoteIdentity(identityFromPayload(envelope.payload.identity, envelope.origin));
    else throw new Error(`Unsupported federation event type: ${envelope.type}`);
    markFederationEvent(envelope.event_id, "processed");
    return { accepted: true, event_id: envelope.event_id };
  } catch (error) {
    markFederationEvent(envelope.event_id, "rejected", error.message);
    throw error;
  }
}

export async function createRemoteJoin(user, address) {
  const match = String(address || "").trim().match(/^([^#]+)#([^#]+)$/);
  if (!match) throw new Error("Use a community address such as woof#chat.example.com");
  const [, communityReference, destination] = match;
  const peer = findPeerByDomain(destination);
  if (!peer || peer.status !== "allowed") throw new Error("That community's instance is not an allowed peer");
  const response = await federationFetch(peer, `/api/v1/federation/communities/${encodeURIComponent(communityReference)}`, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Remote community lookup returned ${response.status}`);
  const snapshot = (await response.json()).community;
  if (!snapshot?.id) throw new Error("Remote returned an invalid community");
  if (snapshot.profile?.accessMode === "invite") throw new Error("This community is invite only");
  saveRemoteCommunity(snapshot, destination.toLowerCase(), 0);
  const globalUserId = `${user.id}#${federationDomain()}`;
  const communityGlobalId = snapshot.global_id || `${snapshot.id}#${destination.toLowerCase()}`;
  const publicOrigin = String(process.env.PUBLIC_URL || `http://${federationDomain()}`).replace(/\/$/, "");
  const portableAsset = (value) => value ? new URL(value, `${publicOrigin}/`).href : "";
  saveRemoteMembership(communityGlobalId, globalUserId, "pending", []);
  return queueFederationEvent({ peer, type: "membership.join.request", entityId: `${communityGlobalId}:${globalUserId}`,
    payload: { community_id: snapshot.id, community_address: address, identity: {
      id: user.id, username: user.username, display_name: user.display_name, avatar_url: portableAsset(user.avatar_url),
      banner_url: portableAsset(user.banner_url), dm_public_key: findPublicUser(user.id)?.dm_public_key || "",
    } } });
}

export function syncEvents(envelope) {
  return listFederationEventsForPeer(envelope.origin, String(envelope.payload?.after || ""), Number(envelope.payload?.limit || 200));
}

export function createMigrationBundle(user, targetDomain) {
  const secret = randomBytes(32).toString("base64url"), id = randomUUID(), createdAt = new Date().toISOString();
  const identity = findPublicUser(user.id);
  const publicOrigin = String(process.env.PUBLIC_URL || `http://${federationDomain()}`).replace(/\/$/, "");
  const portableAsset = (value) => value ? new URL(value, `${publicOrigin}/`).href : "";
  const payload = { migration_id: id, source_global_id: `${user.id}#${federationDomain()}`, target_domain: targetDomain.toLowerCase(),
    identity: { id: user.id, username: identity.username, display_name: identity.display_name, avatar_url: portableAsset(identity.avatar_url),
      banner_url: portableAsset(identity.banner_url), bio: identity.bio, accent_color: identity.accent_color, dm_public_key: identity.dm_public_key },
    community_memberships: listCommunities(user.id).map((community) => ({ global_id: `${community.id}#${federationDomain()}`, name: community.name })),
    created_at: createdAt, expires_at: new Date(Date.now() + 30 * 60_000).toISOString() };
  const bundle = signEnvelope({ destination: targetDomain, type: "identity.migration", entity_id: payload.source_global_id, payload,
    expires_at: payload.expires_at });
  createIdentityMigration({ id, userId: user.id, sourceGlobalId: payload.source_global_id, targetDomain, bundle,
    secretHash: createHash("sha256").update(secret).digest("hex"), expiresAt: payload.expires_at, createdAt });
  return { migration_id: id, secret, bundle };
}

export function claimLocalMigration(id, secret) {
  return claimIdentityMigration(id, createHash("sha256").update(String(secret || "")).digest("hex"));
}

export function verifyDmKey(globalUserId, keyId, fingerprint, verifierId) {
  const key = findFederatedDmKey(globalUserId, keyId);
  if (!key || key.fingerprint !== fingerprint) return null;
  saveFederatedDmKey({ globalUserId, keyId, publicKey: key.public_key, fingerprint: key.fingerprint, status: "verified", verifiedBy: verifierId });
  return { ...key, verification_status: "verified", verified_by: verifierId };
}
