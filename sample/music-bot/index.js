import "dotenv/config";

const base = (process.env.LIBRACORD_URL || "http://localhost:3002").replace(/\/$/, "");
const token = process.env.LIBRACORD_BOT_TOKEN;
const channelId = process.env.LIBRACORD_CHANNEL_ID;
const interval = Math.max(1000, Number(process.env.POLL_INTERVAL_MS) || 3000);
if (!token || !channelId) throw new Error("Set LIBRACORD_BOT_TOKEN and LIBRACORD_CHANNEL_ID in .env");

async function api(path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: { authorization: `Bot ${token}`, "content-type": "application/json", ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${response.status}: ${data.error || "Request failed"}`);
  return data;
}

let lastMessageId = 0;
const seen = new Set();
let botId = "";
async function send(body, attachments = []) {
  await api(`/api/v1/voice/channels/${encodeURIComponent(channelId)}/messages`, { method: "POST", body: JSON.stringify({ content: body, attachments }) });
}
async function handle(message) {
  if (!message.body || message.author_id === botId) return;
  const [command, ...args] = message.body.trim().split(/\s+/);
  if (command.toLowerCase() === "/help") return send("Music commands: `/play <URL>`, `/skip`, `/stop`");
  if (command.toLowerCase() === "/play") {
    const sourceUrl = args[0]; if (!sourceUrl) return send("Usage: `!play <YouTube/SoundCloud/media URL>`");
    try {
      const imported = await api("/api/v1/media/import", { method: "POST", body: JSON.stringify({ url: sourceUrl }) });
      return send(`Queued **${imported.asset?.title || "media"}** for playback.`, [{ id: imported.asset.id, url: imported.asset.url, name: imported.asset.title || "media", mimeType: imported.asset.mimeType }]);
    } catch (error) { return send(`I couldn't import that media: ${error.message}`); }
  }
  if (["/skip", "/stop"].includes(command.toLowerCase())) return send(`${command.slice(1)} requested. Connect this command to your server-side playback queue.`);
}
async function poll() {
  try {
    const result = await api(`/api/v1/voice/channels/${encodeURIComponent(channelId)}/messages`);
    for (const message of (result.messages || []).filter((item) => Number(item.id) > lastMessageId)) { lastMessageId = Math.max(lastMessageId, Number(message.id)); if (!seen.has(message.id)) { seen.add(message.id); await handle(message); } }
  } catch (error) { console.error(`[music-bot] ${error.message}`); }
}
console.log(`[music-bot] connected to ${base}; watching ${channelId}`);
botId = (await api("/api/v1/bot/me")).bot.id;
await poll();
setInterval(poll, interval);
