import { createHash, randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { writeFileSync } from "node:fs";
import { isIP } from "node:net";
import { resolve } from "node:path";
import { createAsset, findAllowedPeer, findAsset } from "./db.js";

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const supported = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "audio/mpeg",
  "audio/ogg",
  "video/mp4",
  "video/webm",
]);
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
export function storeAsset(
  directory,
  {
    buffer,
    mimeType,
    kind,
    ownerUserId = null,
    originInstance = null,
    originAssetId = null,
  },
) {
  const id = randomUUID(),
    filename = id,
    createdAt = new Date().toISOString();
  writeFileSync(resolve(directory, filename), buffer, { flag: "wx" });
  return createAsset({
    id,
    ownerUserId,
    kind,
    mimeType,
    size: buffer.length,
    sha256: createHash("sha256").update(buffer).digest("hex"),
    filename,
    originInstance,
    originAssetId,
    createdAt,
  });
}
export function sendAsset(directory, id, res) {
  if (!uuid.test(id)) return res.status(404).json({ error: "Asset not found" });
  const asset = findAsset(id);
  if (!asset) return res.status(404).json({ error: "Asset not found" });
  res.set({
    "Content-Type": asset.mime_type,
    "Content-Length": String(asset.size),
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
    ETag: `"${asset.sha256}"`,
  });
  return res.sendFile(resolve(directory, asset.filename));
}
export async function proxyAsset(
  directory,
  peerId,
  assetId,
  maxBytes = 8 * 1024 * 1024,
) {
  if (!uuid.test(assetId)) throw new Error("Invalid asset ID");
  const peer = findAllowedPeer(peerId);
  if (!peer) throw new Error("Federation peer is not allowed");
  const base = new URL(peer.base_url);
  const addresses = await lookup(base.hostname, { all: true });
  if (addresses.some((item) => privateIp(item.address)))
    throw new Error("Private network federation targets cannot be proxied");
  const response = await fetch(new URL(`/api/v1/assets/${assetId}`, base), {
    redirect: "error",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Remote asset returned ${response.status}`);
  const mimeType = (response.headers.get("content-type") || "").split(";")[0];
  if (!supported.has(mimeType))
    throw new Error("Remote asset type is not allowed");
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > maxBytes) throw new Error("Remote asset is too large");
  const reader = response.body.getReader(),
    chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maxBytes) {
      reader.cancel();
      throw new Error("Remote asset is too large");
    }
    chunks.push(value);
  }
  return storeAsset(directory, {
    buffer: Buffer.concat(chunks),
    mimeType,
    kind: "federated",
    originInstance: peer.id,
    originAssetId: assetId,
  });
}
