import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;

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
      console.warn('[liang007] 无法创建便携数据目录，使用默认路径:', (e as Error).message);
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
    minWidth: 1200,
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

  // 开发环境加载开发服务器，生产环境加载打包后的文件
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../client/dist/index.html'));
  }

  // 窗口准备好后显示
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 应用启动时初始化便携数据目录并创建窗口
app.whenReady().then(() => {
  initPortableUserData();
  createWindow();
});

// 当所有窗口关闭时退出应用（macOS 除外）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// macOS 点击 Dock 图标时重新创建窗口
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
