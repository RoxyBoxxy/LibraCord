# Realtime events

LibraCord uses Socket.IO for low-latency UI updates. The connection uses the browser's LibraCord session cookie; unauthenticated sockets are rejected.

## Rooms and synchronization

- A client joins a channel room while viewing that text channel.
- Notification subscriptions are refreshed when the user's visible communities or DM state changes.
- Profile and community changes are broadcast as invalidations; clients reload the durable REST state.
- Message/DM creation events include the saved record so active views can update without polling.

Clients should always handle reconnect by refreshing their selected page. Socket events are not a replacement for persisted state and may be missed while offline.

## Client to server

| Event | Payload | Purpose |
| --- | --- | --- |
| `subscriptions:refresh` | none | Rejoin the current notification rooms |
| `profile:updated` | none | Announce the authenticated user's profile mutation |
| `channel:join` | channel ID | Subscribe to active-channel events |
| `channel:leave` | channel ID | Leave the old channel room |
| `typing:start` | channel ID | Begin a text-channel typing indicator |
| `typing:stop` | channel ID | End a text-channel typing indicator |
| `message:create` | `{ channelId, body, attachments, contentWarning, replyTo }` | Persist a channel message; accepts an acknowledgement callback |
| `community:changed` | `{ communityId }` | Invalidate member/channel/role/community views |
| `voice:changed` | channel ID | Refresh voice-presence displays |
| `dm:send` | `{ recipientId, body }` | Persist an encrypted DM payload; accepts acknowledgement |
| `dm:typing` | `{ recipientId, typing }` | Update private typing status |
| `dm:call-invite` | `{ recipientId, mode, callId }` | Ring a DM recipient |
| `dm:call-response` | `{ recipientId, accepted, callId }` | Accept or decline the invitation |

The server derives the sender identity from the authenticated socket. It must not trust a user ID supplied as the sender in a client payload.

## Server to client

| Event | Payload | Purpose |
| --- | --- | --- |
| `profile:updated` | `{ userId }` | Reload changed profile, avatar, banner, and username styling |
| `community:changed` | `{ communityId }` | Reload channels, categories, roles, permissions, and members |
| `message:created` | saved message | Add/update a channel message and notification state |
| `typing:update` | `{ channelId, userId, name, typing }` | Render stacked typing text |
| `voice:presence-changed` | community ID | Reload voice occupancy for all channel lists |
| `dm:created` | saved DM record | Add the DM, conversation entry, unread badge, and notification |
| `dm:typing` | `{ userId, name, typing }` | Render private typing status |
| `dm:call-invite` | caller/call metadata | Open the incoming-call dialog |
| `dm:call-response` | responder/call metadata | Join or end the pending call flow |
| `moderation:report-created` | `{ reportId }` | Tell connected instance moderators to refresh reports |
| `account:banned` | `{ reason }` | Inform the affected client before its sockets are disconnected |

System-authored moderation DMs use the ordinary `dm:created` event with `kind: "system"`. Clients should show the system badge and treat that conversation as read-only.

## Reconnect behavior

Socket.IO may move between polling and WebSocket transports. Repeated `400 Bad Request` responses with stale `sid` values often indicate a proxy sending requests to different app processes without sticky sessions, a mismatched path, or containers restarting. With the default single `app` process, enable WebSocket proxying and keep `/socket.io` routed to the same upstream.

On `connect`, the client should refresh subscriptions and the visible REST resources. On `disconnect`, show the connection state without discarding the current view. See [Troubleshooting](deployment/troubleshooting.md).
