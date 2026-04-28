const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;

// ── 便携模式：把用户数据放在 exe 同目录的 .liang007-data 文件夹里 ──────────────
// 这样整个 exe 移动到哪里，数据就跟着去哪里，真正绿色便携
function initPortableUserData() {
  // exe 所在目录（asar 解压后 getPath('exe') 仍指向 exe）
  const exeDir = path.dirname(app.getPath('exe'));

  // 在 exe 同目录建隐藏文件夹存数据
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
