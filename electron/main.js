const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;

// ── 便携模式：把用户数据放在 exe 同目录的 .liang007-data 文件夹里 ──────────────
function initPortableUserData() {
  let exeDir = process.env.PORTABLE_EXECUTABLE_DIR;
  if (!exeDir) {
    try {
      exeDir = path.dirname(app.getPath('exe'));
    } catch {
      return;
    }
  }
  if (!exeDir) return;

  const portableDataDir = path.join(exeDir, '.liang007-data');
  if (!fs.existsSync(portableDataDir)) {
    try {
      fs.mkdirSync(portableDataDir, { recursive: true });
    } catch (e) {
      console.warn('[liang007] 无法创建便携数据目录，使用默认路径:', e.message);
      return;
    }
  }
  app.setPath('userData', portableDataDir);
  console.log('[liang007] 便携模式：数据路径 →', portableDataDir);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    icon: path.join(__dirname, '../logo.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      spellcheck: false,
      enableWebSQL: false,
      backgroundThrottling: false,
    },
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0a0a0f',
    show: false,
    // 性能优化
    paintWhenInitiallyHidden: false,
  });

  mainWindow.loadFile(path.join(__dirname, '../client/dist/index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ── 窗口控制 IPC ──────────────────────────────────────────────────────────────
ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});
ipcMain.handle('window-is-maximized', () => mainWindow?.isMaximized() ?? false);
ipcMain.on('window-close', () => mainWindow?.close());
ipcMain.on('window-toggle-maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});

app.whenReady().then(() => {
  initPortableUserData();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
