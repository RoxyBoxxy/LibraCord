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
| `GET|POST` | `/api/v1/dms/:userId` | List/send stored DM payloads |
| `GET` | `/api/v1/crypto/key/:userId` | Fetch a user's experimental DM public key |
| `PUT` | `/api/v1/crypto/key` | Publish the current user's public key |

Local `user@localhost:port` lookup is supported. General cross-instance friend requests and DMs are not yet implemented. DM bodies are expected to be client-encrypted when key setup succeeds; see [Security](security.md) for limitations.

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

`GET /api/communities` and `GET /api/channels/:id/messages` remain for the current client/older integrations. New work should use `/api/v1` where available. Socket.IO events are documented separately in [Realtime events](realtime.md).
