# Single-origin reverse proxy

For the complete production walkthrough, including Nginx Proxy Manager custom
locations, DNS, TLS, firewall rules, and NAT, see
[Nginx Proxy Manager, TLS, and LiveKit](deployment/nginx-proxy-manager.md).

For the Docker quick-host deployment:

```sh
cp .env.example .env
docker compose up -d --build
```

The container serves `client/dist`, `/api`, `/uploads`, and the Socket.IO
gateway from `PORT` (3002 by default). In Nginx Proxy Manager create one Proxy
Host for the public hostname and forward it to the LibraCord server on port
3002. Enable WebSocket support and forward these headers:

```nginx
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection $connection_upgrade;
proxy_set_header Host $host;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
```

Set the production environment values to the same public origin:

```dotenv
PORT=3002
CLIENT_ORIGIN=https://chat.example.com
PUBLIC_URL=https://chat.example.com
FEDERATION_DOMAIN=chat.example.com
LIVEKIT_URL=wss://chat.example.com
LIVEKIT_INTERNAL_URL=ws://livekit:7880
```

LiveKit still needs its internal HTTP/WebSocket service and UDP media ports.
If it is behind the same Proxy Host, add custom locations for `/rtc` and
`/twirp` to the LiveKit service (port 7880), with WebSocket support. UDP RTC
traffic must remain reachable on the configured LiveKit UDP port/range; HTTP
reverse proxying alone cannot carry media packets.

During local development, `npm run dev` keeps Vite on 5173 and reads the API
port from the same root `.env`. The single-port setup is for the built
production client.
