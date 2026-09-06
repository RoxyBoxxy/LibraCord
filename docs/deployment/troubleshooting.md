# Deployment troubleshooting

Start with these read-only checks:

```sh
docker compose config --quiet
docker compose ps
docker compose logs --tail=200 app
docker compose logs --tail=200 livekit
docker compose logs --tail=100 redis
curl -v http://127.0.0.1:3002/health
```

## The Electron app reports `ERR_CONNECTION_REFUSED`

The desktop development URL defaults to Vite on `http://localhost:5173`. Start
the development server with `npm run dev`, or package/run the production client
and set `DESKTOP_CLIENT_URL`/`DESKTOP_HOME_SERVER` to reachable URLs. Remember
that `localhost` means the machine running Electron, not the remote server.

## Nginx Proxy Manager returns 502

- Confirm `curl http://127.0.0.1:3002/health` succeeds on the Docker host.
- Confirm Nginx Proxy Manager can reach the configured host address and port.
- If the proxy itself is a container, do not forward to its own `127.0.0.1`.
- Check `APP_BIND_IP`; the app must bind to an address reachable by the proxy.

## Messages update only after refresh

- Enable WebSocket support on the Proxy Host.
- Confirm `/socket.io/` is reaching the app on port `3002`.
- Make `CLIENT_ORIGIN` exactly match the browser's public origin.
- Look for Socket.IO `400 Bad Request` responses and duplicate/stale server
  processes in the browser console and app logs.

## The site loads but voice/video does not

- Route `/rtc` and `/twirp` to LiveKit port `7880`.
- Confirm `LIVEKIT_URL` uses the public `wss://` origin.
- Open/forward `LIVEKIT_TCP_PORT` and `LIVEKIT_UDP_PORT` to the LiveKit host.
  The configured container and host ports must match.
- If ICE still fails, set `LIVEKIT_NODE_IP` to the node's public IP, set
  `LIVEKIT_USE_EXTERNAL_IP=false`, enable embedded TURN, and open
  `LIVEKIT_TURN_UDP_PORT`.
- Confirm the app and LiveKit use identical API key and secret values.
- Test outside the LAN to expose hairpin-NAT or public-address problems.
- Deploy TURN if clients on restrictive networks cannot establish media.

## Webcam or screen share is low quality

Check browser/Electron hardware acceleration, source capture resolution and
frame rate, sender bandwidth, LiveKit adaptive-stream/simulcast behavior, CPU
load, packet loss, and whether the receiver is rendering a small layer. A
requested 60 FPS capture does not guarantee a 60 FPS encoded or received stream.

## Federation discovery fails

```sh
curl -i https://chat.example.com/.well-known/libracord
```

Confirm `PUBLIC_URL` is externally reachable, `FEDERATION_DOMAIN` contains only
the hostname, TLS is valid, and the remote instance is allowed. Private/local
targets remain blocked when `ALLOW_PRIVATE_FEDERATION=false`.

## Uploads disappear after recreation

Confirm the `libracord-uploads` volume is mounted at `/app/uploads` and that
`docker compose down --volumes` was not used. Restore it from the matching
database/upload backup pair if the volume was removed.

## Configuration changes do not appear

`env_file` values are read when a container is created. Validate and recreate:

```sh
docker compose config --quiet
docker compose up -d --force-recreate
```

For source changes, rebuild the app:

```sh
docker compose up -d --build app
```
