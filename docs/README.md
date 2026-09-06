# LibraCord documentation

This directory documents the current implementation. LibraCord is evolving quickly; when behavior differs from a screenshot or an old deployment, the root `docker-compose.yml`, `.env.example`, and current API code are authoritative.

## Product and engineering

- [Architecture](architecture.md) — components, request paths, persistence, and data flow
- [Development](development.md) — local setup, scripts, tests, and common workflows
- [REST API](API.md) — authentication and endpoint groups
- [Realtime events](realtime.md) — Socket.IO rooms, client events, and server events
- [Voice and video](media.md) — LiveKit signaling, ICE, ports, TURN, calls, and screen sharing
- [Desktop client](desktop.md) — Electron configuration, screen capture, and hardware acceleration
- [Federation](federation.md) — identifiers, discovery, supported behavior, and protocol gaps
- [Security](security.md) — trust boundaries, authentication, uploads, encryption, and hardening

## Deployment and operations

- [Deployment overview](deployment/README.md)
- [Docker installation and upgrades](deployment/docker.md)
- [Environment reference](deployment/environment.md)
- [Nginx Proxy Manager](deployment/nginx-proxy-manager.md)
- [Backups and restores](deployment/backups.md)
- [Troubleshooting](deployment/troubleshooting.md)
- [Reverse-proxy summary](reverse-proxy.md)

## Documentation policy

- Examples use `chat.example.com`; replace it with the instance's real host.
- Never commit `.env`, SQLite databases, uploads, generated keys, or session data.
- Public URLs use HTTPS/WSS. Container-to-container URLs may use HTTP/WS on the private Compose network.
- Any feature marked experimental should not be treated as a security guarantee.
