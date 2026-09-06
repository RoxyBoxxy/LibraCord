const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('libracordDesktop', {
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  getLaunchConfig: () => ipcRenderer.invoke('desktop:get-launch-config'),
  getDisplaySources: () => ipcRenderer.invoke('desktop:get-sources'),
  setDisplaySource: (sourceId) => ipcRenderer.invoke('desktop:set-display-source', sourceId),
  logout: () => {
    localStorage.removeItem('libracord.homeServer');
    ipcRenderer.send('desktop:logout');
  },
  setHardwareAcceleration: (enabled) => ipcRenderer.invoke('desktop:set-hardware-acceleration', Boolean(enabled)),
});

window.addEventListener('DOMContentLoaded', () => {
  const bar = document.createElement('header');
  bar.className = 'libracord-titlebar';
  const server = new URLSearchParams(location.search).get('server') || 'LibraCord';
  let host = 'LibraCord';
  try { host = new URL(server).hostname; } catch {}
  bar.innerHTML = `<div class="libracord-drag"><span class="libracord-dot">L</span><strong>LibraCord</strong><small>${host}</small></div><nav><button data-action="minimize" aria-label="Minimize">−</button><button data-action="maximize" aria-label="Maximize">□</button><button data-action="close" aria-label="Close">×</button></nav>`;
  document.body.prepend(bar);
  document.body.classList.add('has-libracord-titlebar');
  const style = document.createElement('style');
  style.textContent = `.libracord-titlebar{position:fixed;z-index:2147483647;inset:0 0 auto;height:36px;display:flex;align-items:center;justify-content:space-between;background:linear-gradient(90deg,#251433,#15152c);color:#f7f5ff;border-bottom:1px solid #ffffff20;font:13px system-ui,sans-serif}.libracord-drag{height:100%;display:flex;align-items:center;gap:9px;padding:0 12px;flex:1;-webkit-app-region:drag}.libracord-dot{width:21px;height:21px;display:grid;place-items:center;border-radius:7px;background:linear-gradient(135deg,#55d9d1,#8568ff);font-weight:800}.libracord-drag small{opacity:.6;margin-left:3px}.libracord-titlebar nav{height:100%;display:flex;-webkit-app-region:no-drag}.libracord-titlebar button{width:48px;height:100%;border:0;background:transparent;color:#d6d8e5;font-size:16px;cursor:pointer;-webkit-app-region:no-drag}.libracord-titlebar button:hover{background:#ffffff18}.libracord-titlebar button[data-action=close]:hover{background:#e54862;color:#fff}.has-libracord-titlebar{padding-top:36px!important}.has-libracord-titlebar #app{min-height:calc(100vh - 36px)}`;
  document.head.append(style);
  let hash = 0; for (const char of host) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  const hue = Math.abs(hash) % 360;
  bar.style.background = `linear-gradient(90deg,hsl(${hue} 42% 18%),hsl(${(hue + 42) % 360} 38% 14%))`;
  bar.querySelectorAll('button').forEach((button) => button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    // Send directly from preload so controls keep working after the window
    // navigates from server-picker.html to the selected web client.
    ipcRenderer.send(`window:${button.dataset.action}`);
  }));
});
