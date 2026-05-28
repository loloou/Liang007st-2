// ─────────────────────────────────────────────────────────────────────────────
//  infiniteCanvasServer.js — Local HTTP compatibility server for Infinite-Canvas
//
//  Serves the copied upstream static UI and exposes a minimal /api/* surface
//  backed by the existing liang007 Electron services.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const ApiServiceManager = require('./api/ApiServiceManager');
const AssetLibraryService = require('./assets/AssetLibraryService');
const CanvasStateService = require('./canvas/CanvasStateService');
const ProviderConfigStore = require('./config/ProviderConfigStore');
const UpdateChecker = require('./update/UpdateChecker');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

function contentTypeFor(filePath) {
  return MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function corsHeaders(extra = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    ...extra,
  };
}

function safeJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, corsHeaders({
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  }));
  res.end(body);
}

function safeText(res, status, text, contentType = 'text/plain; charset=utf-8') {
  const body = String(text || '');
  res.writeHead(status, corsHeaders({
    'Content-Type': contentType,
    'Content-Length': Buffer.byteLength(body),
  }));
  res.end(body);
}

function parsePayloadDimensions(payload) {
  const fromSize = String(payload.size || payload.resolution || '').match(/(\d+)\s*[xX*]\s*(\d+)/);
  return {
    width: Number(payload.width || fromSize?.[1] || 1024),
    height: Number(payload.height || fromSize?.[2] || 1024),
  };
}

function normalizeProviderProtocol(protocol) {
  const value = String(protocol || 'openai').toLowerCase();
  return ['openai', 'apimart', 'gemini', 'modelscope', 'volcengine', 'runninghub', 'custom'].includes(value) ? value : 'openai';
}

