# Federation

LibraCord uses its own versioned server-to-server protocol. It is not Discord or Matrix federation. The current implementation is suitable for controlled alpha deployments between explicitly allowed peers; it has not had an independent security audit.

## Instance setup

Every public instance needs a stable HTTPS origin and federation domain:

```dotenv
PUBLIC_URL=https://chat.example.com
FEDERATION_DOMAIN=chat.example.com
ALLOW_PRIVATE_FEDERATION=false
```

Add the other instance under **Administration → Federation**, then set it to `allowed` on both servers. An allowlisted peer is an explicit trust relationship, not merely a directory subscription.

Discovery is published at `GET /.well-known/libracord`. It includes the canonical domain, inbox URL, capabilities, and the instance Ed25519 public key. The private key is generated once and stored in the SQLite `federation_identity` table. Back up the database: losing it changes the instance identity.

## Signed event envelope

Federation mutations are canonical-JSON envelopes signed with Ed25519:

```json
{
  "protocol": "libracord-federation",
  "version": "1.0",
  "event_id": "4b52bfaf-203a-4384-a30b-31e35acb981f",
  "origin": "one.example",
  "destination": "two.example",
  "type": "community.snapshot",
  "entity_id": "community-id#one.example",
  "sequence": 12,
  "occurred_at": "2026-09-07T12:00:00.000Z",
  "expires_at": "2026-09-08T12:00:00.000Z",
  "key_id": "ed25519:…",
  "payload": {},
  "signature": "…"
}
```

The signature covers every property except `signature`, with object keys recursively sorted. Receivers check protocol/version, required fields, destination, timestamps, peer allowlist, peer rate policy, discovered key identity, and signature before applying anything.

`event_id` is a unique database key. A retry of an already stored event returns success without applying it twice. Events outside their validity window are rejected. The inbox is `POST /api/v1/federation/inbox`.

## Authority and conflict resolution

- A user's home instance owns that portable identity and published DM key.
- A community's origin owns its channels, roles, permissions, memberships, bans, and moderation log.
- Replicated objects are stored in `remote_*` tables and cannot overwrite local authoritative tables.
- Each origin/entity pair has a monotonic sequence head. A larger sequence wins. Equal sequences are resolved deterministically by timestamp, then event ID.
- Successful community mutations publish a complete authoritative snapshot to peers that currently have joined remote members. This lets a receiver converge atomically after role, channel, permission, ban, or moderation changes.

Fine-grained event names (`role.upsert`, `permission.upsert`, `ban.upsert`, and `moderation.action`) are accepted when they carry an authoritative snapshot. The snapshot is the convergence boundary in protocol 1.0.

## Durable remote membership

Join with the authenticated endpoint:

```http
POST /api/v1/federation/memberships
Content-Type: application/json

{ "address": "woof#chat.example.com" }
```

The local server resolves the friendly address to the remote stable community ID, caches its state, writes a `pending` membership, and queues a signed `membership.join.request`. The community origin persists the remote identity and membership, then returns a signed `membership.upsert` with the current snapshot. The membership survives browser refreshes and instance restarts.

Use `GET /api/v1/federation/memberships` to inspect remote memberships. Joined and pending remote communities are also included in the ordinary community lists.

## Offline delivery and reconciliation

Outbound events are written to `federation_events` and `federation_outbox` before network delivery. Failed requests retry with exponential backoff (up to one hour); a server restart does not lose the queue.

For recovery after an extended outage, send a signed `sync.request` envelope to `POST /api/v1/federation/sync` with an ISO timestamp in `payload.after` and a limit up to 500. The response contains only signed outbound events addressed to the requesting origin and returns a timestamp cursor. Apply returned envelopes through the same verified/idempotent event processor used by the inbox.

## Portable identity migration

An authenticated user creates a short-lived, signed migration bundle with `POST /api/v1/identity/migrations` and `{ "targetDomain": "new.example" }`. The response includes a one-use 256-bit claim secret and signed bundle valid for 30 minutes. On the target instance, while authenticated as the destination account, submit both to `POST /api/v1/identity/migrations/import`.

The target asks the source to consume the claim, verifies the source signature, then links the portable source identity to the local account. Passwords, sessions, private encryption keys, and message plaintext are never exported. Protocol 1.0 creates a verified identity link; it does not silently take over the target account or copy private history.

## Encrypted cross-instance DMs

The federation server transports ciphertext only. Clients publish an encryption public key with `PUT /api/v1/crypto/key`; the server federates it as `dm.key.upsert`. Remote key lookup and explicit fingerprint verification use:

- `GET /api/v1/crypto/federated-key?user=<global-id>&keyId=<key-id>`
- `PUT /api/v1/crypto/federated-key/verify`

Send opaque encrypted payloads with `POST /api/v1/federation/dms`; read locally stored ciphertext with `GET /api/v1/federation/dms?with=<global-id>`. Both sender and recipient key IDs are mandatory. Incoming ciphertext is delivered live as the Socket.IO `dm:encrypted` event.

The server does not decrypt these messages. Correct encryption, authenticated associated data, device key storage, rotation, and safety-number UX are client responsibilities. This is an encrypted transport primitive, not yet a formally audited Signal-style multi-device protocol.

## Trust, abuse, and rate policy

Each peer has a persistent trust score (0–100), state (`trusted`, `normal`, `restricted`, or `blocked`), per-minute request limit, and burst allowance. Valid signed traffic and successful deliveries raise trust slowly; signature/delivery failures lower it. A policy marked `blocked` rejects inbound events even if the peer itself remains allowlisted.

Administrators manage these at `GET /api/admin/federation-policies` and `PUT /api/admin/federation-policies/:peerId`. Users submit structured reports to `POST /api/v1/federation/abuse-reports`; administrators inspect them at `GET /api/admin/federation-abuse-reports`. Reports do not automatically ban a peer. Human review is required.

## Operations and key rotation

- Back up the database and uploads together.
- Keep clocks synchronized; events more than five minutes in the future are rejected.
- Never enable `ALLOW_PRIVATE_FEDERATION=true` on a public deployment.
- Watch failed outbox attempts and declining peer trust.
- Current discovery detects a changed key ID, but formal cross-signed key rotation is not implemented. Coordinate rotation out of band and verify fingerprints before trusting a replacement.
