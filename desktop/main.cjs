const { app, BrowserWindow, ipcMain, desktopCapturer, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), override: true });
const appPort = Number(process.env.PORT) || 3002;
const localAppOrigin = `http://localhost:${appPort}`;
let configuredPublicOrigin = '';
try { configuredPublicOrigin = new URL(process.env.PUBLIC_URL || '').origin; } catch {}
const publicIsLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(configuredPublicOrigin);
const defaultHomeServer = process.env.DESKTOP_HOME_SERVER || (configuredPublicOrigin && !publicIsLocal ? configuredPublicOrigin : localAppOrigin);
// Without an explicit desktop client URL, load the UI from the instance the
// user selects instead of silently returning to the default production host.
const desktopClientOrigin = process.env.DESKTOP_CLIENT_URL || '';
// The selected instance serves the desktop UI. Disable Chromium's HTTP cache
// so a redeployed instance cannot leave this client on an obsolete bundle.
app.commandLine.appendSwitch('disable-http-cache');
const trustedDesktopOrigins = new Set();
for (const candidate of [defaultHomeServer, desktopClientOrigin]) {
  try { trustedDesktopOrigins.add(new URL(candidate).origin); } catch {}
}
function isTrustedDesktopOrigin(value) {
  try { return trustedDesktopOrigins.has(new URL(value).origin); } catch { return false; }
}
const accelerationSettingsPath = path.join(app.getPath('userData'), 'desktop-settings.json');
let hardwareAcceleration = true;
try { hardwareAcceleration = JSON.parse(fs.readFileSync(accelerationSettingsPath, 'utf8')).hardwareAcceleration !== false; } catch {}
// Keep Chromium's GPU/WebRTC acceleration enabled for LiveKit video encode
// and decode in the desktop client.
if (hardwareAcceleration) {
  app.commandLine.appendSwitch('ignore-gpu-blocklist');
  app.commandLine.appendSwitch('enable-gpu-rasterization');
  app.commandLine.appendSwitch('enable-zero-copy');
  app.commandLine.appendSwitch('force_high_performance_gpu');
  app.commandLine.appendSwitch('enable-features', 'AcceleratedVideoDecode,AcceleratedVideoEncode,WebRtcHwEncoding,WebRtcHwDecoding');
}
let selectedDisplaySourceId = null;
let displaySourcesCache = [];
async function refreshDisplaySources() {
  try {
    const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 320, height: 180 } });
    displaySourcesCache = sources.map((source) => ({ id: source.id, name: source.name, kind: source.id.startsWith('screen:') ? 'screen' : 'window', thumbnail: source.thumbnail.toDataURL() }));
  } catch { displaySourcesCache = []; }
  return displaySourcesCache;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#0c1020',
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: { contextIsolation: true, sandbox: true, preload: path.join(__dirname, 'preload.cjs') },
  });
  let cacheRefreshDone = false;
  win.webContents.on('did-navigate', (_event, url) => {
    console.log(`[LibraCord desktop] loaded ${url}`);
    // A remote reverse proxy may serve a previously cached index even when
    // the URL contains a cache-busting query. Force one renderer refresh after
    // the selected web app has navigated, while avoiding a reload loop.
    if (!cacheRefreshDone && /^https?:\/\//i.test(url) && !url.includes('/desktop/server-picker')) {
      cacheRefreshDone = true;
      setTimeout(() => win.webContents.reloadIgnoringCache(), 0);
    }
  });
  win.webContents.on('did-fail-load', (_event, code, description, url) => console.error(`[LibraCord desktop] failed ${url}: ${code} ${description}`));
  win.loadFile(path.join(__dirname, 'server-picker.html'));
}
ipcMain.on('window:minimize', (event) => BrowserWindow.fromWebContents(event.sender)?.minimize());
ipcMain.on('window:maximize', (event) => { const win = BrowserWindow.fromWebContents(event.sender); if (win?.isMaximized()) win.unmaximize(); else win?.maximize(); });
ipcMain.on('window:close', (event) => BrowserWindow.fromWebContents(event.sender)?.close());
ipcMain.on('desktop:logout', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.loadFile(path.join(__dirname, 'server-picker.html'), { query: { loggedOut: '1' } });
});
ipcMain.handle('desktop:set-hardware-acceleration', (_event, enabled) => {
  fs.mkdirSync(path.dirname(accelerationSettingsPath), { recursive: true });
  fs.writeFileSync(accelerationSettingsPath, JSON.stringify({ hardwareAcceleration: Boolean(enabled) }));
  return true;
});
ipcMain.handle('desktop:get-launch-config', () => ({
  defaultHomeServer,
  clientOrigin: desktopClientOrigin,
}));
ipcMain.handle('desktop:trust-origin', (_event, value) => {
  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    trustedDesktopOrigins.add(parsed.origin);
    return true;
  } catch { return false; }
});
ipcMain.handle('desktop:get-sources', async () => {
  return displaySourcesCache.length ? displaySourcesCache : refreshDisplaySources();
});
ipcMain.handle('desktop:set-display-source', (_event, sourceId) => {
  selectedDisplaySourceId = typeof sourceId === 'string' ? sourceId : null;
  return true;
});
app.whenReady().then(async () => {
  console.log(`[LibraCord desktop] UI ${desktopClientOrigin || '(selected home server)'} · home ${defaultHomeServer}`);
  // Preserve cookies, localStorage and desktop preferences while removing the
  // caches capable of serving an old frontend.
  await Promise.allSettled([
    session.defaultSession.clearCache(),
    session.defaultSession.clearStorageData({ storages: ['serviceworkers', 'cachestorage'] }),
  ]);
  // Remote pages must be explicitly scoped before they can access privileged
  // desktop capabilities. Both handlers are needed because Chromium may check
  // a permission without subsequently raising a permission request.
  session.defaultSession.setPermissionCheckHandler((_webContents, permission, requestingOrigin, details = {}) => {
    const origin = details.securityOrigin || requestingOrigin || details.embeddingOrigin || '';
    return ['media', 'notifications'].includes(permission) && isTrustedDesktopOrigin(origin);
  });
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details = {}) => {
    const origin = details.requestingUrl || webContents.getURL();
    callback(['media', 'notifications'].includes(permission) && isTrustedDesktopOrigin(origin));
  });
  // Electron requires an explicit source when getDisplayMedia is called.
  // Supplying the first available screen keeps LiveKit screen sharing working
  // in the desktop client (the web client still shows its own picker).
  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    if (!isTrustedDesktopOrigin(request.securityOrigin)) return callback({});
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
      const selected = sources.find((source) => source.id === selectedDisplaySourceId) || sources[0];
      callback(selected ? { video: selected, audio: 'loopback' } : {});
    } catch { callback({}); }
  });
  refreshDisplaySources();
  const sourceRefreshTimer = setInterval(refreshDisplaySources, 30000);
  sourceRefreshTimer.unref?.();
  createWindow(); app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
