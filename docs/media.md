# Voice, video, and screen sharing

LibraCord uses LiveKit for community voice rooms and private DM calls. The Node API authorizes the request and issues a room token; media then flows between the client and LiveKit rather than through Express or Socket.IO.

## Network paths

| Traffic | Default | Reverse proxied? |
| --- | --- | --- |
| LiveKit HTTP/WebSocket signaling | container `7880/TCP` | Yes, normally `/rtc` and `/twirp` on public HTTPS |
| RTC TCP fallback | `LIVEKIT_TCP_PORT` (`7881/TCP`) | No |
| RTC UDP | `LIVEKIT_UDP_PORT` (`7882/UDP`) | No |
| Embedded TURN/STUN | `LIVEKIT_TURN_UDP_PORT` (`3478/UDP`) | No |
| RTMP ingress | `1935/TCP` | No |
| WHIP ingress HTTP | `8080/TCP` | It may be proxied if configured |
| Ingress media | `7885/UDP` | No |

Changing the host signaling port does not change LiveKit's container port. `LIVEKIT_INTERNAL_URL` remains `ws://livekit:7880` in Compose, while Nginx Proxy Manager forwards to the configured host `LIVEKIT_HTTP_PORT`.

## Required production setup

1. Set `LIVEKIT_URL=wss://chat.example.com`.
2. Proxy `/rtc` and `/twirp` to the LiveKit signaling listener with WebSocket support.
3. Publish and firewall the configured RTC TCP and UDP media ports.
4. Ensure the router/NAT forwards those ports to the LiveKit host.
5. Set `LIVEKIT_USE_EXTERNAL_IP=true`, or set an explicit `LIVEKIT_NODE_IP` and use `false` if discovery advertises a private/container address.
6. Enable embedded TURN/UDP when clients need a relay fallback and open its UDP port.

For restrictive networks that block UDP, a production TURN/TLS listener on TCP 443 is the most compatible option. The current Compose configuration provides embedded TURN/UDP only; deploy and configure a dedicated TURN service when that fallback is required.

## Understanding failures

- If `/health` fails, fix the application/proxy first.
- If `wss://.../rtc/v1` is refused, fix LiveKit signaling proxying.
- If signaling connects but the browser reports `ICE failed`, fix advertised public IP, firewall, NAT, RTC ports, or TURN.
- If only one network fails, compare NAT/firewall behavior and add a relay.
- If video connects at a lower frame rate, inspect capture FPS, publication settings, simulcast layer, available bandwidth, CPU/GPU load, and subscriber dimensions.

Use a device on mobile data for the decisive test; testing only on the server LAN can hide NAT problems.

## Client behavior

- Joining a voice channel does not automatically subscribe a user to every screen share; viewers explicitly choose to watch.
- The sharer does not attach/play their own screen-audio publication locally.
- Pressing the active screen-share control stops publication and removes its tile.
- Leaving the active voice/DM call hides call controls and releases local tracks.
- Private DM calls use the same media grid and controls as community voice rooms, with a realtime accept/decline invitation first.

## Screen and application audio

Browser screen capture uses the platform picker. Electron can use native `desktopCapturer` sources and select application/window sources explicitly. Capturing only one application's audio while excluding LibraCord itself is platform dependent; avoid routing the locally received call mix back into the captured source, or participants will hear an echo.

See [Nginx Proxy Manager](deployment/nginx-proxy-manager.md) and [Troubleshooting](deployment/troubleshooting.md) for deployment checks.
