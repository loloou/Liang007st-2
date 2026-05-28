// ─────────────────────────────────────────────────────────────────────────────
//  ApiServiceManager.js — Orchestrates all API services
//
//  Central manager that:
//   - Initializes all services (adapters, queue, cache, etc.)
//   - Handles generation requests (routing to correct adapter)
//   - Manages lifecycle (start, dispose)
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const path = require('path');
const fs = require('fs');
const AdapterFactory = require('./AdapterFactory');
const KeyRotator = require('./KeyRotator');
const RateLimiter = require('./RateLimiter');
const CircuitBreaker = require('./CircuitBreaker');
const TaskQueue = require('./TaskQueue');
const TaskStore = require('./TaskStore');
const ResultCache = require('./ResultCache');
const ImageCleaner = require('./ImageCleaner');
const HealthChecker = require('./HealthChecker');
const ProviderConfigStore = require('../config/ProviderConfigStore');
const WebSocketServer = require('../ws/WebSocketServer');

function normalizeDimensions(width, height) {
  let w = Math.max(64, Number(width) || 1024);
  let h = Math.max(64, Number(height) || 1024);
  const maxSide = Math.max(w, h);
  const limit = 8192;
  if (maxSide > limit) {
    const scale = limit / maxSide;
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }
  return { width: Math.max(64, w), height: Math.max(64, h) };
}

class ApiServiceManager {
  /**
   * @param {string} userDataDir - app.getPath('userData')
   * @param {Electron.BrowserWindow | null} mainWindow
   */
  constructor(userDataDir, mainWindow) {
    this._userDataDir = userDataDir;
    this._mainWindow = mainWindow;

    // Directories
    this._imagesDir = path.join(userDataDir, 'generated_images');
    this._thumbnailsDir = path.join(userDataDir, 'thumbnails');
    this._tasksDir = path.join(userDataDir, 'tasks');

    // Ensure directories
    for (const dir of [this._imagesDir, this._thumbnailsDir, this._tasksDir]) {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    }

    // Services
    this._configStore = new ProviderConfigStore(userDataDir);
    this._taskStore = new TaskStore(path.join(this._tasksDir, 'tasks.json'));
    this._taskQueue = new TaskQueue({ concurrency: 3, taskStore: this._taskStore });
    this._resultCache = new ResultCache(100);
    this._rateLimiter = new RateLimiter();
    this._circuitBreaker = new CircuitBreaker({
      onStateChange: (id, state) => {
        console.log(`[CircuitBreaker] Provider ${id} -> ${state}`);
      },
    });
    this._healthChecker = new HealthChecker({
      adapterFactory: AdapterFactory,
      configStore: this._configStore,
    });
    this._imageCleaner = new ImageCleaner({
      imagesDir: this._imagesDir,
      thumbnailsDir: this._thumbnailsDir,
    });
    this._wsServer = new WebSocketServer();

    /** @type {Map<string, import('./AbstractApiAdapter')>} */
    this._adapters = new Map();
    /** @type {Map<string, KeyRotator>} */
    this._keyRotators = new Map();

    // Wire up task queue events to WebSocket + IPC
    this._setupEventForwarding();
  }

  /**
   * Initialize all services. Call after app.whenReady().
   */
  async start() {
    // Start WebSocket server
    try {
      await this._wsServer.start();
    } catch (err) {
      console.warn('[ApiServiceManager] WebSocket server failed to start:', err.message);
    }

    // Initialize adapters from config
    this._refreshAdapters();

    // Start image cleaner
    this._imageCleaner.start();

    // Run health check on startup (non-blocking)
    this._healthChecker.checkAll().catch(() => {});
    this._healthChecker.startPeriodic();

    // Clean up old tasks
    this._taskStore.cleanup();

    console.log('[ApiServiceManager] Started');
  }

