# REST API

The primary API namespace is `/api/v1`. Authentication and a few compatibility routes remain under `/api`. Responses are JSON unless an endpoint returns an asset or `204 No Content`.

## Authentication

Browser authentication uses an HTTP-only session cookie. Send requests with credentials enabled when the client and API are accessed through a browser.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/auth/me` | Return the current session user or an unauthenticated state |
| `POST` | `/api/auth/register` | Create a local account and session |
| `POST` | `/api/auth/login` | Authenticate and create a session |
| `POST` | `/api/auth/logout` | Invalidate the current session |

The API returns errors as `{ "error": "message" }`. Typical status codes are `400` for invalid input, `401` for no session, `403` for insufficient permission, `404` for an unavailable/hidden resource, and `409` for a uniqueness conflict.

## Instance and users

| Method | Path | Access | Description |
| --- | --- | --- | --- |
| `GET` | `/health` | Public | Service health (`{ "ok": true }`) |
| `GET` | `/api/v1/instance` | Public | Public instance settings/capabilities |
| `GET` | `/api/v1/users/@me` | User | Current user record |
| `GET` | `/api/users/:id/profile` | User | Public user profile |
| `PUT` | `/api/users/me` | User | Update profile, presence, and username styling |
| `POST` | `/api/users/me/images/:kind` | User | Upload a supported profile image kind as multipart field `image` |
| `PUT` | `/api/users/me/password` | User | Change the current password |
| `PATCH` | `/api/v1/admin/instance` | Admin | Update registration, branding, federation, retention, rules, and limits |
| `GET` | `/api/v1/admin/users` | Admin | List local users |
| `PATCH` | `/api/v1/admin/users/:id` | Admin | Change role/suspension subject to owner protections |
| `GET` | `/api/v1/admin/moderation` | Admin | Active bans, reports, audit history, and system identity |
| `POST|DELETE` | `/api/v1/admin/moderation/users/:id/ban` | Admin | Ban/unban an account and revoke active sessions |
| `POST` | `/api/v1/admin/moderation/users/:id/message` | Admin | Send a read-only DM from the instance system identity |
| `PATCH` | `/api/v1/admin/moderation/reports/:id` | Admin | Review, action, or dismiss a report |
| `POST` | `/api/v1/reports` | User | Report a user, message, community, or peer |

## Home, publishing, and emoji

| Method | Path | Description |
| --- | --- | --- |
| `GET|POST` | `/api/v1/home/posts` | List/create local social posts |
| `GET` | `/api/v1/home/federated` | Aggregate allowed-peer public feeds |
| `GET|POST` | `/api/v1/home/published` | List/publish themes and decorations |
| `POST` | `/api/v1/home/published/assets` | Upload an asset for a published item |
| `GET` | `/api/v1/users/@me/collection` | List collected items |
| `PUT|DELETE` | `/api/v1/users/@me/collection/:itemId` | Add/remove a collection item |
| `GET` | `/api/v1/emojis` | List available instance/community emoji |
| `POST|DELETE` | `/api/v1/admin/emojis[/:id]` | Create/delete instance emoji |
| `POST|DELETE` | `/api/v1/guilds/:id/emojis[/:emojiId]` | Manage community emoji |

## Communities and channels

The API retains `guild` in route names for compatibility; the UI calls these communities.

| Method | Path | Description |
| --- | --- | --- |
| `GET|POST` | `/api/v1/guilds` | List visible communities or create one |
| `GET` | `/api/v1/discovery/communities` | Local plus allowed-peer public discovery |
| `PATCH|DELETE` | `/api/v1/guilds/:id` | Update or delete a community |
| `POST` | `/api/v1/guilds/:id/background` | Upload atmosphere background (`image`) |
| `POST` | `/api/v1/guilds/:id/media/:kind` | Upload `icon` or `banner` (`image`) |
| `POST` | `/api/v1/guilds/:id/channels` | Create a `text` or `voice` channel |
| `PUT` | `/api/v1/guilds/:id/channels/order` | Atomically reorder/move channels |
| `PATCH|DELETE` | `/api/v1/channels/:id` | Edit or delete a channel |
| `GET|POST` | `/api/v1/guilds/:id/categories` | List or create categories |
| `PATCH|DELETE` | `/api/v1/categories/:categoryId` | Rename/reposition or delete a category |
| `GET` | `/api/v1/guilds/:id/members` | Members with assigned roles |
| `DELETE` | `/api/v1/guilds/:id/members/:userId` | Remove a member (owner protected) |

Channel updates support topic, category, position, slowmode, content visibility, announcement/NSFW flags, and voice codec/bitrate/sample-rate settings. The relevant `MANAGE_CHANNELS` or `MANAGE_GUILD` permission is required.

## Roles and permission overrides

| Method | Path | Description |
| --- | --- | --- |
| `GET|POST` | `/api/v1/guilds/:id/roles` | List/create roles |
| `PATCH` | `/api/v1/guilds/:id/roles/:roleId` | Update role display and permission mask |
| `PUT` | `/api/v1/guilds/:id/members/:userId/roles` | Replace a member's role IDs |
| `GET` | `/api/v1/guilds/:id/permission-overrides` | List category/channel overrides |
| `PUT` | `/api/v1/guilds/:id/permission-overrides/:overrideId` | Create/update a role/member allow-deny mask |
| `GET|POST` | `/api/v1/guilds/:id/bans` | List or create local/remote actor bans |
| `DELETE` | `/api/v1/guilds/:id/bans/:actor` | Remove a ban (URL-encode the portable actor ID) |
| `GET` | `/api/v1/guilds/:id/moderation-actions` | Read the replicated moderation audit trail |

Permission masks are serialized as decimal strings because JavaScript JSON cannot safely represent every large bit mask. Current permission bits include create invite, administrator, manage channels/community, view channel, send messages, connect, manage roles, and manage webhooks. Clients must treat the server calculation as authoritative.

## Invites and webhooks

| Method | Path | Description |
| --- | --- | --- |
| `GET|POST` | `/api/v1/guilds/:id/invites` | List/create limited or expiring invites |
| `GET` | `/api/v1/invites/:code` | Preview an invite |
| `POST` | `/api/v1/invites/:code/join` | Redeem an invite |
| `GET|POST` | `/api/v1/guilds/:id/webhooks` | List/create incoming webhooks |

Webhook secrets are returned only when created; store them securely.

## Messages and assets

| Method | Path | Description |
| --- | --- | --- |
| `GET|POST` | `/api/v1/channels/:id/messages` | List/create text messages |
| `POST` | `/api/v1/channels/:id/attachments` | Upload multipart field `file` for an accessible channel |
| `GET` | `/api/v1/assets/:id` | Serve an immutable local asset |
| `GET` | `/api/v1/federation/:peerId/assets/:assetId` | Fetch/cache an asset from an allowed peer, then redirect locally |

Message content is limited to 4,000 characters, a message can reference up to eight attachment records, and content-warning/reply metadata is supported. Use Socket.IO `message:create` for immediate fan-out or the REST route for ordinary integrations.

## Friends and direct messages

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/v1/friends` | Friends and pending requests |
| `POST` | `/api/v1/friends/request` | Send a request using `{ "username": "user@host" }` |
| `POST` | `/api/v1/friends/:id/accept` | Accept a request |
| `DELETE` | `/api/v1/friends/:id` | Remove a friend |
| `GET` | `/api/v1/dms` | List persisted DM conversations, including system messages |
| `GET|POST` | `/api/v1/dms/:userId` | List/send stored DM payloads |
| `GET` | `/api/v1/crypto/key/:userId` | Fetch a user's experimental DM public key |
| `PUT` | `/api/v1/crypto/key` | Publish the current user's public key |

