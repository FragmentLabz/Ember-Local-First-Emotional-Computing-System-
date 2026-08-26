// Copyright (c) 2026 Jeremiah Ayeni <https://github.com/Jeremy-1011>
// This source code is licensed under the MIT license found in the
// LICENSE file in the root directory of this source tree.

const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('emberAPI', {
  spotifyAuth: (url) => ipcRenderer.invoke('spotify-auth', url),
  isElectron: true,
});
