// ember - a local-first encrypted journaling app.
// Copyright (C) 2026 Jeremiah Ayeni <https://github.com/Jeremy-1011>
//
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// This program is free software: you can redistribute it and/or modify it
// under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or (at your
// option) any later version.
//
// This program is distributed in the hope that it will be useful, but
// WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero
// General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.

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
    copyright: 'Copyright \u00A9 2026 Jeremiah Ayeni\nLicensed under the GNU AGPL v3 or later.',
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
