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
    icon: path.join(__dirname, '../logo.ico'),
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
  });

  const htmlPath = path.join(__dirname, '../client/dist/index.html');
  console.log('[liang007] 加载页面:', htmlPath);
  console.log('[liang007] 文件存在:', fs.existsSync(htmlPath));

  mainWindow.loadFile(htmlPath).catch((err) => {
    console.error('[liang007] 页面加载失败:', err.message);
  });

  mainWindow.once('ready-to-show', () => {
    console.log('[liang007] 窗口就绪，显示窗口');
    mainWindow?.show();
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error('[liang007] 页面加载错误:', errorCode, errorDescription);
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

// ── 代理 HTTP 请求（绕过 CORS） ────────────────────────────────────────────
ipcMain.handle('fetch-request', async (_event, { url, method, headers, body, timeout }) => {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout || 15000);

    const fetchOptions = {
      method: method || 'GET',
      headers: headers || {},
      signal: controller.signal,
    };
    if (body && method !== 'GET') {
      fetchOptions.body = body;
    }

    const resp = await fetch(url, fetchOptions);
    clearTimeout(timer);

    const respHeaders = {};
    resp.headers.forEach((value, key) => { respHeaders[key] = value; });

    let respBody;
    const contentType = resp.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        respBody = await resp.json();
      } catch {
        respBody = await resp.text();
      }
    } else {
      respBody = await resp.text();
    }

    return {
      ok: resp.ok,
      status: resp.status,
      statusText: resp.statusText,
      headers: respHeaders,
      body: respBody,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isTimeout = msg.includes('abort') || msg.includes('timeout') || msg.includes('Timeout');
    return {
      ok: false,
      status: 0,
      statusText: isTimeout ? 'Timeout' : 'Network Error',
      headers: {},
      body: null,
      error: isTimeout ? `请求超时 (${timeout || 15000}ms)` : `网络错误: ${msg}`,
    };
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