function normalizeProviderIdToInternal(id) {
  const s = String(id || '').trim();
  if (s === 'modelscope') return 'modelscope-default';
  if (s === 'runninghub') return 'runninghub-default';
  return s;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function parseRequestBody(req) {
  const buffer = await readBody(req);
  const contentType = String(req.headers['content-type'] || '');
  if (!buffer.length) return { buffer, json: null, formData: null, text: '' };

  if (contentType.includes('application/json')) {
    const text = buffer.toString('utf8');
    try {
      return { buffer, json: JSON.parse(text), formData: null, text };
    } catch {
      return { buffer, json: null, formData: null, text };
    }
  }

  if (contentType.includes('multipart/form-data') || contentType.includes('application/x-www-form-urlencoded')) {
    try {
      const url = 'http://127.0.0.1/';
      const request = new Request(url, {
        method: req.method,
        headers: req.headers,
        body: buffer.length ? buffer : undefined,
        duplex: 'half',
      });
      const formData = await request.formData();
      return { buffer, json: null, formData, text: buffer.toString('utf8') };
    } catch {
      return { buffer, json: null, formData: null, text: buffer.toString('utf8') };
    }
  }

  return { buffer, json: null, formData: null, text: buffer.toString('utf8') };
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function fileUrlFor(filePath) {
  return `file://${filePath.replace(/\\/g, '/')}`;
}

class InfiniteCanvasServer {
  constructor(userDataDir, mainWindow) {
    this.userDataDir = userDataDir;
    this.mainWindow = mainWindow;
    // 开发模式: electron/services/../../client/public/infinite-canvas
    // 打包模式: asar 内同样的相对路径仍有效（electron-builder files 已包含 client/public/infinite-canvas）
    const devStaticRoot = path.resolve(__dirname, '..', '..', 'client', 'public', 'infinite-canvas');
    const devStaticFallback = path.resolve(__dirname, '..', '..', 'client', 'public', 'static');
    this.staticRoot = fs.existsSync(devStaticRoot) ? devStaticRoot : devStaticFallback;
    this.outputDir = path.join(userDataDir, 'generated_images');
    this.inputDir = path.join(userDataDir, 'assets', 'input');
    this.historyPath = path.join(userDataDir, 'history.json');
    this.baseUrl = '';
    this.server = null;
    this.wss = null;

    ensureDir(this.outputDir);
    ensureDir(this.inputDir);

    this.apiService = new ApiServiceManager(userDataDir, mainWindow);
    this.assetService = new AssetLibraryService(userDataDir);
    this.canvasService = new CanvasStateService(userDataDir);
    // 共用 ApiServiceManager 内部的 ProviderConfigStore，避免两个实例数据不同步
    this.providerStore = this.apiService._configStore;
    this.updateChecker = new UpdateChecker({
      currentVersion: process.env.npm_package_version || '0.0.0',
      repoUrl: 'https://github.com/hero8152/Infinite-Canvas',
    });
    this.history = this._loadHistory();
  }

  _loadHistory() {
    try {
      if (!fs.existsSync(this.historyPath)) return [];
      const parsed = JSON.parse(fs.readFileSync(this.historyPath, 'utf8'));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  _saveHistory() {
    try {
      fs.writeFileSync(this.historyPath, JSON.stringify(this.history.slice(0, 500), null, 2));
    } catch { /* ignore */ }
  }

  _pushHistory(entry) {
    this.history.unshift(entry);
    this._saveHistory();
  }

  async start(port = Number(process.env.INFINITE_CANVAS_PORT || 17438)) {
    await this.apiService.start();

    this.server = http.createServer((req, res) => {
      void this._handleRequest(req, res);
    });

    this.wss = new WebSocketServer({ server: this.server, path: '/ws/stats' });
    this.wss.on('connection', ws => {
      ws.send(JSON.stringify({ type: 'stats', online_count: 1 }));
      ws.on('message', msg => {
        if (String(msg) === 'ping') ws.send(JSON.stringify({ type: 'pong' }));
      });
    });

    const taskQueue = this.apiService._taskQueue;
    if (taskQueue && typeof taskQueue.on === 'function') {
      taskQueue.on('task:queued', task => this._broadcast({ type: 'task:queued', data: task }));
      taskQueue.on('task:started', task => this._broadcast({ type: 'task:started', data: task }));
      taskQueue.on('task:progress', task => this._broadcast({ type: 'task:progress', data: task }));
      taskQueue.on('task:completed', task => this._broadcast({ type: 'task:completed', data: task }));
      taskQueue.on('task:failed', task => this._broadcast({ type: 'task:failed', data: task }));
      taskQueue.on('task:cancelled', task => this._broadcast({ type: 'task:cancelled', data: task }));
    }

    await new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(port, '127.0.0.1', () => {
        const address = this.server.address();
        this.baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });

    return this.baseUrl;
  }

  _broadcast(message) {
    if (!this.wss) return;
    const payload = JSON.stringify(message);
    for (const client of this.wss.clients) {
      if (client.readyState === 1) client.send(payload);
    }
  }

  async _handleRequest(req, res) {
    try {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, corsHeaders());
        return res.end();
      }

      const url = new URL(req.url || '/', this.baseUrl || 'http://127.0.0.1');
      if (url.pathname === '/' || url.pathname === '/index.html') {
        return this._serveFile(res, path.join(this.staticRoot, 'index.html'));
      }

      const staticPath = this._resolveStaticPath(url.pathname);
      if (staticPath) return this._serveFile(res, staticPath);

      if (url.pathname === '/api/app-info') {
        return safeJson(res, 200, { version: process.env.npm_package_version || '0.0.0', repo: 'hero8152/Infinite-Canvas' });
      }

      if (url.pathname === '/api/config') {
        return safeJson(res, 200, this._buildConfigPayload());
      }

      if (url.pathname === '/api/config/token') {
        return safeJson(res, 200, { token: '' });
      }

      if (url.pathname === '/api/providers' && req.method === 'GET') {
        return safeJson(res, 200, { providers: this._toInfiniteProviders(this.providerStore.getAll()) });
      }

      if (url.pathname === '/api/providers' && req.method === 'PUT') {
        const body = await parseRequestBody(req);
        const payload = body.json || {};
        const incoming = Array.isArray(payload.providers) ? payload.providers : (Array.isArray(payload) ? payload : []);
        if (incoming.length) {
          const incomingIds = new Set();
          for (const provider of incoming) {
            const normalized = this._fromInfiniteProvider(provider);
            incomingIds.add(normalized.id);
            const existing = this.providerStore.getById(normalized.id);
            if (existing) this.providerStore.update(normalized.id, normalized);
            else this.providerStore.add(normalized);
          }
          // Remove providers that were deleted in the frontend
          for (const existing of this.providerStore.getAll()) {
            if (!incomingIds.has(existing.id)) {
              this.providerStore.remove(existing.id);
            }
          }
          // 保存后刷新 API adapters，让新/更新的 provider 立即可用于生图
          this.apiService._refreshAdapters();
        }
        return safeJson(res, 200, { ok: true, providers: this._toInfiniteProviders(this.providerStore.getAll()) });
      }

      if (url.pathname === '/api/providers/test-connection' && req.method === 'POST') {
        const body = await parseRequestBody(req);
        const payload = body.json || {};
        const baseUrl = String(payload.base_url || payload.baseUrl || '').trim().replace(/\/+$/, '');
        let apiKey = String(payload.api_key || payload.apiKey || '').trim();
        const protocol = normalizeProviderProtocol(payload.protocol);
        const providerId = String(payload.providerId || payload.provider_id || payload.id || '');

        if (!baseUrl) return safeJson(res, 200, { ok: false, message: '请先填写请求地址' });

        // 当前端传入的 apiKey 为空时，尝试从已保存的 provider 中读取 key
        if (!apiKey && providerId) {
          const saved = this.providerStore.getById(normalizeProviderIdToInternal(providerId));
          if (saved) {
            apiKey = String(
              (Array.isArray(saved.apiKeys) && saved.apiKeys[0]) ||
              saved.apiKey ||
              saved.api_key ||
              ''
            ).trim();
          }
        }

        // 直接用传入的参数进行即时验证
        const testConfig = {
          id: providerId || '_test_' + Date.now(),
          name: 'Test',
          protocol,
          baseUrl,
          apiKeys: apiKey ? [apiKey] : [],
          enabled: true,
        };
        const AdapterFactory = require('./api/AdapterFactory');
        let adapter;
        try {
          adapter = AdapterFactory.create(testConfig);

          // 1. 先验证连通性
          const testResult = await adapter.testConnection();

          // 2. 如果连通，拉取模型列表
          let models = [];
          try { models = await adapter.getModels(); } catch { /* ignore */ }
          const allIds = (models || []).map(m => m.id || m.name || '').filter(Boolean);
          const imageKw = /image|dall|flux|stable|sdxl|edit|gen|draw|paint|art|vision|pic|photo|nano|banana|seed|dream|qwen.*image|tongyi/i;
          const chatKw = /chat|gpt|claude|qwen|llama|gemma|deepseek|glm|mistral|yi-|command|instruct/i;
          const videoKw = /video|sora|luma|runway|gen-3|kling|animate|motion/i;

          const ok = testResult.ok !== false;
          return safeJson(res, 200, {
            ok,
            message: testResult.message || (ok ? `地址验证通过 · 找到 ${allIds.length} 个模型` : '验证失败'),
            status: ok ? 200 : 400,
            model_count: allIds.length,
            total: allIds.length,
            all: allIds,
            image_models: allIds.filter(id => imageKw.test(id)),
            chat_models: allIds.filter(id => chatKw.test(id)),
            video_models: allIds.filter(id => videoKw.test(id)),
          });
        } catch (err) {
          return safeJson(res, 200, { ok: false, message: err.message || String(err), status: 0 });
        } finally {
          if (adapter) try { adapter.dispose(); } catch {}
        }
      }

      if (url.pathname === '/api/providers/probe-async' && req.method === 'POST') {
        const body = await parseRequestBody(req);
        const payload = body.json || {};
        const baseUrl = String(payload.base_url || payload.baseUrl || '').trim().replace(/\/+$/, '');
        let apiKey = String(payload.api_key || payload.apiKey || '').trim();
        const providerId = String(payload.providerId || payload.provider_id || payload.id || '');

        if (!baseUrl) return safeJson(res, 200, { ok: null, message: '请先填写请求地址', raw: null, status_code: 0 });

        // 当前端传入的 apiKey 为空时，尝试从已保存的 provider 中读取 key
        if (!apiKey && providerId) {
          const saved = this.providerStore.getById(normalizeProviderIdToInternal(providerId));
          if (saved) {
            apiKey = String(
              (Array.isArray(saved.apiKeys) && saved.apiKeys[0]) ||
              saved.apiKey ||
              saved.api_key ||
              ''
            ).trim();
          }
        }

        // 发一个轻量 POST 请求检测是否为 APIMart 异步协议
        // APIMart 特征：返回 { task_id: '...' } 而不是直接返回图片
        try {
          const probeUrl = baseUrl.replace(/\/+$/, '') + '/v1/images/generations';
          const headers = { 'Content-Type': 'application/json' };
          if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 15000);
          let raw = null;
          let statusCode = 0;
          try {
            const resp = await fetch(probeUrl, {
              method: 'POST',
              headers,
              body: JSON.stringify({ prompt: '__protocol_probe__', size: '1024x1024', n: 1 }),
              signal: controller.signal,
            });
            statusCode = resp.status;
            const text = await resp.text();
            try { raw = JSON.parse(text); } catch { raw = { text: text.slice(0, 500) }; }
          } finally {
            clearTimeout(timer);
          }

          // APIMart 异步协议判定：返回了 task_id 字段
          const isAsync = raw && typeof raw === 'object' && ('task_id' in raw || 'taskId' in raw) && !('data' in raw) && !('images' in raw);
          return safeJson(res, 200, {
            ok: isAsync ? true : null,
            message: isAsync
              ? '检测到 APIMart 异步协议（返回了 task_id）'
              : `未检测到异步协议特征 (HTTP ${statusCode})，建议使用 OpenAI 兼容协议`,
            raw,
            status_code: statusCode,
          });
        } catch (err) {
          return safeJson(res, 200, {
            ok: null,
            message: `协议检测失败: ${err.message || String(err)}`,
            raw: null,
            status_code: 0,
          });
        }
      }

      if (url.pathname === '/api/providers/fetch-models' && req.method === 'POST') {
        const body = await parseRequestBody(req);
        const payload = body.json || {};
        const providerId = String(payload.providerId || payload.provider_id || '');
        // 支持直接传入 base_url + api_key 拉取模型（无需先保存 provider）
        if (payload.base_url || payload.baseUrl) {
          let fetchApiKey = String(payload.api_key || payload.apiKey || '').trim();
          // 当前端传入的 apiKey 为空时，尝试从已保存的 provider 中读取 key
          if (!fetchApiKey && providerId) {
            const saved = this.providerStore.getById(normalizeProviderIdToInternal(providerId));
            if (saved) {
              fetchApiKey = String(
                (Array.isArray(saved.apiKeys) && saved.apiKeys[0]) ||
                saved.apiKey ||
                saved.api_key ||
                ''
              ).trim();
            }
          }
          const testConfig = {
            id: providerId || '_fetch_' + Date.now(),
            name: 'Fetch',
            protocol: normalizeProviderProtocol(payload.protocol),
            baseUrl: payload.base_url || payload.baseUrl || '',
            apiKeys: fetchApiKey ? [fetchApiKey] : [],
            enabled: true,
          };
          const AdapterFactory = require('./api/AdapterFactory');
          let adapter;
          try {
            adapter = AdapterFactory.create(testConfig);
            const models = await adapter.getModels();
            // 分类建议
            const allIds = (models || []).map(m => m.id || m.name || '').filter(Boolean);
            const imageKw = /image|dall|flux|stable|sdxl|edit|gen|draw|paint|art|vision|pic|photo|nano|banana|seed|dream|qwen.*image|tongyi/i;
            const chatKw = /chat|gpt|claude|qwen|llama|gemma|deepseek|glm|mistral|yi-|command|instruct/i;
            const videoKw = /video|sora|luma|runway|gen-3|kling|animate|motion/i;
            return safeJson(res, 200, {
              ok: true,
              model_count: allIds.length,
              total: allIds.length,
              all: allIds,
              image_models: allIds.filter(id => imageKw.test(id)),
              chat_models: allIds.filter(id => chatKw.test(id)),
              video_models: allIds.filter(id => videoKw.test(id)),
            });
          } catch (err) {
            return safeJson(res, 200, { ok: false, message: err.message || String(err), model_count: 0, total: 0, all: [], image_models: [], chat_models: [], video_models: [] });
          } finally {
            if (adapter) try { adapter.dispose(); } catch {}
          }
        }
        return safeJson(res, 200, { models: await this.apiService.getModels(providerId) });
      }

      if (/^\/api\/providers\/[^/]+\/fetch-models$/.test(url.pathname) && req.method === 'GET') {
        const providerId = decodeURIComponent(url.pathname.split('/')[3]);
        return safeJson(res, 200, { models: await this.apiService.getModels(providerId) });
      }

      if (url.pathname === '/api/models') {
        const providers = this.providerStore.getEnabled();
        const models = [];
        for (const provider of providers) {
          for (const model of provider.imageModels || []) models.push({ id: model, name: model, providerId: provider.id });
        }
        return safeJson(res, 200, { data: models });
      }

      if (url.pathname === '/api/queue_status') {
        const status = this.apiService.getServiceStatus();
        return safeJson(res, 200, { queued: status.queue.queued, running: status.queue.running, completed: status.queue.completed });
      }

      if (url.pathname === '/api/history' && req.method === 'GET') {
        const type = url.searchParams.get('type') || '';
        const items = type ? this.history.filter(item => String(item.type || '') === type) : this.history;
        return safeJson(res, 200, { items });
      }

      if (url.pathname === '/api/history/delete' && req.method === 'POST') {
        const body = await parseRequestBody(req);
        const ids = Array.isArray(body.json?.ids) ? body.json.ids : [];
        this.history = this.history.filter(item => !ids.includes(item.id));
        this._saveHistory();
        return safeJson(res, 200, { ok: true });
      }

      if (url.pathname === '/api/canvases' && req.method === 'GET') {
        const canvases = this.canvasService.list().map(item => this._toInfiniteCanvasListItem(item));
        return safeJson(res, 200, { canvases });
      }

      if (url.pathname === '/api/canvases/trash' && req.method === 'GET') {
        const canvases = this.canvasService.listTrash().map(item => this._toInfiniteCanvasListItem(item));
        return safeJson(res, 200, { canvases });
      }

      if (url.pathname === '/api/canvases' && req.method === 'POST') {
        const body = await parseRequestBody(req);
        const input = body.json || {};
        const created = this.canvasService.create(input.title || input.name || 'Untitled');
        const doc = this._toInfiniteCanvasDocument({
          ...created,
          title: input.title || input.name || created.name,
          icon: input.icon || '🧩',
          kind: input.kind || 'classic',
          nodes: [],
          connections: [],
          viewport: { x: 0, y: 0, scale: 1 },
        });
        this.canvasService.save(this._fromInfiniteCanvasDocument(doc));
        return safeJson(res, 200, { canvas: doc });
      }

      if (/^\/api\/canvases\/[^/]+\/meta$/.test(url.pathname) && req.method === 'GET') {
        const canvasId = decodeURIComponent(url.pathname.split('/')[3]);
        const canvas = this.canvasService.load(canvasId);
        return safeJson(res, 200, canvas ? { id: canvas.id, name: canvas.name, title: canvas.name, createdAt: canvas.createdAt, updatedAt: canvas.updatedAt, updated_at: canvas.updatedAt } : null);
      }

      if (/^\/api\/canvases\/[^/]+$/.test(url.pathname)) {
        const canvasId = decodeURIComponent(url.pathname.split('/')[3]);
        if (req.method === 'GET') return safeJson(res, 200, { canvas: this._toInfiniteCanvasDocument(this.canvasService.load(canvasId)) });
        if (req.method === 'PUT' || req.method === 'POST') {
          const body = await parseRequestBody(req);
          const doc = this._fromInfiniteCanvasDocument({ ...body.json, id: canvasId });
          this.canvasService.save(doc);
          return safeJson(res, 200, { ok: true, canvas: this._toInfiniteCanvasDocument(doc) });
        }
        if (req.method === 'DELETE') {
          this.canvasService.trash(canvasId);
          return safeJson(res, 200, { ok: true });
        }
      }

      if (/^\/api\/canvases\/[^/]+\/restore$/.test(url.pathname) && req.method === 'POST') {
        const canvasId = decodeURIComponent(url.pathname.split('/')[3]);
        this.canvasService.restore(canvasId);
        return safeJson(res, 200, { ok: true });
      }

      if (/^\/api\/canvases\/[^/]+\/purge$/.test(url.pathname) && req.method === 'DELETE') {
        const canvasId = decodeURIComponent(url.pathname.split('/')[3]);
        this.canvasService.permanentDelete(canvasId);
        return safeJson(res, 200, { ok: true });
      }

      if (url.pathname === '/api/asset-library' && req.method === 'GET') {
        return safeJson(res, 200, this.assetService.getAll({ offset: 0, limit: 500 }));
      }

      if (url.pathname === '/api/asset-library/categories' && req.method === 'POST') {
        const body = await parseRequestBody(req);
        return safeJson(res, 200, this.assetService.addCategory(body.json || {}));
      }

      if (/^\/api\/asset-library\/categories\/[^/]+$/.test(url.pathname)) {
        const categoryId = decodeURIComponent(url.pathname.split('/')[4]);
        const body = await parseRequestBody(req);
        if (req.method === 'PATCH') return safeJson(res, 200, this.assetService.updateCategory(categoryId, body.json || {}));
        if (req.method === 'DELETE') return safeJson(res, 200, { ok: this.assetService.deleteCategory(categoryId) });
      }

      if (url.pathname === '/api/asset-library/items' && req.method === 'POST') {
        const body = await parseRequestBody(req);
        const payload = body.json || {};
        const importResult = await this.assetService.import({
          data: payload.data || payload.url || payload.filePath || payload.file || '',
          prompt: payload.prompt || '',
          model: payload.model || '',
          tags: payload.tags || [],
          width: payload.width,
          height: payload.height,
        });
        if (payload.category_id) this.assetService.update(importResult.id, { category: payload.category_id });
        return safeJson(res, 200, importResult);
      }

      if (/^\/api\/asset-library\/items\/[^/]+$/.test(url.pathname)) {
        const itemId = decodeURIComponent(url.pathname.split('/')[4]);
        const body = await parseRequestBody(req);
        if (req.method === 'PATCH') return safeJson(res, 200, this.assetService.update(itemId, body.json || {}));
        if (req.method === 'DELETE') return safeJson(res, 200, { ok: this.assetService.delete(itemId) });
      }

      if (url.pathname === '/api/asset-library/categories') {
        return safeJson(res, 200, this.assetService.getCategories());
      }

      if (url.pathname === '/api/canvas-assets/check' && req.method === 'POST') {
        return safeJson(res, 200, { ok: true, missing: [], exists: true });
      }

      if (url.pathname === '/api/canvas-assets/download' && req.method === 'POST') {
        const body = await parseRequestBody(req);
        const urls = Array.isArray(body.json?.urls) ? body.json.urls : [];
        return safeJson(res, 200, { ok: true, files: urls, filename: body.json?.filename || 'assets.zip' });
      }

      if (url.pathname === '/api/smart-canvas/group-export' && req.method === 'POST') {
        return safeJson(res, 200, { ok: true, files: [] });
      }

      if (url.pathname === '/api/download-output') {
        const target = url.searchParams.get('url') || '';
        const name = url.searchParams.get('name') || 'download.png';
        return this._downloadTarget(res, target, name);
      }

      if (url.pathname === '/api/upload' || url.pathname === '/api/ai/upload' || url.pathname === '/api/ai/import-local-image') {
        return await this._handleUpload(req, res, url.pathname);
      }

      if (url.pathname === '/api/view') {
        return this._serveView(res, url);
      }

      // Task 状态查询：/api/canvas-image-tasks/{taskId}
      const taskMatch = url.pathname.match(/^\/api\/canvas-image-tasks\/([^/]+)$/);
      if (taskMatch && req.method === 'GET') {
        const taskId = decodeURIComponent(taskMatch[1]);
        const status = this.apiService.getStatus(taskId);
        if (!status) {
          return safeJson(res, 200, { taskId, status: 'unknown', error: 'Task not found' });
        }
        // 映射到画布期望的格式
        if (status.status === 'completed' || status.result) {
          const result = status.result || {};
          const images = (result.images || []).map(img => {
            if (img.format === 'base64') return { url: `data:image/png;base64,${img.data}` };
            if (img.format === 'cloudUrl' || img.format === 'url') return { url: img.data || img.url };
            if (img.format === 'localPath') return { url: `/api/view?filename=${encodeURIComponent(path.basename(img.data))}&type=output` };
            return { url: img.data || img.url || '' };
          }).filter(img => img.url);
          return safeJson(res, 200, { taskId, status: 'succeeded', result: { images } });
        }
        if (status.status === 'failed' || status.error) {
          return safeJson(res, 200, { taskId, status: 'failed', error: status.error || 'Generation failed' });
        }
        return safeJson(res, 200, { taskId, status: 'running', progress: status.progress || 0 });
      }

      if (url.pathname === '/api/generate' || url.pathname === '/generate' || url.pathname === '/api/ms/generate' || url.pathname === '/api/angle/generate' || url.pathname === '/api/online-image' || url.pathname === '/api/canvas-image-tasks' || url.pathname === '/api/canvas-video' || url.pathname === '/api/canvas-llm') {
        return await this._handleGenerate(req, res, url.pathname);
      }

      if (url.pathname.startsWith('/api/runninghub/')) {
        return await this._handleRunningHub(req, res, url.pathname, url.searchParams);
      }

      if (url.pathname === '/api/workflows') {
        return safeJson(res, 200, { workflows: [] });
      }

      if (url.pathname.startsWith('/api/workflows/')) {
        return safeJson(res, 200, { ok: true, workflows: [] });
      }

      if (url.pathname === '/api/update-from-github' && req.method === 'POST') {
        return safeJson(res, 200, { ok: false, message: '应用内热更新已禁用，请通过 liang007 打包更新。' });
      }

      if (url.pathname === '/api/update-backups') {
        return safeJson(res, 200, { backups: [] });
      }

      if (url.pathname === '/api/update-rollback') {
        return safeJson(res, 200, { ok: false, message: '无可回滚备份' });
      }

      if (url.pathname === '/ws/stats') {
        return safeText(res, 426, 'WebSocket required');
      }

      return safeText(res, 404, 'Not found');
    } catch (err) {
      return safeJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
  }

  _resolveStaticPath(requestPath) {
    const decodedPath = decodeURIComponent(requestPath || '/');
    const staticPrefixes = ['/static/', '/vendor/', '/js/', '/css/', '/images/', '/runninghub/'];
    for (const prefix of staticPrefixes) {
      if (decodedPath.startsWith(prefix)) {
        const rel = prefix === '/static/' ? decodedPath.slice(prefix.length) : decodedPath.slice(1);
        return path.join(this.staticRoot, rel);
      }
    }
    if (/^\/[a-zA-Z0-9._-]+\.html$/.test(decodedPath)) {
      return path.join(this.staticRoot, decodedPath.slice(1));
    }
    return null;
  }

  _toInfiniteProvider(provider) {
    if (!provider) return null;
    const apiKey = provider.api_key || provider.apiKeys?.[0] || '';
    const walletKey = provider.wallet_api_key || provider.walletApiKey || '';
    // Map internal IDs to upstream-compatible IDs expected by the frontend
    let id = provider.id;
    if (id === 'modelscope-default') id = 'modelscope';
    if (id === 'runninghub-default') id = 'runninghub';
    return {
      ...provider,
      id,
      base_url: provider.base_url || provider.baseUrl || '',
      api_key: apiKey,
      has_key: Boolean(apiKey),
      key_preview: apiKey.length > 8 ? apiKey.slice(0, 3) + '****' + apiKey.slice(-3) : (apiKey ? '****' : ''),
      wallet_api_key: walletKey,
      has_wallet_key: Boolean(walletKey),
      wallet_key_preview: walletKey.length > 8 ? walletKey.slice(0, 3) + '****' + walletKey.slice(-3) : (walletKey ? '****' : ''),
      image_models: provider.image_models || provider.imageModels || [],
      chat_models: provider.chat_models || provider.chatModels || [],
      video_models: provider.video_models || provider.videoModels || [],
      ms_loras: provider.ms_loras || provider.msLoras || [],
      rh_apps: provider.rh_apps || provider.rhApps || [],
      rh_workflows: provider.rh_workflows || provider.rhWorkflows || [],
      image_generation_endpoint: provider.image_generation_endpoint || provider.customEndpoints?.textToImage || '',
      image_edit_endpoint: provider.image_edit_endpoint || provider.customEndpoints?.inpaint || '',
    };
  }

  _toInfiniteProviders(providers) {
    return (providers || []).map(provider => this._toInfiniteProvider(provider)).filter(Boolean);
  }

  _fromInfiniteProvider(provider) {
    // 处理 clear_key / clear_wallet_key 标记
    const clearKey = provider.clear_key === true;
    const clearWalletKey = provider.clear_wallet_key === true;
    // Map upstream-style IDs back to internal IDs
    let id = provider.id;
    if (id === 'modelscope') id = 'modelscope-default';
    if (id === 'runninghub') id = 'runninghub-default';
    return {
      ...provider,
      id,
      baseUrl: provider.baseUrl || provider.base_url || '',
      apiKeys: clearKey ? [] : (provider.apiKeys || (provider.api_key ? [provider.api_key] : [])),
      imageModels: provider.imageModels || provider.image_models || [],
      chatModels: provider.chatModels || provider.chat_models || [],
      videoModels: provider.videoModels || provider.video_models || [],
      msLoras: provider.msLoras || provider.ms_loras || [],
      rhApps: provider.rhApps || provider.rh_apps || [],
      rhWorkflows: provider.rhWorkflows || provider.rh_workflows || [],
      walletApiKey: clearWalletKey ? '' : (provider.walletApiKey || provider.wallet_api_key || ''),
      customEndpoints: provider.customEndpoints || {
        textToImage: provider.image_generation_endpoint || '',
        inpaint: provider.image_edit_endpoint || '',
      },
    };
  }

  _toInfiniteCanvasListItem(item) {
    return {
      ...item,
      title: item.title || item.name || 'Untitled',
      name: item.name || item.title || 'Untitled',
      updated_at: item.updated_at || item.updatedAt || Date.now(),
      created_at: item.created_at || item.createdAt || Date.now(),
      deleted_at: item.deleted_at || item.deletedAt || 0,
      kind: item.kind || item.metadata?.kind || 'classic',
      icon: item.icon || item.metadata?.icon || '🧩',
    };
  }

  _toInfiniteCanvasDocument(doc) {
    if (!doc) return null;
    return {
      ...doc,
      title: doc.title || doc.name || 'Untitled',
      name: doc.name || doc.title || 'Untitled',
      updated_at: doc.updated_at || doc.updatedAt || Date.now(),
      created_at: doc.created_at || doc.createdAt || Date.now(),
      kind: doc.kind || doc.metadata?.kind || 'classic',
      icon: doc.icon || doc.metadata?.icon || '🧩',
      nodes: Array.isArray(doc.nodes) ? doc.nodes : (Array.isArray(doc.metadata?.smartNodes) ? doc.metadata.smartNodes : []),
      connections: Array.isArray(doc.connections) ? doc.connections : (Array.isArray(doc.metadata?.smartConnections) ? doc.metadata.smartConnections : []),
      viewport: doc.viewport || { x: 0, y: 0, scale: 1 },
    };
  }

  _fromInfiniteCanvasDocument(doc) {
    const title = doc.title || doc.name || 'Untitled';
    const viewport = doc.viewport || { x: 0, y: 0, scale: 1 };
    return {
      id: doc.id,
      name: title,
      createdAt: doc.createdAt || doc.created_at || Date.now(),
      updatedAt: doc.updatedAt || doc.updated_at || Date.now(),
      viewport: {
        x: Number(viewport.x || 0),
        y: Number(viewport.y || 0),
        zoom: Number(viewport.zoom || viewport.scale || 1),
        scale: Number(viewport.scale || viewport.zoom || 1),
      },
      objects: Array.isArray(doc.objects) ? doc.objects : [],
      metadata: {
        ...(doc.metadata || {}),
        kind: doc.kind || doc.metadata?.kind || 'classic',
        icon: doc.icon || doc.metadata?.icon || '🧩',
        smartNodes: Array.isArray(doc.nodes) ? doc.nodes : (doc.metadata?.smartNodes || []),
        smartConnections: Array.isArray(doc.connections) ? doc.connections : (doc.metadata?.smartConnections || []),
      },
      nodes: Array.isArray(doc.nodes) ? doc.nodes : [],
      connections: Array.isArray(doc.connections) ? doc.connections : [],
      title,
      kind: doc.kind || doc.metadata?.kind || 'classic',
      icon: doc.icon || doc.metadata?.icon || '🧩',
      updated_at: doc.updated_at || doc.updatedAt || Date.now(),
      created_at: doc.created_at || doc.createdAt || Date.now(),
    };
  }

  _buildConfigPayload() {
    const providers = this.providerStore.getAll();
    const apiProviders = this._toInfiniteProviders(providers);
    const primary = this.providerStore.getPrimary();
    const imageModels = [...new Set(apiProviders.flatMap(provider => provider.image_models || []))];
    const chatModels = [...new Set(apiProviders.flatMap(provider => provider.chat_models || []))];
    const videoModels = [...new Set(apiProviders.flatMap(provider => provider.video_models || []))];
    const modelscope = apiProviders.find(provider => provider.id === 'modelscope' || provider.protocol === 'modelscope');
    return {
      providers: apiProviders,
      api_providers: apiProviders,
      primaryProviderId: primary?.id || '',
      globalBaseUrl: primary?.baseUrl || '',
      globalApiKey: primary?.apiKeys?.[0] || '',
      globalApiSpec: primary?.protocol || 'openai',
      image_models: imageModels,
      chat_models: chatModels,
      video_models: videoModels,
      ms_chat_models: modelscope?.chat_models || [],
      image_model: imageModels[0] || '',
      imageModels: imageModels.map(modelId => ({ modelId, providerId: apiProviders.find(p => (p.image_models || []).includes(modelId))?.id || '' })),
      apiVendors: apiProviders.map(provider => ({ id: provider.id, name: provider.name, baseUrl: provider.base_url, apiKey: provider.api_key || '', apiSpec: provider.protocol })),
    };
  }

  async _handleGenerate(req, res, pathname) {
    const body = await parseRequestBody(req);
    const payload = body.json || {};
    const dimensions = parsePayloadDimensions(payload);
    const params = {
      prompt: payload.prompt || '',
      negativePrompt: payload.negativePrompt || payload.negative_prompt || '',
      model: payload.model || payload.modelId || this.providerStore.getPrimary()?.imageModels?.[0] || '',
      width: dimensions.width,
      height: dimensions.height,
      batchSize: Number(payload.batchSize || payload.n || 1),
      providerId: payload.providerId || payload.provider_id || payload.provider || '',
      referenceImages: this._payloadToBuffers(payload.referenceImages || payload.reference_images || payload.images || []),
      sourceImage: this._payloadToBuffer(payload.sourceImage || payload.image || payload.inputImage),
      mask: this._payloadToBuffer(payload.mask),
      returnMode: payload.returnMode || 'base64',
      extraPayload: payload.extraPayload || {},
    };

    if (pathname === '/generate') {
      params.providerId = params.providerId || this.providerStore.getEnabled().find(p => p.protocol === 'modelscope')?.id || '';
    }

    if (pathname === '/api/ms/generate' || pathname === '/api/angle/generate') {
      params.providerId = params.providerId || this.providerStore.getEnabled().find(p => p.protocol === 'modelscope')?.id || '';
    }

    if (pathname === '/api/online-image' || pathname === '/api/canvas-image-tasks' || pathname === '/api/canvas-video' || pathname === '/api/canvas-llm') {
      // 如果请求的 providerId 在后端找不到，自动回退到 primary 或第一个可用 provider
      if (params.providerId) {
        const exists = this.providerStore.getEnabled().find(p => p.id === params.providerId);
        if (!exists) {
          const fallback = this.providerStore.getPrimary() || this.providerStore.getEnabled()[0];
          if (fallback) {
            console.warn(`[InfiniteCanvasServer] Provider '${params.providerId}' not found, falling back to '${fallback.id}'`);
            params.providerId = fallback.id;
          }
        }
      }
      params.providerId = params.providerId || this.providerStore.getPrimary()?.id || '';
    }

    const result = await this.apiService.generate(params);
    if (result.error) return safeJson(res, 200, { ...result, task_id: result.taskId || '' });

    const finalized = result.result || (this.apiService.getStatus(result.taskId)?.result || null);
    if (finalized?.images?.length) {
      this._pushHistory({
        id: result.taskId,
        type: pathname.replace(/^\/api\//, ''),
        prompt: params.prompt,
        model: params.model,
        createdAt: Date.now(),
        results: finalized.images,
      });
    }

    return safeJson(res, 200, { ...result, task_id: result.taskId || '' });
  }

  _payloadToBuffer(value) {
    if (!value) return null;
    if (Buffer.isBuffer(value)) return value;
    if (typeof value !== 'string') return null;
    const dataUrl = value.match(/^data:image\/[^;]+;base64,(.+)$/i);
    if (dataUrl) return Buffer.from(dataUrl[1], 'base64');
    if (value.startsWith('file://')) {
      const filePath = decodeURIComponent(value.replace(/^file:\/\//i, ''));
      try { return fs.readFileSync(filePath); } catch { return null; }
    }
    if (path.isAbsolute(value) && fs.existsSync(value)) return fs.readFileSync(value);
    if (value.length > 100) {
      try { return Buffer.from(value, 'base64'); } catch { return null; }
    }
    return null;
  }

  _payloadToBuffers(value) {
    if (!Array.isArray(value)) return [];
    return value.map(item => this._payloadToBuffer(item)).filter(Boolean);
  }

  async _handleRunningHub(req, res, pathname, searchParams) {
    if (pathname === '/api/runninghub/app-info') {
      return safeJson(res, 200, { ok: true, data: {} });
    }

    if (pathname === '/api/runninghub/workflows') {
      return safeJson(res, 200, { workflows: [] });
    }

    if (/^\/api\/runninghub\/workflows\/[^/]+$/.test(pathname)) {
      return safeJson(res, 200, { ok: true, workflow: { id: decodeURIComponent(pathname.split('/')[4]) } });
    }

    if (pathname === '/api/runninghub/upload-asset') {
      return await this._handleUpload(req, res, pathname);
    }

    if (pathname === '/api/runninghub/submit' || pathname === '/api/runninghub/workflow-submit') {
      return await this._handleGenerate(req, res, '/api/online-image');
    }

    if (pathname === '/api/runninghub/workflow-info') {
      return safeJson(res, 200, { ok: true, data: {} });
    }

    if (pathname === '/api/runninghub/query') {
      const taskId = String(searchParams.get('taskId') || '');
      return safeJson(res, 200, this.apiService.getStatus(taskId) || { taskId, status: 'queued' });
    }

    return safeJson(res, 200, { ok: true });
  }

  async _handleUpload(req, res, pathname) {
    const body = await parseRequestBody(req);

    // 支持前端 'file'(单) / 'files'(多) / 'image' / 'data' 四种字段名
    let fileEntries = [];
    if (body.formData) {
      const multi = body.formData.getAll('files');
      const single = body.formData.get('file') || body.formData.get('image') || body.formData.get('data');
      if (multi && multi.length > 0 && typeof multi[0]?.arrayBuffer === 'function') {
        fileEntries = multi;
      } else if (single && typeof single.arrayBuffer === 'function') {
        fileEntries = [single];
      }
    }

    // 如果 formData 解析不到文件，尝试用 raw buffer
    if (fileEntries.length === 0 && body.buffer && body.buffer.length > 0) {
      fileEntries = [{ arrayBuffer: async () => body.buffer, name: `upload_${Date.now()}.png` }];
    }

    const results = [];
    for (const entry of fileEntries) {
      const data = Buffer.from(await entry.arrayBuffer());
      const name = entry.name || `upload_${Date.now()}_${results.length}.png`;
      const safeName = name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const target = path.join(this.inputDir, safeName);
      fs.writeFileSync(target, data);
      const relativeUrl = `/api/view?filename=${encodeURIComponent(safeName)}&type=input`;
      results.push({ url: relativeUrl, name: safeName, filePath: target, comfy_name: safeName });
    }

    if (pathname === '/api/ai/import-local-image') {
      return safeJson(res, 200, { ok: true, files: results, url: results[0]?.url || '', filePath: results[0]?.filePath || '' });
    }

    if (pathname === '/api/runninghub/upload-asset') {
      return safeJson(res, 200, { ok: true, data: { url: results[0]?.url || '', filePath: results[0]?.filePath || '' }, files: results });
    }

    return safeJson(res, 200, { ok: true, files: results, url: results[0]?.url || '', name: results[0]?.name || '' });
  }

  _serveView(res, url) {
    const filename = url.searchParams.get('filename') || '';
    const type = url.searchParams.get('type') || 'input';
    const local = filename.startsWith('file://') ? filename.replace(/^file:\/\//i, '') : filename;
    const resolved = path.isAbsolute(local)
      ? local
      : path.join(type === 'output' ? this.outputDir : this.inputDir, path.basename(local));
    return this._serveFile(res, resolved);
  }

  async _downloadTarget(res, target, name) {
    const local = target.startsWith('file://') ? target.replace(/^file:\/\//i, '') : target;
    if (path.isAbsolute(local) && fs.existsSync(local)) {
      const content = fs.readFileSync(local);
      res.writeHead(200, corsHeaders({
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename=\"${name.replace(/\"/g, '')}\"`,
      }));
      return res.end(content);
    }
    return safeText(res, 404, 'File not found');
  }

  _serveFile(res, filePath) {
    const candidate = path.normalize(filePath);
    if (!candidate.startsWith(this.staticRoot) && !candidate.startsWith(this.inputDir) && !candidate.startsWith(this.outputDir)) {
      return safeText(res, 403, 'Forbidden');
    }
    if (!fs.existsSync(candidate) || fs.statSync(candidate).isDirectory()) {
      return safeText(res, 404, 'Not found');
    }
    const data = fs.readFileSync(candidate);
    res.writeHead(200, corsHeaders({
      'Content-Type': contentTypeFor(candidate),
      'Content-Length': data.length,
      'Cache-Control': candidate.endsWith('.html') ? 'no-store' : 'public, max-age=3600',
    }));
    return res.end(data);
  }

  dispose() {
    try { this.apiService.dispose(); } catch { /* ignore */ }
    try { this.wss?.close(); } catch { /* ignore */ }
    try { this.server?.close(); } catch { /* ignore */ }
  }
}

module.exports = InfiniteCanvasServer;
