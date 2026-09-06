# Deploying LibraCord

The supported quick-host layout runs the web client, API, Socket.IO, SQLite,
Redis, and LiveKit from one Docker Compose project. Users visit one HTTPS origin,
such as `https://chat.example.com`.

## Choose a guide

1. [Install with Docker](docker.md) on a new Linux server.
2. [Configure the environment](environment.md).
3. [Put it behind Nginx Proxy Manager](nginx-proxy-manager.md).
4. [Set up backups](backups.md).
5. Use the [troubleshooting guide](troubleshooting.md) if health checks, realtime
   events, or calls fail.

## Production topology

```text
Browser / desktop app
        |
        | HTTPS and WebSocket (443)
        v
Nginx Proxy Manager
        |-- /, /api, /socket.io, /uploads --> LibraCord app :3002
        `-- /rtc, /twirp                 --> LiveKit HTTP :7880

Browser media ------ LIVEKIT_TCP_PORT / LIVEKIT_UDP_PORT --> LiveKit
```

Port `3002` serves the built Vue client and API together. Port `7880` carries
LiveKit HTTP/WebSocket signaling. LiveKit media uses `LIVEKIT_TCP_PORT` and
`LIVEKIT_UDP_PORT` (defaults `7881/TCP` and `7882/UDP`); those media transports
are not carried by a normal HTTP proxy.

## Before going public

- Point the chosen DNS name at the public IP of the reverse proxy.
- Use a long, random `LIVEKIT_API_SECRET` and keep `.env` private.
- Obtain a valid TLS certificate and use only the `https://`/`wss://` public URLs.
- Back up the three named volumes and test a restore.
- Do not publish port `7880` to the internet unless it is protected. It is only
  intended as an upstream for the reverse proxy.
- Review the existing authentication and authorization, then add production
  rate limits, account recovery/verification, monitoring, and abuse controls
  before treating this MVP as an internet-facing service.

## Federation status

Set `PUBLIC_URL` to the externally reachable HTTPS origin and
`FEDERATION_DOMAIN` to its hostname. Public discovery, catalog data, public
feeds, and assets can be shared with allowed peers. Private cross-instance
membership, signed event delivery, identity portability, and federated private
messages are not complete yet; do not advertise those as production-ready.

The instance discovery document should be reachable after deployment:

```sh
curl https://chat.example.com/.well-known/libracord
```

## Official references

- [Docker Compose production guidance](https://docs.docker.com/compose/how-tos/production/)
- [Docker Compose environment variables](https://docs.docker.com/compose/how-tos/environment-variables/set-environment-variables/)
- [Docker volume reference](https://docs.docker.com/reference/compose-file/volumes/)
- [LiveKit self-hosting deployment guide](https://docs.livekit.io/transport/self-hosting/deployment/)
