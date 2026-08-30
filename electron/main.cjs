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
const packageJson = require('../package.json');

const APP_VERSION = packageJson.version;

function createWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 720,
    minWidth: 520,
    minHeight: 500,
    backgroundColor: '#070503',
    webPreferences: {
      // The page cannot use Node directly. Everything it is allowed to do
      // goes through preload.cjs instead.
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs')
    },
    // Stay hidden until the page has painted, to avoid a white flash.
    show: false
  });

  win.loadFile(path.join(__dirname, '../dist/index.html'));

  win.once('ready-to-show', function () {
    win.show();
  });

  // Links in the About panel (and anywhere else) open in the user's own
  // browser rather than in a bare Electron window.
  win.webContents.setWindowOpenHandler(function (details) {
    if (details.url.startsWith('https://')) {
      shell.openExternal(details.url);
    }
    return { action: 'deny' };
  });
}

app.whenReady().then(function () {
  // Authorship shown by the operating system's own About panel.
  app.setAboutPanelOptions({
    applicationName: 'ember',
    applicationVersion: APP_VERSION,
    copyright: 'Copyright © 2026 Jeremiah Ayeni\nLicensed under the GNU AGPL v3 or later.',
    authors: ['Jeremiah Ayeni'],
    website: 'https://github.com/Jeremy-1011'
  });

  Menu.setApplicationMenu(null);
  createWindow();
});

app.on('window-all-closed', function () {
  // On macOS apps normally stay open when their windows close.
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Opens the Spotify login in its own window and waits for the redirect back
// to 127.0.0.1:8888, which carries the code we need.
ipcMain.handle('spotify-auth', function (event, authUrl) {
  return new Promise(function (resolve) {
    let authWin = new BrowserWindow({
      width: 480,
      height: 680,
      backgroundColor: '#121212',
      autoHideMenuBar: true,
      webPreferences: { nodeIntegration: false, contextIsolation: true }
    });

    // The redirect can fire more than one event, and the user might also just
    // close the window, so only the first answer counts.
    let settled = false;

    function finish(code) {
      if (settled) {
        return;
      }
      settled = true;
      if (authWin && !authWin.isDestroyed()) {
        authWin.destroy();
      }
      authWin = null;
      resolve(code || null);
    }

    function check(checkEvent, url) {
      if (!url.startsWith('http://127.0.0.1:8888')) {
        return;
      }
      const code = new URL(url).searchParams.get('code');
      finish(code);
    }

    authWin.webContents.on('will-redirect', check);
    authWin.webContents.on('will-navigate', check);
    authWin.webContents.on('did-navigate', check);

    authWin.on('closed', function () {
      finish(null);
    });

    authWin.loadURL(authUrl);
  });
});
