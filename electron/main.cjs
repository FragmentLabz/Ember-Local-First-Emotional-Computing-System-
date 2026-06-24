const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');

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
}

app.whenReady().then(() => {
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
