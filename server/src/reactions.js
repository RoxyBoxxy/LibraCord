// Shared ephemeral reaction state for Socket.IO and federation HTTP handlers.
const reactions = new Map();

export function toggleMessageReaction(channelId, messageId, emoji) {
  const key = `${channelId}:${messageId}`;
  const current = reactions.get(key) || [];
  const next = current.includes(emoji) ? current.filter((item) => item !== emoji) : [...current, emoji].slice(-50);
  reactions.set(key, next);
  return next;
}
