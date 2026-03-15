const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  restartAgent: () => ipcRenderer.invoke('restart-agent'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  
  onAgentStatus: (callback) => {
    ipcRenderer.on('agent-status', (event, status) => callback(status));
    return () => ipcRenderer.removeAllListeners('agent-status');
  },
  
  onServerStatus: (callback) => {
    ipcRenderer.on('server-status', (event, status) => callback(status));
    return () => ipcRenderer.removeAllListeners('server-status');
  }
});

contextBridge.exposeInMainWorld('platform', {
  isWindows: process.platform === 'win32',
  isMac: process.platform === 'darwin',
  isLinux: process.platform === 'linux'
});