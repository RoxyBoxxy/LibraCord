# Docker deployment

This guide assumes a Linux host with Docker Engine, the Compose plugin, Git,
working DNS, and a reverse proxy. Run commands from the LibraCord repository
root.

## 1. Download and configure

```sh
git clone <your-libracord-repository-url> libracord
cd libracord
cp .env.example .env
openssl rand -hex 32
```

Put the generated value in `LIVEKIT_API_SECRET`, then edit at least these values:

```dotenv
NODE_ENV=production
PORT=3002
APP_BIND_IP=0.0.0.0
CLIENT_ORIGIN=https://chat.example.com
PUBLIC_URL=https://chat.example.com
FEDERATION_DOMAIN=chat.example.com
ALLOW_PRIVATE_FEDERATION=false
LIVEKIT_URL=wss://chat.example.com
LIVEKIT_INTERNAL_URL=ws://livekit:7880
LIVEKIT_API_KEY=libracord
LIVEKIT_API_SECRET=replace-with-the-generated-secret
LIVEKIT_HTTP_BIND_IP=127.0.0.1
```

Use the same `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` for the app, LiveKit,
and optional ingress service. Do not commit `.env`.

PowerShell can generate a secret with:

```powershell
[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLower()
```

## 2. Validate and start

```sh
docker compose config --quiet
docker compose up -d --build
docker compose ps
curl --fail http://127.0.0.1:3002/health
```

The default stack contains:

- `app`: built Vue client, Express API, Socket.IO, and SQLite
- `redis`: realtime/LiveKit shared state
- `livekit`: voice, webcam, and screen-share transport

Persistent data is stored in the `libracord-data`, `libracord-uploads`, and
`redis-data` named volumes.

## 3. Configure public access

Follow [Nginx Proxy Manager, TLS, and LiveKit](nginx-proxy-manager.md). Do not
consider the deployment complete just because `/health` works: calls also need
LiveKit signaling and media connectivity.

## Optional profiles

Start RTMP/WHIP ingress only when streaming inputs are needed:

```sh
docker compose --profile ingress up -d
```

Start the shared browser services only when that feature is needed:

```sh
docker compose --profile browser up -d --build
```

Both profiles together:

```sh
docker compose --profile ingress --profile browser up -d --build
```

The browser desktop exposes port `6080`. Do not expose it publicly without
access control. Set `BROWSER_DESKTOP_URL` to the protected public URL if clients
must reach it.

## Logs and service control

```sh
docker compose logs -f app
docker compose logs -f livekit
docker compose logs -f redis
docker compose restart app
docker compose stop
docker compose start
```

`docker compose down` removes containers and networks but keeps named volumes
unless `--volumes` is supplied. Do not use `--volumes` on a production instance
unless the stored database, uploads, and Redis state are intentionally being
deleted and have been backed up.

## Upgrade

Read release notes and make a [backup](backups.md), then run:

```sh
git pull --ff-only
docker compose config --quiet
docker compose build --pull app
docker compose pull redis livekit
docker compose up -d
docker compose ps
curl --fail http://127.0.0.1:3002/health
```

When deploying a registry image instead of building locally, set
`LIBRACORD_IMAGE` and run `docker compose pull app` before `up -d`.

## Roll back

Keep immutable release tags for both the source and container images. To roll
back code, check out the known-good release, restore a database backup if that
release is not schema-compatible, and recreate the services:

```sh
git checkout <known-good-tag>
docker compose up -d --build
```

Never restore an older SQLite database over the current volume without first
preserving the current data.
