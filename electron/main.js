const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');
const fs = require('fs');
const net = require('net');
const InfiniteCanvasServer = require('./services/infiniteCanvasServer');
const { registerIpcHandlers } = require('./ipcHandlers');

// ── 性能优化：命令行参数（必须在 app.ready 之前设置）────────────────────────
app.commandLine.appendSwitch('disable-gpu-sandbox');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-accelerated-2d-canvas');
// V8 代码缓存：加速后续启动的 JS 解析
app.commandLine.appendSwitch('js-flags', '--optimize-for-size');

const isDev = !app.isPackaged;

let mainWindow = null;
let infiniteCanvasServer = null;

const ALLOWED_PROXY_METHODS = new Set(['GET', 'POST']);
const ALLOWED_PROXY_HEADERS = new Set(['accept', 'authorization', 'content-type']);
const MAX_PROXY_TIMEOUT_MS = 600_000;

function isBlockedProxyHostname(hostname) {
  const host = String(hostname || '').toLowerCase();
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    net.isIP(host) !== 0
  );
}

function normalizeProxyUrl(rawUrl) {
  const parsed = new URL(rawUrl);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('仅支持 HTTP/HTTPS URL');
  }
  if (isBlockedProxyHostname(parsed.hostname)) {
    throw new Error('代理请求不允许访问本机、局域网名称或裸 IP 地址');
  }
  return parsed.toString();
}

function sanitizeProxyHeaders(headers = {}) {
  const safeHeaders = {};
  for (const [key, value] of Object.entries(headers || {})) {
    if (ALLOWED_PROXY_HEADERS.has(String(key).toLowerCase()) && typeof value === 'string') {
      safeHeaders[key] = value;
    }
  }
  return safeHeaders;
}

function normalizeProxyMethod(method) {
  const normalized = String(method || 'GET').toUpperCase();
  return ALLOWED_PROXY_METHODS.has(normalized) ? normalized : 'GET';
}

function normalizeProxyTimeout(timeout) {
  const value = Number(timeout || 15_000);
  return Math.max(1_000, Math.min(Number.isFinite(value) ? value : 15_000, MAX_PROXY_TIMEOUT_MS));
}

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
  try {
    fs.mkdirSync(portableDataDir, { recursive: true });
  } catch (e) {
    if (e.code !== 'EEXIST') {
      console.warn('[liang007] 无法创建便携数据目录，使用默认路径:', e.message);
      return;
    }
  }
  app.setPath('userData', portableDataDir);
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
      v8CacheOptions: 'bypassHeatCheck',
    },
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0a0a0f',
    show: false,
  });

  // 开发模式加载 Vite 前端，打包模式加载 client/dist/index.html
  // INFINITE_CANVAS_URL 只作为后端 API 地址，不作为主窗口页面
  const localIndex = path.join(__dirname, '..', 'client', 'dist', 'index.html');
  let loadPromise;
  if (isDev) {
    loadPromise = mainWindow.loadURL('http://127.0.0.1:5173');
  } else if (fs.existsSync(localIndex)) {
    loadPromise = mainWindow.loadFile(localIndex);
  } else {
    // 兜底：加载后端服务的静态页面
    loadPromise = mainWindow.loadURL(process.env.INFINITE_CANVAS_URL || 'http://127.0.0.1:17438/');
  }
  loadPromise.catch((err) => {
    console.error('[liang007] 页面加载失败:', err.message);
  });

  // 页面加载完成后注入 INFINITE_CANVAS_URL 供 InfiniteCanvas 组件使用
  mainWindow.webContents.on('did-finish-load', () => {
    const canvasUrl = process.env.INFINITE_CANVAS_URL || '';
    if (canvasUrl) {
      mainWindow?.webContents.executeJavaScript(`window.INFINITE_CANVAS_URL = ${JSON.stringify(canvasUrl)};`).catch(() => {});
    }
  });

  // 限时显示：如果 ready-to-show 超过 3 秒还没触发，先显示窗口防止用户以为卡死
  let shown = false;
  const forceShowTimer = setTimeout(() => {
    if (!shown && mainWindow && !mainWindow.isDestroyed()) {
      shown = true;
      mainWindow.show();
    }
  }, 3000);

  mainWindow.once('ready-to-show', () => {
    if (!shown) {
      shown = true;
      clearTimeout(forceShowTimer);
      mainWindow?.show();
    }
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error('[liang007] 页面加载错误:', errorCode, errorDescription);
    if (!shown) {
      shown = true;
      clearTimeout(forceShowTimer);
      mainWindow?.show();
    }
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
  const requestTimeout = normalizeProxyTimeout(timeout);
  try {
    const safeUrl = normalizeProxyUrl(url);
    const safeMethod = normalizeProxyMethod(method);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), requestTimeout);

    const fetchOptions = {
      method: safeMethod,
      headers: sanitizeProxyHeaders(headers),
      signal: controller.signal,
    };
    if (body && safeMethod !== 'GET') {
      fetchOptions.body = body;
    }

    const resp = await fetch(safeUrl, fetchOptions);
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
      error: isTimeout ? `请求超时 (${requestTimeout}ms)` : `网络错误: ${msg}`,
    };
  }
});

app.whenReady().then(() => {
  initPortableUserData();

  // ── CORS 绕过：仅对外部 API 请求注入 CORS 头，跳过本地/内网资源 ────────────
  const isLocalUrl = (url) => {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase();
      return (
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host === '0.0.0.0' ||
        host === '::1' ||
        host.endsWith('.local') ||
        host.endsWith('.localhost') ||
        parsed.protocol === 'file:'
      );
    } catch {
      return true; // 无法解析的 URL 保守处理
    }
  };

  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    if (!isLocalUrl(details.url)) {
      // 仅对外部 API 请求移除 Origin 头
      delete details.requestHeaders['Origin'];
    }
    callback({ requestHeaders: details.requestHeaders });
  });
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    if (!isLocalUrl(details.url)) {
      const headers = details.responseHeaders || {};
      headers['access-control-allow-origin'] = ['*'];
      headers['access-control-allow-headers'] = ['*'];
      headers['access-control-allow-methods'] = ['GET, POST, PUT, DELETE, OPTIONS'];
      callback({ responseHeaders: headers });
    } else {
      callback({ responseHeaders: details.responseHeaders });
    }
  });

  infiniteCanvasServer = new InfiniteCanvasServer(app.getPath('userData'), mainWindow);
  infiniteCanvasServer.start(Number(process.env.INFINITE_CANVAS_PORT || 17438)).then(url => {
    process.env.INFINITE_CANVAS_URL = `${url}/`;
    createWindow();
    // 注册所有 IPC handlers（preload.js 暴露的 electronAPI 方法）
    registerIpcHandlers(mainWindow);
  }).catch(err => {
    console.error('[liang007] Infinite-Canvas server 启动失败:', err.message);
    process.env.INFINITE_CANVAS_URL = '';
    createWindow();
    registerIpcHandlers(mainWindow);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (isDev) {
      // 开发模式下窗口关闭不退出，保持后端服务运行供 Vite 预览使用
      console.log('[liang007] 开发模式：窗口已关闭，后端服务继续运行 (端口 17438)');
      return;
    }
    try { infiniteCanvasServer?.dispose(); } catch { /* ignore */ }
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
