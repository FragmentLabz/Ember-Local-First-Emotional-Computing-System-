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
const services = require('./services.cjs');

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

// Shown when a service will not start, so the user sees a reason instead of
// an empty window.
function showServiceError(failedNames) {
  const win = new BrowserWindow({
    width: 620,
    height: 420,
    backgroundColor: '#070503',
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  });

  const names = failedNames.join(' and ');
  const page = `
    <meta charset="utf-8">
    <style>
      body { background:#070503; color:#ede0cc; font-family:Georgia,serif;
             display:flex; align-items:center; justify-content:center;
             height:100vh; margin:0; padding:40px; text-align:center; }
      .spark { color:#d04818; font-size:34px; }
      h1 { font-weight:400; font-size:21px; margin:16px 0 10px; }
      p { color:#c2a585; font-size:14px; line-height:1.6; max-width:46ch; margin:0 auto; }
      code { color:#e88020; font-size:13px; }
    </style>
    <div>
      <div class="spark">&#10022;</div>
      <h1>Ember could not start ${names}</h1>
      <p>The bundled service did not respond. If you are running from a
      checkout rather than an installed build, start the services yourself with
      <code>npm run services</code>, then reopen Ember.</p>
    </div>`;

  win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(page));
}

app.whenReady().then(async function () {
  // Authorship shown by the operating system's own About panel.
  app.setAboutPanelOptions({
    applicationName: 'ember',
    applicationVersion: APP_VERSION,
    copyright: 'Copyright © 2026 Jeremiah Ayeni\nLicensed under the GNU AGPL v3 or later.',
    authors: ['Jeremiah Ayeni'],
    website: 'https://github.com/Jeremy-1011'
  });

  Menu.setApplicationMenu(null);

  // The window is only useful once both services answer, so start them first.
  const projectRoot = path.join(__dirname, '..');
  const failed = await services.startAll(projectRoot);

  if (failed.length > 0) {
    showServiceError(failed);
    return;
  }

  createWindow();
});

// Do not leave services running after the app is gone.
app.on('will-quit', function () {
  services.stopAll();
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