  /**
   * Refresh adapters from current config
   */
  _refreshAdapters() {
    // Keep old adapters in a retirement map — they'll be disposed
    // when no more in-flight tasks reference them. For simplicity,
    // dispose after a short delay to let running tasks finish.
    const oldAdapters = new Map(this._adapters);
    this._adapters.clear();

    const providers = this._configStore.getAll();
    for (const provider of providers) {
      if (!provider.enabled) continue;
      try {
        const adapter = AdapterFactory.create(provider);
        this._adapters.set(provider.id, adapter);
        this._circuitBreaker.register(provider.id);

        // Set up key rotation
        if (provider.apiKeys && provider.apiKeys.length > 1) {
          this._keyRotators.set(provider.id, new KeyRotator(provider.apiKeys));
        }

        // Set up rate limiting
        if (provider.rateLimitRpm) {
          this._rateLimiter.configure(provider.id, provider.rateLimitRpm);
        }
      } catch (err) {
        console.warn(`[ApiServiceManager] Failed to create adapter for ${provider.name}:`, err.message);
      }
    }

    // Dispose old adapters after a grace period for in-flight tasks
    setTimeout(() => {
      for (const [, adapter] of oldAdapters) {
        try { adapter.dispose(); } catch { /* ignore */ }
      }
    }, 30000);
  }

  _setupEventForwarding() {
    this._taskQueue.on('task:queued', task => this._notifyRenderer('task:queued', task));
    this._taskQueue.on('task:started', task => this._notifyRenderer('task:started', task));
    this._taskQueue.on('task:progress', task => {
      this._notifyRenderer('task:progress', task);
      this._wsServer.sendProgress(task.taskId, task.progress, task.status);
    });
    this._taskQueue.on('task:completed', task => {
      this._notifyRenderer('task:completed', task);
      this._wsServer.sendCompleted(task.taskId, task.result);
    });
    this._taskQueue.on('task:failed', task => {
      this._notifyRenderer('task:failed', task);
      this._wsServer.sendFailed(task.taskId, task.error);
    });
    this._taskQueue.on('task:cancelled', task => {
      this._notifyRenderer('task:cancelled', task);
      this._wsServer.sendCancelled(task.taskId);
    });
  }

  _notifyRenderer(channel, data) {
    if (this._mainWindow && !this._mainWindow.isDestroyed()) {
      try {
        this._mainWindow.webContents.send(channel, data);
      } catch { /* window may be closing */ }
    }
  }

  /**
   * Submit a generation request
   * @param {object} params
   * @returns {{ taskId: string, cached?: boolean, result?: object, error?: string }}
   */
  async generate(params) {
    const normalized = await this._normalizeGenerateParams(params);

    // Check cache first
    if (!normalized.noCache) {
      const cached = this._resultCache.get(normalized);
      if (cached) {
        return { taskId: cached.taskId, cached: true, result: cached };
      }
    }

    const candidates = this._selectProviderCandidates(normalized);
    if (candidates.length === 0) {
      return { taskId: '', error: 'No available API providers' };
    }

    // Submit to queue
    const { taskId, promise } = this._taskQueue.submit(normalized, async (task, signal) => {
      let lastResult = null;
      let lastError = null;

      for (const provider of candidates) {
        if (signal.aborted) throw new Error('Cancelled');
        if (!this._circuitBreaker.isAvailable(provider.id)) continue;

        const adapter = this._adapters.get(provider.id);
        if (!adapter) continue;

        const rotator = this._keyRotators.get(provider.id);
        const taskApiKey = rotator ? rotator.getNextKey() : null;
        let taskAdapter = null;

        try {
          task.progress = Math.max(task.progress || 0, 5);
          this._taskQueue.updateProgress(task.taskId, task.progress);

          await this._rateLimiter.acquire(provider.id);
          if (signal.aborted) throw new Error('Cancelled');

          const taskConfig = {
            ...adapter.config,
            apiKeys: taskApiKey ? [taskApiKey] : [...(adapter.config.apiKeys || [])],
          };
          taskAdapter = AdapterFactory.create(taskConfig);

          const result = await this._executeAdapter(taskAdapter, normalized);
          if (signal.aborted) throw new Error('Cancelled');

          if (result.error) {
            lastResult = result;
            this._circuitBreaker.reportFailure(provider.id);
            if (rotator && taskApiKey) rotator.reportError(taskApiKey, result.metadata?.httpStatus === 429);
            console.warn(`[Failover] Provider ${provider.id} failed: ${result.error}`);
            continue;
          }

          this._circuitBreaker.reportSuccess(provider.id);
          if (rotator && taskApiKey) rotator.reportSuccess(taskApiKey);

          const finalized = await this._finalizeResult(result, normalized);
          this._resultCache.set(normalized, finalized);
          return finalized;
        } catch (err) {
          lastError = err;
          this._circuitBreaker.reportFailure(provider.id);
          if (rotator && taskApiKey) rotator.reportError(taskApiKey, /429|rate/i.test(err.message || ''));
          console.warn(`[Failover] Provider ${provider.id} threw:`, err.message || String(err));
        } finally {
          if (taskAdapter) {
            try { taskAdapter.dispose(); } catch { /* ignore */ }
          }
        }
      }

      if (lastResult) return lastResult;
      throw lastError || new Error('All API providers failed');
    });

    // Don't await — return immediately with taskId
    promise.catch(() => {}); // Prevent unhandled rejection

    return { taskId };
  }

