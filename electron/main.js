const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;

// ── 便携模式：把用户数据放在 exe 同目录的 .liang007-data 文件夹里 ──────────────
// electron-builder portable 模式下 app.getPath('exe') 指向临时解压目录，
// 必须用 PORTABLE_EXECUTABLE_DIR 环境变量获取真正的 exe 所在目录。
function initPortableUserData() {
  // 优先使用 electron-builder portable 设置的环境变量
  let exeDir = process.env.PORTABLE_EXECUTABLE_DIR;

  // fallback：尝试从 exe 路径获取（非 portable 模式或旧版 electron-builder）
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
    },
    autoHideMenuBar: true,
    backgroundColor: '#0f172a',
    show: false,
  });

  // 生产环境加载打包后的文件
  mainWindow.loadFile(path.join(__dirname, '../client/dist/index.html'));

  // 窗口准备好后显示，避免白屏闪烁
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  // 便携模式：强制数据目录为 exe 同目录
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
