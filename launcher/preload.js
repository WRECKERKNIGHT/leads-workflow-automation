const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  checkStatus: () => ipcRenderer.invoke('status:check'),
  startServer: () => ipcRenderer.invoke('server:start'),
  stopServer: () => ipcRenderer.invoke('server:stop'),
  restartServer: () => ipcRenderer.invoke('server:restart'),
  getLogs: () => ipcRenderer.invoke('server:logs'),
  openDashboard: () => ipcRenderer.invoke('server:open'),
  onStatus: (callback) => {
    ipcRenderer.on('server:status', (_event, status) => callback(status));
  },
  onLog: (callback) => {
    ipcRenderer.on('server:log', (_event, line) => callback(line));
  }
});