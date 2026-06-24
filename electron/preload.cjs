const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('emberAPI', {
  spotifyAuth: (url) => ipcRenderer.invoke('spotify-auth', url),
  isElectron: true,
});
