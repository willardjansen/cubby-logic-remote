const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onConnectionInfo: (callback) => ipcRenderer.on('connection-info', (_, info) => callback(info)),
  onStatus: (callback) => ipcRenderer.on('status', (_, status) => callback(status)),
  continue: () => ipcRenderer.send('splash-continue'),
});
