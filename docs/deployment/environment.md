# Environment reference

LibraCord uses the root `.env` as the single configuration file for the app and
Docker services. Start from `.env.example`; do not create a second
`server/.env`.

## Core application

| Variable | Purpose | Production guidance |
| --- | --- | --- |
| `NODE_ENV` | Node runtime mode | Set to `production`. |
| `PORT` | App/API container and published port | Defaults to `3002`. |
| `APP_BIND_IP` | Host address that publishes the app port | Use `0.0.0.0` when a proxy on another container/host must connect; otherwise restrict it. |
| `CLIENT_ORIGIN` | Browser origin allowed by the server | Exact HTTPS origin, with no path. |
| `PUBLIC_URL` | Canonical external instance URL | Same HTTPS origin users visit. |
| `FEDERATION_DOMAIN` | Public instance identifier | Hostname only, with no scheme or path. |
| `ALLOW_PRIVATE_FEDERATION` | Allows private/local federation targets | Keep `false` on public deployments. |
| `DATABASE_PATH` | SQLite path outside Compose | Compose overrides this to `/app/data/libracord.db`. |
| `UPLOADS_PATH` | Upload path outside Compose | Compose overrides this to `/app/uploads`. |
| `LIBRACORD_IMAGE` | App image name/tag | Pin a release tag for repeatable production deployments. |

## Desktop app

| Variable | Purpose | Guidance |
| --- | --- | --- |
| `DESKTOP_CLIENT_URL` | Renderer URL loaded by Electron | Leave unset in packaged production; use `http://localhost:5173` for Vite development. |
| `DESKTOP_HOME_SERVER` | Initially selected instance | Defaults to `PUBLIC_URL` in production or localhost during development. |

The user-selected home instance is stored by the desktop app. These values set
defaults; they do not overwrite an existing user choice unless that state is
cleared or the user logs out.

## LiveKit

| Variable | Purpose | Production guidance |
| --- | --- | --- |
| `LIVEKIT_URL` | URL used by browsers | `wss://` public hostname routed by the proxy. |
| `LIVEKIT_INTERNAL_URL` | App-to-LiveKit URL | Keep `ws://livekit:7880` in Compose. |
| `LIVEKIT_API_KEY` | Shared LiveKit key ID | Change it if desired and keep it consistent. |
| `LIVEKIT_API_SECRET` | Token-signing secret | Generate at least 32 random bytes; never commit it. |
| `LIVEKIT_VERSION` | LiveKit image version | Pin a tested release instead of `latest` for production. |
| `LIVEKIT_USE_EXTERNAL_IP` | Advertise detected public IP | Usually `true` on a single public host. |
| `LIVEKIT_NODE_IP` | Explicit public IP advertised in ICE candidates | Set this and use `LIVEKIT_USE_EXTERNAL_IP=false` when STUN discovery advertises the wrong Docker/NAT address. |
| `LIVEKIT_HTTP_BIND_IP` | Host bind for signaling port 7880 | Use `127.0.0.1` for a host proxy; use a protected reachable address for a proxy container. |
| `LIVEKIT_HTTP_PORT` | Host port forwarded to LiveKit signaling port 7880 | Defaults to `7880`; change it when that host port is already occupied. |
| `LIVEKIT_TCP_PORT` | Published fallback media TCP port | Defaults to `7881`. |
| `LIVEKIT_UDP_PORT` | Published RTC UDP port | Defaults to `7882`. |
| `LIVEKIT_TURN_ENABLED` | Enables LiveKit's embedded TURN/UDP server | Enable when clients need an ICE relay fallback. |
| `LIVEKIT_TURN_DOMAIN` | Hostname advertised for embedded TURN | Must resolve to the LiveKit node. |
| `LIVEKIT_TURN_UDP_PORT` | Embedded TURN/STUN UDP listener | Defaults to `3478`; expose it directly. |

## Optional ingress and browser services

| Variable | Purpose |
| --- | --- |
| `LIVEKIT_RTMP_URL` | Public RTMP base URL advertised by LiveKit. |
| `LIVEKIT_WHIP_URL` | Public WHIP URL advertised by LiveKit. |
| `LIVEKIT_INGRESS_VERSION` | Ingress image version. |
| `INGRESS_RTMP_PORT` | RTMP input port, default `1935/TCP`. |
| `INGRESS_WHIP_PORT` | WHIP HTTP input port, default `8080/TCP`. |
| `INGRESS_UDP_PORT` | Ingress RTC media port, default `7885/UDP`. |
| `BROWSER_DESKTOP_PORT` | Shared browser desktop port, default `6080`. |
| `BROWSER_DESKTOP_URL` | Client-visible protected shared browser URL. |

After any `.env` change, validate and recreate the affected containers:

```sh
docker compose config --quiet
docker compose up -d --force-recreate
```
