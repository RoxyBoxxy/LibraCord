import { permissionSnapshot } from "./db.js";
export const Permissions = {
  ADMINISTRATOR: 1n << 3n,
  VIEW_CHANNEL: 1n << 10n,
  MANAGE_CHANNELS: 1n << 4n,
  MANAGE_GUILD: 1n << 5n,
  MANAGE_ROLES: 1n << 28n,
  CREATE_INVITE: 1n << 0n,
  MANAGE_WEBHOOKS: 1n << 29n,
  SEND_MESSAGES: 1n << 11n,
  CONNECT: 1n << 20n,
};
export function hasPermission(user, guildId, permission, channelId = null) {
  const { guild, member, roles, overrides } = permissionSnapshot(
    guildId,
    user.id,
    channelId,
  );
  if (!guild) return false;
  if (guild.owner_id === user.id) return true;
  if (!member) return false;
  if (["owner", "admin"].includes(user.role)) return true;
  let mask = roles.reduce(
    (value, role) => value | BigInt(role.permissions),
    0n,
  );
  if (mask & Permissions.ADMINISTRATOR) return true;
  for (const override of overrides) {
    mask &= ~BigInt(override.deny_mask);
    mask |= BigInt(override.allow_mask);
  }
  return Boolean(mask & permission);
}
export function requireGuildPermission(
  permission,
  getGuildId = (req) => req.params.id,
  getChannelId = () => null,
) {
  return (req, res, next) =>
    hasPermission(req.user, getGuildId(req), permission, getChannelId(req))
      ? next()
      : res.status(403).json({ error: "Missing permission" });
}
