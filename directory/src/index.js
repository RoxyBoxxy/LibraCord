import "dotenv/config";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const host = process.env.DIRECTORY_HOST || "0.0.0.0";
const port = Number(process.env.DIRECTORY_PORT || 3070);
const dataPath = resolve(root, process.env.DIRECTORY_DATA_PATH || "data/instances.json");
const ttl = Number(process.env.DIRECTORY_HEARTBEAT_TTL_SECONDS || 180) * 1000;
let instances = new Map();
const clients = new Set();
const requestTimes = new Map();
const json = (res, status, value) => { res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store", "access-control-allow-origin": "*" }); res.end(JSON.stringify(value)); };
async function load() { try { instances = new Map(Object.entries(JSON.parse(await readFile(dataPath, "utf8")))); } catch { instances = new Map(); } }
async function save() { await mkdir(dirname(dataPath), { recursive: true }); await writeFile(dataPath, JSON.stringify(Object.fromEntries(instances), null, 2)); }
function rateLimited(req) { const key = req.socket.remoteAddress || "unknown", now = Date.now(), recent = (requestTimes.get(key) || []).filter((time) => now - time < 60_000); recent.push(now); requestTimes.set(key, recent); return recent.length > 30; }
function publicInstances() {
  const now = Date.now();
  return [...instances.values()].filter((item) => now - Date.parse(item.lastSeen) <= ttl).sort((a, b) => a.name.localeCompare(b.name));
}
function broadcast() { const payload = `event: instances\ndata: ${JSON.stringify({ instances: publicInstances() })}\n\n`; for (const res of clients) res.write(payload); }
async function body(req) { let value = ""; for await (const chunk of req) value += chunk; return JSON.parse(value || "{}"); }
await load();
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (req.method === "OPTIONS") { res.writeHead(204, { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization,content-type", "access-control-allow-methods": "GET,POST,OPTIONS" }); return res.end(); }
  if (url.pathname === "/health") return json(res, 200, { ok: true, instances: publicInstances().length });
  if (url.pathname === "/api/v1/instances" && req.method === "GET") return json(res, 200, { instances: publicInstances() });
  if (url.pathname === "/api/v1/instances/events" && req.method === "GET") { res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive", "access-control-allow-origin": "*" }); res.write(`event: instances\ndata: ${JSON.stringify({ instances: publicInstances() })}\n\n`); clients.add(res); req.on("close", () => clients.delete(res)); return; }
  if (url.pathname === "/api/v1/instances/register" && req.method === "POST") {
    if (rateLimited(req)) return json(res, 429, { error: "Registration rate limit exceeded" });
    try {
      const input = await body(req), publicUrl = new URL(String(input.publicUrl || "")).origin;
      const id = createHash("sha256").update(publicUrl).digest("hex").slice(0, 32);
      const record = { id, publicUrl, name: String(input.name || publicUrl).slice(0, 120), description: String(input.description || "").slice(0, 500), federationDomain: String(input.federationDomain || new URL(publicUrl).host).slice(0, 255), capabilities: Array.isArray(input.capabilities) ? input.capabilities.slice(0, 32) : [], lastSeen: new Date().toISOString() };
      instances.set(id, record); await save(); broadcast(); return json(res, 200, { instance: record });
    } catch { return json(res, 400, { error: "Invalid instance metadata" }); }
  }
  return json(res, 404, { error: "Not found" });
});
setInterval(() => broadcast(), 30_000).unref();
server.listen(port, host, () => console.log(`LibraCord directory listening on ${host}:${port}`));
