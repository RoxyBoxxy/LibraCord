# Electron desktop client

The desktop app wraps the same Vue client used by the browser. Its main process adds native window controls, server selection, desktop capture, and Electron-specific media behavior.

## Start it locally

```powershell
npm run dev
# In another terminal:
npm run desktop
```

`DESKTOP_CLIENT_URL` selects the renderer URL during development. `DESKTOP_HOME_SERVER` supplies the initial instance, while the user's chosen home instance is saved locally until logout/state reset.

In packaged production, leave `DESKTOP_CLIENT_URL` unset so the package can load its intended production renderer rather than requiring the Vite server on port 5173. An `ERR_CONNECTION_REFUSED` for `localhost:5173` means the desktop process was configured for development but Vite was not running.

## Screen-source picker

Electron's `desktopCapturer` enumerates applications and displays. The preload bridge exposes the minimum required selection API to the renderer. Source thumbnails are cached/refreshed periodically to make the picker open quickly; the selected source ID is then passed to `getUserMedia` constraints.

The source menu separates applications, entire screens, and devices, keeps the action/footer controls fixed, and scrolls only the thumbnail region. Screen/application audio depends on operating-system and Electron support.

## Window controls

The custom title bar delegates minimize, maximize/restore, and close actions through the preload bridge. Keep the renderer isolated from direct Node/Electron access and mark draggable/non-draggable regions explicitly so buttons remain clickable.

## Hardware acceleration

Electron enables hardware acceleration by default. LibraCord exposes a user preference so acceleration can be disabled before the app creates its window. That setting affects decoding, rendering, and the encoders Chromium is able to select; hardware support is ultimately dependent on GPU drivers and codec support.

Restart the desktop app after changing the preference. Diagnose issues with Electron/Chromium GPU information and LiveKit statistics rather than assuming a selected 60 FPS capture target guarantees a 60 FPS encoded track—capture cadence, content motion, CPU/GPU load, bandwidth, and subscriber layers can all reduce delivered FPS.

## Security

- Keep context isolation enabled and expose narrow preload methods.
- Do not enable unrestricted Node integration in the renderer.
- Validate instance URLs and permit only HTTP for explicit local development; require HTTPS in production.
- Treat screen-source titles/thumbnails as sensitive local information.
- Keep Electron current and rebuild/test after dependency upgrades.
