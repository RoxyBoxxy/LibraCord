# Nginx Proxy Manager, TLS, and LiveKit

This layout gives users one public hostname while keeping the built web client,
API, Socket.IO, and LiveKit signaling behind it.

## DNS and required ports

Create an `A`/`AAAA` record such as `chat.example.com` pointing to the reverse
proxy. If the host is behind a router, forward the required ports to it.

| Port | Protocol | Destination | Public? |
| --- | --- | --- | --- |
| `80` | TCP | Nginx Proxy Manager | Yes, for HTTP redirect/certificate validation. |
| `443` | TCP | Nginx Proxy Manager | Yes. |
| `3002` | TCP | LibraCord app | Proxy upstream only. |
| `LIVEKIT_HTTP_PORT` | TCP | LiveKit signaling | Proxy upstream only; defaults to `7880`. |
| `LIVEKIT_TCP_PORT` | TCP | LiveKit media fallback | Yes; defaults to `7881`. |
| `LIVEKIT_UDP_PORT` | UDP | LiveKit RTC media | Yes; defaults to `7882`. |
| `LIVEKIT_TURN_UDP_PORT` | UDP | Embedded TURN/STUN fallback | Yes when enabled; defaults to `3478`. |

If the optional ingress profile is enabled, also allow only the input protocols
you use: `1935/TCP`, `8080/TCP`, and `7885/UDP` by default.

TURN/UDP is not an HTTP custom location. Forward/open `3478/UDP` directly to
the LiveKit host, alongside the configured ICE TCP and UDP media ports.

## Environment values

```dotenv
CLIENT_ORIGIN=https://chat.example.com
PUBLIC_URL=https://chat.example.com
FEDERATION_DOMAIN=chat.example.com
LIVEKIT_URL=wss://chat.example.com
LIVEKIT_INTERNAL_URL=ws://livekit:7880
```

When Nginx Proxy Manager runs directly on the Docker host, LiveKit can remain
bound to `127.0.0.1:7880`. When Nginx Proxy Manager runs in another container or
on another machine, it cannot reach the Docker host's loopback address. Set
`LIVEKIT_HTTP_BIND_IP` to a protected address it can reach (commonly
`0.0.0.0`), then restrict `LIVEKIT_HTTP_PORT` with the host firewall to the
proxy/LAN. The container still listens internally on port `7880`.

## Create the Proxy Host

In Nginx Proxy Manager, create a Proxy Host with:

- Domain: `chat.example.com`
- Scheme: `http`
- Forward hostname/IP: the Docker host or reachable `app` service
- Forward port: `3002`
- WebSocket support: enabled
- Block common exploits: enabled if it does not interfere with uploads

On the SSL tab, request a certificate, enable Force SSL, and enable HTTP/2.

Add these custom locations to the same Proxy Host:

| Location | Forward target | WebSocket support |
| --- | --- | --- |
| `/rtc` | LiveKit host on `LIVEKIT_HTTP_PORT` | Enabled |
| `/twirp` | LiveKit host on `LIVEKIT_HTTP_PORT` | Enabled |

If custom advanced configuration is required by the installed Nginx Proxy
Manager version, use:

```nginx
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection $connection_upgrade;
proxy_set_header Host $host;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_read_timeout 3600s;
```

Do not add a second public hostname unless you also change `LIVEKIT_URL`. With
the configuration above, the browser connects to `wss://chat.example.com` and
LiveKit signaling is routed through `/rtc`.

## Validate

```sh
curl --fail https://chat.example.com/health
curl --fail https://chat.example.com/.well-known/libracord
docker compose logs --tail=100 app
docker compose logs --tail=100 livekit
```

Then test from a device outside the server's LAN:

1. Load the web client without mixed-content warnings.
2. Send a message and confirm Socket.IO updates another client immediately.
3. Join a call and test microphone, webcam, and screen share.
4. Repeat from a restrictive network or mobile connection.

If the site loads but calls never connect, the reverse proxy is usually working;
check the direct `LIVEKIT_TCP_PORT` and `LIVEKIT_UDP_PORT` paths, public DNS,
router forwarding, and the host firewall. The Compose stack supports LiveKit's
embedded TURN/UDP listener. Clients on networks that block UDP may still need a
separately deployed TURN/TLS service reachable over TCP 443.