  _executeAdapter(adapter, params) {
    if (params.mask) return adapter.inpaint(params);
    if (params.sourceImage) return adapter.imageToImage(params);
    return adapter.textToImage(params);
  }

  async _normalizeGenerateParams(params) {
    const referenceImages = Array.isArray(params.referenceImages)
      ? (await Promise.all(params.referenceImages.map(input => this._imageInputToBuffer(input)))).filter(Boolean)
      : undefined;
    const sourceImage = params.sourceImage ? await this._imageInputToBuffer(params.sourceImage) : undefined;
    const mask = params.mask ? await this._imageInputToBuffer(params.mask) : undefined;

    const dimensions = normalizeDimensions(params.width, params.height);

    return {
      ...params,
      prompt: String(params.prompt || '').trim(),
      negativePrompt: params.negativePrompt ? String(params.negativePrompt) : undefined,
      model: String(params.model || '').trim(),
      width: dimensions.width,
      height: dimensions.height,
      batchSize: Math.max(1, Math.min(16, Number(params.batchSize) || 1)),
      returnMode: ['base64', 'localUrl', 'cloudUrl'].includes(params.returnMode) ? params.returnMode : 'base64',
      providerId: params.providerId || params.provider,
      referenceImages,
      sourceImage,
      mask,
    };
  }

