# Development guide

## Prerequisites

- Node.js 24+
- npm
- Docker Desktop on Windows, or Docker Engine plus Compose on Linux/macOS
- A Chromium or Firefox browser; Electron is installed by the root package

## Initial setup

```powershell
Copy-Item .env.example .env
npm install
.\start-dev.ps1
```

The PowerShell helper uses the root Compose project for Redis, LiveKit, ingress, and browser services, then runs the API and Vite client. It does not start the production `app` container because that would conflict with the development API port.

For a smaller setup:

```sh
docker compose up -d redis livekit
npm run dev
```

Open `http://localhost:5173`. The API health endpoint is `http://localhost:3002/health` unless `PORT` is changed.

## Environment

Use only the root `.env`. It is loaded by the Node server, Compose, Electron, and Vite configuration. Start from `.env.example`; never commit real credentials.

For local development, use localhost HTTP/WS values. For production, every client-visible URL must be HTTPS/WSS and match the public certificate. See the [environment reference](deployment/environment.md).

## Common workflows

```sh
npm run dev                 # API and Vite
npm run desktop             # Electron; run Vite first
npm test                    # Node test runner
npm run build               # production web bundle
npm start                   # serve API and built client
docker compose config       # inspect resolved service configuration
docker compose logs -f      # follow all container logs
```

After changing Compose or `.env`:

```sh
docker compose config --quiet
docker compose up -d --build --force-recreate
```

## Repository conventions

- Keep frontend behavior in `client/src` and split substantial styling into the existing CSS modules.
- Keep HTTP routes and middleware in `server/src/app.js`, realtime handlers in `server/src/index.js`, and persistence in `server/src/db.js`.
- Use opaque generated IDs for public assets; never expose a user-provided path directly.
- Emit a realtime invalidation when a durable mutation should appear immediately for other connected clients.
- Update the API, realtime, configuration, and deployment docs with behavior changes.

## Verification checklist

Before handing off a change:

1. Run `npm test`.
2. Run `npm run build`.
3. Validate `docker compose config --quiet` when Compose or environment variables changed.
4. Test two authenticated clients for realtime features.
5. Test voice/video from a device outside the LAN for media/network changes.
6. Confirm dialogs at both a small laptop viewport and a large desktop viewport.

## Runtime files

The following are local state and are ignored: `.env`, `node_modules`, `client/dist`, `data`, `uploads`, server runtime data/logs, and `tools/livekit`. Do not delete the database or uploads as part of normal source cleanup.
