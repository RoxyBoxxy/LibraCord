const blockedHosts = new Set([
  "pornhub.com", "xvideos.com", "xnxx.com", "xhamster.com", "redtube.com",
]);
const blockedTerms = /(?:porn|xxx| hentai|nsfw|onlyfans)/i;
export function checkBrowserNavigation(url, { nsfw = false } = {}) {
  let parsed;
  try { parsed = new URL(url); } catch { return { allowed: false, reason: "That address is not valid." }; }
  if (!["http:", "https:"].includes(parsed.protocol))
    return { allowed: false, reason: "Only web pages can be opened in the shared browser." };
  if (!nsfw && (blockedHosts.has(parsed.hostname.replace(/^www\./, "")) || blockedTerms.test(`${parsed.hostname}${parsed.pathname}`)))
    return { allowed: false, reason: "This channel is family-friendly. Mark it NSFW to open adult websites." };
  return { allowed: true };
}
