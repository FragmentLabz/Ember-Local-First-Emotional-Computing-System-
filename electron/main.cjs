// Copyright (c) 2026 Jeremiah Ayeni <https://github.com/Jeremy-1011>
// This source code is licensed under the MIT license found in the
// LICENSE file in the root directory of this source tree.

const { app, BrowserWindow, Menu, ipcMain, shell } = require('electron');
const path = require('path');
const { version } = require('../package.json');

function createWindow() {
  const win = new BrowserWindow({
    width: 1000, height: 720,
    minWidth: 520, minHeight: 500,
    backgroundColor: '#070503',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
    show: false,
  });

  win.loadFile(path.join(__dirname, '../dist/index.html'));
  win.once('ready-to-show', () => win.show());

  // Links in the About panel (and anywhere else) open in the user's browser
  // rather than in a bare Electron window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  // Authorship shown by the operating system's own About panel.
  app.setAboutPanelOptions({
    applicationName: 'ember',
    applicationVersion: version,
    copyright: 'Copyright \u00A9 2026 Jeremiah Ayeni\nReleased under the MIT License.',
    authors: ['Jeremiah Ayeni'],
    website: 'https://github.com/Jeremy-1011',
  });

  Menu.setApplicationMenu(null);
  createWindow();
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

ipcMain.handle('spotify-auth', (_, authUrl) => {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (code) => {
      if (settled) return; settled = true;
      if (authWin && !authWin.isDestroyed()) authWin.destroy();
      authWin = null;
      resolve(code || null);
    };
    let authWin = new BrowserWindow({
      width: 480, height: 680,
      backgroundColor: '#121212',
      autoHideMenuBar: true,
      webPreferences: { nodeIntegration: false, contextIsolation: true },
    });
    const check = (_, url) => {
      if (!url.startsWith('http://127.0.0.1:8888')) return;
      finish(new URL(url).searchParams.get('code'));
    };
    authWin.webContents.on('will-redirect', check);
    authWin.webContents.on('will-navigate', check);
    authWin.webContents.on('did-navigate', check);
    authWin.loadURL(authUrl);
    authWin.on('closed', () => finish(null));
  });
});