Local `user@localhost:port` lookup is supported. Cross-instance DMs use the signed ciphertext endpoints below; see [Security](security.md) for encryption limitations.

Instance system messages are intentionally one-way and are stored as `kind: "system"`. Their public sender is the reserved instance system identity; the administrator who initiated one is recorded only in the private moderation audit log.

## Federation protocol

| Method | Path | Access | Description |
| --- | --- | --- | --- |
| `GET` | `/.well-known/libracord` | Public | Instance capabilities and Ed25519 signing key |
| `POST` | `/api/v1/federation/inbox` | Signed peer | Idempotently receive and apply an event |
| `POST` | `/api/v1/federation/sync` | Signed peer | Return addressed events after an ISO cursor |
| `GET` | `/api/v1/federation/communities/:id` | Public | Resolve a community ID or friendly slug to a snapshot |
| `GET` | `/api/v1/federation/identities/:id` | Public | Resolve a public portable identity and DM key |
| `GET|POST` | `/api/v1/federation/memberships` | User | List or request durable remote memberships |
| `GET|POST` | `/api/v1/federation/dms` | User | Read/send opaque encrypted cross-instance messages |
| `GET` | `/api/v1/crypto/federated-key` | User | Inspect a remote key and fingerprint |
| `PUT` | `/api/v1/crypto/federated-key/verify` | User | Mark an exact key fingerprint verified |
| `POST` | `/api/v1/identity/migrations` | User | Create a signed one-use migration bundle |
| `POST` | `/api/v1/identity/migrations/import` | User | Claim and link a source identity |
| `POST` | `/api/v1/federation/abuse-reports` | User | Report a peer or portable actor |
| `GET|PUT` | `/api/admin/federation-policies[/:peerId]` | Admin | Inspect/update trust and rate policy |
| `GET` | `/api/admin/federation-abuse-reports` | Admin | Review federation abuse reports |

See [Federation](federation.md) for signing, authority, conflict, retry, and reconciliation rules.

## Voice and shared browser

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/livekit/token` | Issue a two-hour token for an authorized `channelId` or `dmUserId` room |
| `GET` | `/api/v1/voice/presence?communityId=...` | Return LiveKit occupants grouped by voice channel |
| `POST` | `/api/v1/voice/browser` | Start an authorized shared-browser session/ingress |
| `POST` | `/api/v1/browser/policy/check` | Check a URL against channel browser policy |

## Federation administration

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/.well-known/libracord` | Public discovery document |
| `GET` | `/api/v1/federation/home` | Public bounded feed/catalog payload |
| `GET|POST` | `/api/admin/federation` | List/add peers (admin) |
| `PUT|DELETE` | `/api/admin/federation/:id` | Update/delete a peer (admin) |
| `GET` | `/api/admin/federation/:id/check` | Validate peer discovery/health (admin) |

Only explicitly allowed peers participate in aggregation. See [Federation](federation.md) for current scope.

## Compatibility routes

The current client uses the versioned API exclusively. `GET /api/communities` and `GET /api/channels/:id/messages` remain temporarily for older integrations and return `Deprecation: true` plus a `Link` header naming their successor. New integrations must use `/api/v1/guilds` and `/api/v1/channels/:id/messages`. Socket.IO events are documented separately in [Realtime events](realtime.md).
