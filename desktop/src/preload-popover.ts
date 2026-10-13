// Built to build/preload-popover.cjs. Exposes the minimal IPC surface the
// popover UI needs — no Node access in the renderer.
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('srouter', {
  snapshot: () => ipcRenderer.invoke('srouter:snapshot'),
  openDashboard: () => ipcRenderer.invoke('srouter:open-dashboard'),
  copyBaseUrl: () => ipcRenderer.invoke('srouter:copy-base-url'),
  copyApiKey: () => ipcRenderer.invoke('srouter:copy-api-key'),
  setLoginItem: (open: boolean) => ipcRenderer.invoke('srouter:set-login-item', open),
  quit: () => ipcRenderer.invoke('srouter:quit'),
  onRefresh: (cb: () => void) => ipcRenderer.on('srouter:refresh', cb),
});
