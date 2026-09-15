# LibraCord Directory

The directory is an optional, standalone registry for LibraCord instances. It stores only public instance metadata and health timestamps; it does not store users, messages, or media.

```powershell
cd directory
Copy-Item .env.example .env
npm start
```

Put it behind Nginx Proxy Manager at `directory.libracord.space` and proxy to port `3070`. The public endpoint is `https://directory.libracord.space`.

Instances register with `POST /api/v1/instances/register` without a shared credential. Registration is rate-limited and keyed by the normalized public URL; heartbeats refresh the record and stale instances expire automatically. Public clients can read `GET /api/v1/instances` and subscribe to `GET /api/v1/instances/events` (SSE).
