import express from "express";
import { randomUUID } from "node:crypto";
import { firefox } from "playwright";

const app = express();
app.use(express.json({ limit: "1mb" }));
const sessions = new Map();
const port = Number(process.env.PORT || 8090);
const allowedHosts = new Set(["youtube.com", "www.youtube.com", "wikipedia.org", "www.wikipedia.org"]);
const blocked = /(?:porn|xxx|hentai|nsfw|onlyfans)/i;
function checkUrl(raw, nsfw = false) {
  let url;
  try { url = new URL(raw); } catch { return { allowed: false, reason: "That address is not valid." }; }
  if (!["http:", "https:"].includes(url.protocol)) return { allowed: false, reason: "Only web pages are allowed." };
  if (!nsfw && (blocked.test(`${url.hostname}${url.pathname}`) || [...allowedHosts].some((host) => url.hostname.endsWith(host)) === false && /adult|sex|cam|escort/i.test(url.hostname)))
    return { allowed: false, reason: "This channel is family-friendly. Mark it NSFW to open adult websites." };
  return { allowed: true, url: url.toString() };
}
app.get("/health", (_req, res) => res.json({ ok: true, sessions: sessions.size, browser: "firefox" }));
app.post("/sessions", async (req, res) => {
  const policy = checkUrl(String(req.body?.url || "https://www.wikipedia.org"), Boolean(req.body?.nsfw));
  if (!policy.allowed) return res.status(422).json(policy);
  const id = randomUUID();
  const browser = await firefox.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(policy.url, { waitUntil: "domcontentloaded", timeout: 30000 });
  const communityId = String(req.body?.communityId || "");
  const channelId = String(req.body?.channelId || "");
  sessions.set(id, { id, browser, context, page, communityId, channelId, roomName: communityId && channelId ? `voice:${communityId}:${channelId}` : null, nsfw: Boolean(req.body?.nsfw), createdAt: new Date().toISOString() });
  res.status(201).json({ id, browser: "firefox", communityId, channelId, roomName: `voice:${communityId}:${channelId}`, url: `/sessions/${id}/view`, controlUrl: `/sessions/${id}/navigate` });
});
app.post("/sessions/:id/navigate", async (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) return res.status(404).json({ error: "Browser session not found" });
  const policy = checkUrl(String(req.body?.url || ""), session.nsfw);
  if (!policy.allowed) return res.status(422).json(policy);
  await session.page.goto(policy.url, { waitUntil: "domcontentloaded", timeout: 30000 });
  res.json({ ok: true, url: session.page.url() });
});
app.get("/sessions/:id/view", async (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) return res.status(404).send("Browser session not found");
  res.type("html").send(`<!doctype html><meta name="viewport" content="width=device-width"><title>LibraCord Firefox</title><style>body{margin:0;background:#111;color:#fff;font:16px system-ui}img{display:block;width:100vw;height:100vh;object-fit:contain}</style><img id="screen" src="/sessions/${session.id}/screenshot"><script>setInterval(()=>document.querySelector('#screen').src='/sessions/${session.id}/screenshot?'+Date.now(),1000)</script>`);
});
app.get("/sessions/:id/screenshot", async (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) return res.status(404).end();
  res.type("png").send(await session.page.screenshot({ type: "png" }));
});
app.delete("/sessions/:id", async (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) return res.status(404).end();
  sessions.delete(req.params.id); await session.browser.close(); res.status(204).end();
});
setInterval(async () => { for (const [id, session] of sessions) if (Date.now() - Date.parse(session.createdAt) > 2 * 60 * 60 * 1000) { sessions.delete(id); await session.browser.close(); } }, 60000);
app.listen(port, "0.0.0.0", () => console.log(`LibraCord Firefox service listening on ${port}`));
