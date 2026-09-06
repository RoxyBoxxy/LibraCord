# Federation

LibraCord federation is an early public-discovery layer, not yet a complete distributed chat protocol.

## Instance identity

Every public instance needs:

```dotenv
PUBLIC_URL=https://chat.example.com
FEDERATION_DOMAIN=chat.example.com
ALLOW_PRIVATE_FEDERATION=false
```

`PUBLIC_URL` is the canonical origin. `FEDERATION_DOMAIN` is the hostname used in human-readable identifiers, such as `user@chat.example.com` and community references resembling `woof#chat.example.com`.

The discovery document is available at:

```text
GET /.well-known/libracord
```

It reports instance metadata and public capabilities using proxy-aware HTTPS URLs.

## What works today

- Administrators can configure federation peers as pending, allowed, or blocked.
- Peer checks validate discovery and report basic health/latency information.
- Authenticated users can aggregate bounded public home feeds from allowed peers.
- Community discovery combines local entries with allowed-peer public catalogs.
- Public assets can be fetched through an allowlisted peer and cached locally.
- Remote fetches reject redirects/private network targets by default, enforce upload limits, validate MIME data, and use timeouts.

`ALLOW_PRIVATE_FEDERATION=true` exists for local testing only. Do not enable it on a public server because it weakens SSRF protection.

## What is not complete

- Joining a remote community as a durable remote member
- Signed server-to-server event delivery
- Replay protection and idempotent event IDs
- Cross-instance role, permission, ban, and moderation replication
- Conflict resolution and offline event reconciliation
- Portable identity and account migration
- Encrypted cross-instance direct messages and key verification
- Trust scoring, abuse reporting, and peer-level rate policy

Do not promise Discord-compatible or Matrix-compatible federation; LibraCord currently defines its own minimal endpoints.

## Protocol direction

A production protocol should add:

1. Stable globally scoped IDs for users, communities, channels, and events.
2. Ed25519 instance keys published through discovery with rotation metadata.
3. Canonical JSON signing over origin, destination, event ID, timestamp, and body digest.
4. Authenticated server inbox/outbox delivery with replay windows and idempotency.
5. Explicit authority rules: the home instance owns identity; the community origin owns membership and moderation state.
6. Versioned capability negotiation and schema migrations.
7. Per-peer queues, retry/backoff, rate limiting, audit logs, and quarantine.

Until those rules are implemented, keep private content and authorization decisions local to the originating instance.