  async _imageInputToBuffer(input) {
    if (!input) return null;
    if (Buffer.isBuffer(input)) return input;
    const value = String(input);

    try {
      const dataUrlMatch = value.match(/^data:image\/[^;]+;base64,(.+)$/i);
      if (dataUrlMatch) return Buffer.from(dataUrlMatch[1], 'base64');

      if (value.startsWith('file://')) {
        const filePath = decodeURIComponent(value.replace(/^file:\/\//i, ''));
        return fs.readFileSync(filePath);
      }

      if (/^https?:\/\//i.test(value)) {
        const resp = await fetch(value);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return Buffer.from(await resp.arrayBuffer());
      }

      if (path.isAbsolute(value) && fs.existsSync(value)) {
        return fs.readFileSync(value);
      }

      if (value.length > 100) {
        return Buffer.from(value, 'base64');
      }
    } catch (err) {
      console.warn('[ApiServiceManager] Failed to normalize image input:', err.message || String(err));
    }

    return null;
  }

  _selectProviderCandidates(params) {
    const providers = this._configStore.getEnabled();
    const model = String(params.model || '').toLowerCase();
    const requestedId = params.providerId ? String(params.providerId) : '';

    // 1. 精确匹配 providerId + model
    const filtered = providers.filter(provider => {
      if (requestedId && provider.id !== requestedId) return false;
      if (!model || !Array.isArray(provider.imageModels) || provider.imageModels.length === 0) return true;
      return provider.imageModels.some(m => String(m).toLowerCase() === model);
    });

    // 2. 只匹配 providerId（不管 model）
    const byId = filtered.length > 0 ? filtered : providers.filter(provider => !requestedId || provider.id === requestedId);

    // 3. 过滤出有 adapter 的
    let candidates = byId.filter(provider => this._adapters.has(provider.id));

    // 4. 如果指定了 providerId 但找不到 adapter，回退到所有有 adapter 且含该 model 的 provider
    if (candidates.length === 0 && requestedId) {
      candidates = providers.filter(provider => {
        if (!this._adapters.has(provider.id)) return false;
        if (!model) return true;
        return !Array.isArray(provider.imageModels) || provider.imageModels.length === 0 ||
          provider.imageModels.some(m => String(m).toLowerCase() === model);
      });
      if (candidates.length > 0) {
        console.warn(`[ApiServiceManager] Provider '${requestedId}' not found, falling back to: ${candidates.map(c => c.id).join(', ')}`);
      }
    }

    // 5. 最终兜底：返回所有有 adapter 的 provider
    if (candidates.length === 0) {
      candidates = providers.filter(provider => this._adapters.has(provider.id));
    }

    return candidates;
  }

  async _finalizeResult(result, params) {
    if (!result || !Array.isArray(result.images)) return result;
    if (params.returnMode === 'base64') return result;

    const images = [];
    for (const image of result.images) {
      if (params.returnMode === 'cloudUrl') {
        images.push(image.format === 'cloudUrl' ? image : { ...image });
        continue;
      }

      if (params.returnMode === 'localUrl') {
        const local = await this._materializeImage(image);
        images.push(local || image);
      }
    }
    return { ...result, images };
  }

  async _materializeImage(image) {
    try {
      let buffer = null;
      if (image.format === 'base64') {
        const raw = String(image.data || '').replace(/^data:image\/[^;]+;base64,/, '');
        buffer = Buffer.from(raw, 'base64');
      } else if (image.format === 'cloudUrl' && /^https?:\/\//i.test(image.data || '')) {
        const resp = await fetch(image.data);
        if (!resp.ok) return null;
        buffer = Buffer.from(await resp.arrayBuffer());
      }
      if (!buffer || buffer.length === 0) return null;

      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const fileName = `${id}.png`;
      const filePath = path.join(this._imagesDir, fileName);
      fs.writeFileSync(filePath, buffer);
      return { ...image, id: image.id || id, format: 'localPath', data: filePath };
    } catch (err) {
      console.warn('[ApiServiceManager] Failed to materialize image:', err.message || String(err));
      return null;
    }
  }

  /**
   * Cancel a task
   * @param {string} taskId
   * @returns {boolean}
   */
  cancel(taskId) {
    return this._taskQueue.cancel(taskId);
  }

  /**
   * Get task status
   * @param {string} taskId
   * @returns {object | null}
   */
  getStatus(taskId) {
    return this._taskQueue.getStatus(taskId);
  }

  /**
   * Get all provider configs
   * @returns {object[]}
   */
  getProviders() {
    return this._configStore.getAll();
  }

  /**
   * CRUD provider operations
   */
  addProvider(config) {
    const provider = this._configStore.add(config);
    this._refreshAdapters();
    return provider;
  }

  updateProvider(id, patch) {
    const result = this._configStore.update(id, patch);
    this._refreshAdapters();
    return result;
  }

  removeProvider(id) {
    const ok = this._configStore.remove(id);
    if (ok) this._refreshAdapters();
    return ok;
  }

  /**
   * Test a provider connection
   * @param {string} providerId
   * @returns {Promise<object>}
   */
  async testProvider(providerId) {
    const adapter = this._adapters.get(providerId);
    if (!adapter) return { ok: false, message: 'Provider not found' };
    return adapter.testConnection();
  }

  /**
   * Get models from a provider
   * @param {string} providerId
   * @returns {Promise<object[]>}
   */
  async getModels(providerId) {
    const adapter = this._adapters.get(providerId);
    if (!adapter) return [];
    return adapter.getModels();
  }

  /**
   * Import settings from renderer
   * @param {object} settings
   */
  importRendererSettings(settings) {
    this._configStore.importFromRenderer(settings);
    this._refreshAdapters();
  }

  /**
   * Get comprehensive service status
   */
  getServiceStatus() {
    return {
      providers: this._configStore.getAll().map(p => ({
        id: p.id,
        name: p.name,
        protocol: p.protocol,
        enabled: p.enabled,
        primary: p.primary,
      })),
      queue: this._taskQueue.getStats(),
      cache: this._resultCache.getStats(),
      health: this._healthChecker.getStatus(),
      circuitBreaker: this._circuitBreaker.getStatus(),
      rateLimiter: this._rateLimiter.getStatus(),
      wsPort: this._wsServer.port,
      wsClients: this._wsServer.clientCount,
    };
  }

  /** @returns {string} */
  get imagesDir() { return this._imagesDir; }

  /** @returns {number} */
  get wsPort() { return this._wsServer.port; }

  /** @returns {import('../config/ProviderConfigStore')} */
  get configStore() { return this._configStore; }

  /**
   * Set the main window reference
   * @param {Electron.BrowserWindow | null} win
   */
  setMainWindow(win) {
    this._mainWindow = win;
  }

  /**
   * Dispose all services
   */
  dispose() {
    this._taskQueue.dispose();
    this._resultCache.clear();
    this._rateLimiter.dispose();
    this._imageCleaner.dispose();
    this._healthChecker.dispose();
    this._wsServer.dispose();
    for (const [, adapter] of this._adapters) adapter.dispose();
    this._adapters.clear();
  }
}

module.exports = ApiServiceManager;
