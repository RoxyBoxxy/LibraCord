# Architecture

LibraCord is a single-repository application with a Vue renderer, Node API, SQLite database, Socket.IO gateway, LiveKit media server, and an optional shared-browser subsystem.

## Runtime components

| Component | Responsibility | Default development address |
| --- | --- | --- |
| `client` | Vue UI, local media controls, encryption helpers | `http://localhost:5173` |
| `server` | REST API, sessions, permissions, federation, Socket.IO | `http://localhost:3002` |
| `app` image | Built client and server in production | `http://localhost:3002` |
| `livekit` | WebRTC signaling and SFU media routing | signaling on `7880` |
| `redis` | LiveKit coordination/state | Compose network only |
| `ingress` | Optional RTMP and WHIP input | profile `ingress` |
| `browser-service` | Optional shared-browser orchestration | profile `browser` |
| `browser-desktop` | Optional Firefox/noVNC desktop | profile `browser` |
| `desktop` | Electron host and native desktop-capture bridge | loads Vite or public app URL |

## Request paths

In development, Vite serves the renderer and proxies API/Socket.IO traffic to the server. In production, the server serves `client/dist`, so normal pages, `/api`, `/socket.io`, `/uploads`, and `/.well-known/libracord` share one origin.

LiveKit is separate:

- `/rtc` and `/twirp` can be routed through the HTTPS reverse proxy to LiveKit signaling.
- RTC media uses the published TCP and UDP ports directly.
- TURN/UDP, when enabled, is also a direct UDP path.

An HTTP reverse proxy cannot replace those direct media listeners.

## Persistence

SQLite stores users, sessions, communities, channels, messages, DMs, roles, permission overrides, categories, invites, webhooks, social items, collections, peers, assets, emojis, and instance settings. Uploaded bytes live in the uploads directory; the database stores generated asset IDs, MIME type, size, digest, ownership, and origin metadata.

Docker Compose persists:

- `libracord-data` for SQLite
- `libracord-uploads` for media
- `redis-data` for Redis append-only data

The server applies its current schema and migrations during startup. Back up both the database and uploads together so asset references remain consistent.

## Identity and authorization

Local users are identified by UUID and an email-style address. Browser requests authenticate with an HTTP-only session cookie. Instance roles (`owner`, `admin`, and `member`) govern instance administration. Community roles use permission bit masks, positions, and channel/category allow-deny overrides.

Community owners/admins retain administrative access. For other members, channel visibility and actions are calculated from base roles and overrides. Permission-changing endpoints emit community updates so connected clients can refresh their channel list immediately.

## Realtime flow

The Socket.IO connection is authenticated from the same session cookie as REST. A client joins notification rooms and the currently viewed channel, then receives message, typing, voice-presence, profile, DM, and community invalidation events. See [Realtime events](realtime.md).

REST remains the durable source of truth: realtime events either carry the newly created record or tell clients which resource to reload.

## Media flow

The API issues short-lived LiveKit room tokens after checking the authenticated user and requested room. The browser/Electron renderer connects directly to LiveKit, publishes microphone/webcam/screen tracks, and subscribes to remote tracks. Community voice rooms and private DM calls use distinct room identifiers but share the same media infrastructure.

See [Voice, video, and screen sharing](media.md) for networking and failure diagnosis.

## Optional shared browser

The browser profile adds an orchestration service and a containerized desktop. This is a privileged capability: expose it only through authenticated LibraCord flows and a protected reverse-proxy path. Treat all browsing sessions as untrusted content.
