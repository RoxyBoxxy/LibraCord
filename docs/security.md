# Security model

LibraCord is an alpha and has not been independently audited. This document distinguishes implemented controls from production work still required.

## Trust boundaries

- The reverse proxy terminates public TLS and forwards app/LiveKit signaling traffic.
- The Node application is trusted with accounts, sessions, community state, and upload metadata.
- LiveKit is trusted with call membership and unencrypted media transport processing.
- Redis and SQLite are private infrastructure and must not be exposed publicly.
- Federation peers, uploads, message content, browser sessions, and remote URLs are untrusted.
- Electron's renderer is web content and must not receive unrestricted Node access.

## Authentication

Passwords are salted and hashed with Node's `scrypt`. Successful login creates a random server-side session whose cookie is HTTP-only, `SameSite=Lax`, and secure in production. Logout invalidates the session.

Production requirements:

- HTTPS only, including a valid certificate for Electron clients
- a restricted `CLIENT_ORIGIN`
- rate limits for registration, login, messages, uploads, and invites (federation has a persistent per-peer limiter)
- session revocation and device/session management
- password-reset and email-verification flows before general public registration
- secure proxy headers and clock synchronization

## Authorization

Instance administration uses owner/admin/member roles. Community operations use permission bit masks plus role/member overrides at category or channel scope. The server—not the client—must check each mutating request. Hiding a channel in the UI is not an authorization boundary.

After permission changes, connected clients receive a community invalidation and refresh immediately. Administrators retain full community access; denied channels are omitted for ordinary members.

## Uploads and remote assets

Uploads use generated IDs and recorded MIME type, size, SHA-256 digest, ownership, and purpose. Enforce limits before retaining bytes and serve user content with safe content types and headers. Animated GIFs should remain animated; cropping/scaling should preserve the intended output format rather than silently flattening animation.

Federated asset fetches are limited to explicitly allowed peers and include protections against private IP targets, redirects, oversized responses, unsupported MIME types, and slow endpoints. Keep `ALLOW_PRIVATE_FEDERATION=false` in production.

## Direct-message encryption

The server stores and federates opaque DM ciphertext. Cross-instance delivery is signed by the sending instance, requires sender/recipient encryption key IDs, and supports explicit public-key fingerprint verification. Incoming ciphertext is never converted to plaintext by the server.

This design remains experimental. It does not establish an audited end-to-end security claim because client-side authenticated encryption, multi-device key management, forward secrecy, recovery, metadata protection, and key rotation still need a formal protocol and independent review. A green delivery state proves instance-level delivery, not that the human recipient's key was verified; the client must expose and compare fingerprints.

The server still observes sender, recipient, timestamps, IP/session metadata, and message frequency. Voice/video through LiveKit is transport encrypted but processed/routed by the LiveKit infrastructure; it is not equivalent to a verified end-to-end group protocol.

Instance moderation messages are a separate, explicitly marked system-message class. They are not end-to-end encrypted because the instance itself is the sender. LibraCord shows them as read-only messages from the instance system identity, while the initiating moderator is retained only in the private audit log.

## Federation authenticity

Federation envelopes are signed with persistent Ed25519 instance keys, addressed to one destination, timestamp bounded, sequence ordered, and idempotently stored by event ID. Replicas live outside authoritative local tables. These controls authenticate an allowlisted instance; they do not prove that its administrator or users are trustworthy. Peer trust scores and abuse reports support policy decisions but must not be presented as objective reputation.

The instance private key is stored in SQLite. Database theft permits federation impersonation; database loss changes the instance identity. Back it up securely. Formal cross-signed key rotation and key revocation are not implemented yet.

## Secrets

- Never commit `.env`.
- Generate a unique high-entropy `LIVEKIT_API_SECRET` per deployment.
- Rotate any key pasted into chat, logs, screenshots, or support tickets.
- Pin and update container/dependency versions on a controlled schedule.
- Restrict Docker socket access and do not mount it into LibraCord services.

Generate a secret on Linux:

```sh
openssl rand -hex 32
```

Generate one in PowerShell:

```powershell
$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
[Convert]::ToHexString($bytes).ToLowerInvariant()
```

## Network hardening

- Expose the reverse proxy on 80/443.
- Keep the app and LiveKit signaling ports private to the proxy where possible.
- Expose only the configured LiveKit RTC TCP/UDP and TURN/UDP media ports.
- Do not expose Redis, SQLite, or internal browser-control ports.
- Protect the shared browser UI and assume sites opened within it are hostile.
- Use firewall allowlists for administration and monitoring endpoints.

## Incident basics

If a secret or database may be compromised: stop public access, preserve logs, rotate LiveKit and proxy credentials, invalidate sessions, restore or inspect data from a known-good snapshot, and notify affected users. Do not overwrite the only copy of evidence during recovery.
