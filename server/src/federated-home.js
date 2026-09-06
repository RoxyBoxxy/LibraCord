import { lookup } from "node:dns/promises";

const privateIp = (value) =>
  value === "::1" ||
  value.startsWith("127.") ||
  value.startsWith("10.") ||
  value.startsWith("192.168.") ||
  /^172\.(1[6-9]|2\d|3[01])\./.test(value) ||
  value.startsWith("169.254.") ||
  value.startsWith("fc") ||
  value.startsWith("fd") ||
  value.startsWith("fe80:");

const uuidAsset = /^\/api\/v1\/assets\/([a-f0-9-]{36})$/i;
const proxiedMedia = (value, peerId) => {
  const match = String(value || "").match(uuidAsset);
  return match
    ? `/api/v1/federation/${encodeURIComponent(peerId)}/assets/${match[1]}`
    : "";
};

async function fetchPeer(peer) {
  const base = new URL(peer.base_url);
  if (!["http:", "https:"].includes(base.protocol))
    throw new Error("Unsupported federation protocol");
  const addresses = await lookup(base.hostname, { all: true });
  if (
    process.env.ALLOW_PRIVATE_FEDERATION !== "true" &&
    addresses.some((item) => privateIp(item.address))
  )
    throw new Error("Private federation target blocked");
  const response = await fetch(new URL("/api/v1/federation/home", base), {
    redirect: "error",
    signal: AbortSignal.timeout(7000),
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Remote returned ${response.status}`);
  const data = await response.json();
  const source = {
    peer_id: peer.id,
    domain: base.host,
    name: String(data.instance?.name || peer.name).slice(0, 80),
  };
  const posts = Array.isArray(data.posts)
    ? data.posts.slice(0, 100).map((post) => ({
        id: `${peer.id}:${String(post.id).slice(0, 100)}`,
        body: String(post.body || "").slice(0, 1000),
        created_at: post.created_at,
        author_id: `${peer.id}:${String(post.author_id || "")}`,
        username: String(post.username || "user").slice(0, 64),
        display_name: String(post.display_name || "Remote user").slice(0, 80),
        avatar_url: proxiedMedia(post.avatar_url, peer.id),
        accent_color: /^#[0-9a-f]{6}$/i.test(post.accent_color)
          ? post.accent_color
          : "#62efc6",
        source,
      }))
    : [];
  const items = Array.isArray(data.items)
    ? data.items
        .filter((item) => !item.built_in)
        .slice(0, 200)
        .map((item) => {
          const kind = ["theme", "decoration", "profile-theme"].includes(
            item.kind,
          )
            ? item.kind
            : "theme";
          const payload =
            item.payload && typeof item.payload === "object"
              ? item.payload
              : {};
          if (payload.backgroundUrl)
            payload.backgroundUrl = proxiedMedia(
              payload.backgroundUrl,
              peer.id,
            );
          if (payload.imageUrl)
            payload.imageUrl = proxiedMedia(payload.imageUrl, peer.id);
          return {
            id: `${peer.id}:${String(item.id).slice(0, 100)}`,
            kind,
            name: String(item.name || "Untitled").slice(0, 80),
            description: String(item.description || "").slice(0, 500),
            payload,
            created_at: item.created_at,
            username: String(item.username || "user").slice(0, 64),
            display_name: String(item.display_name || "Remote creator").slice(
              0,
              80,
            ),
            source,
          };
        })
    : [];
  const communities = Array.isArray(data.communities)
    ? data.communities.slice(0, 200).map((community) => ({
        id: `${peer.id}:${String(community.id || "").slice(0, 100)}`,
        remote_id: String(community.id || "").slice(0, 100),
        name: String(community.name || "Community").slice(0, 80),
        description: String(community.description || "").slice(0, 500),
        icon_url: proxiedMedia(community.icon_url, peer.id),
        banner_url: proxiedMedia(community.banner_url, peer.id),
        profile: community.profile && typeof community.profile === "object" ? community.profile : {},
        address: String(community.address || "").slice(0, 255),
        remote: true,
        source,
      }))
    : [];
  return { source, posts, items, communities };
}

export async function checkFederationPeer(peer) {
  const started = Date.now();
  const result = await fetchPeer(peer);
  return {
    ok: true,
    latency_ms: Date.now() - started,
    instance: result.source,
    counts: {
      posts: result.posts.length,
      items: result.items.length,
      communities: result.communities.length,
    },
  };
}

export async function aggregateFederatedHome(peers) {
  const results = await Promise.allSettled(
    peers.filter((peer) => peer.status === "allowed").map(fetchPeer),
  );
  return {
    posts: results.flatMap((result) =>
      result.status === "fulfilled" ? result.value.posts : [],
    ),
    items: results.flatMap((result) =>
      result.status === "fulfilled" ? result.value.items : [],
    ),
    communities: results.flatMap((result) =>
      result.status === "fulfilled" ? result.value.communities : [],
    ),
    sources: results
      .filter((result) => result.status === "fulfilled")
      .map((result) => result.value.source),
    unavailable: results.filter((result) => result.status === "rejected")
      .length,
  };
}
