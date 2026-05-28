// ─────────────────────────────────────────────────────────────────────────────
//  ipcHandlers.js — Register all IPC handlers for main process services
//
//  Security: All inputs validated. All handlers wrapped in try/catch.
//  Channels:
//    api:generate, api:cancel, api:status, api:providers, api:test, api:models
//    api:import-settings, api:service-status
//    canvas:list, canvas:load, canvas:save, canvas:create, canvas:rename,
//    canvas:trash, canvas:restore, canvas:list-trash
//    assets:list, assets:get, assets:import, assets:update, assets:delete,
//    assets:tags, assets:batch-tags, assets:categories
//    app:ws-port, app:check-update
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const { ipcMain, app } = require('electron');
const ApiServiceManager = require('./services/api/ApiServiceManager');
const AssetLibraryService = require('./services/assets/AssetLibraryService');
const CanvasStateService = require('./services/canvas/CanvasStateService');
const UpdateChecker = require('./services/update/UpdateChecker');

/** @type {ApiServiceManager | null} */
let apiService = null;
/** @type {AssetLibraryService | null} */
let assetService = null;
/** @type {CanvasStateService | null} */
let canvasService = null;
/** @type {UpdateChecker | null} */
let updateChecker = null;

/** Track registered channels for cleanup */
const registeredChannels = [];

// ── Input validation helpers ──────────────────────────────────────────────

function assertString(val, name) {
  if (typeof val !== 'string' || !val.trim()) throw new Error(`${name} must be a non-empty string`);
  return val.trim();
}

function assertOptionalString(val, name) {
  if (val === undefined || val === null) return undefined;
  if (typeof val !== 'string') throw new Error(`${name} must be a string`);
  return val.trim();
}

function assertObject(val, name) {
  if (!val || typeof val !== 'object' || Array.isArray(val)) throw new Error(`${name} must be an object`);
  return val;
}

function assertNumber(val, name) {
  if (typeof val !== 'number' || !Number.isFinite(val)) throw new Error(`${name} must be a number`);
  return val;
}

function assertSafeId(val, name) {
  assertString(val, name);
  const trimmed = val.trim();
  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    throw new Error(`${name} contains invalid characters (only alphanumeric, underscore, hyphen allowed)`);
  }
  return trimmed;
}

/** Whitelist of patchable asset fields (prevents fileName/filePath overwrite) */
const ASSET_PATCHABLE_FIELDS = new Set(['tags', 'favorite', 'category', 'prompt', 'model']);

function sanitizeAssetPatch(patch) {
  const safe = {};
  for (const [k, v] of Object.entries(patch)) {
    if (ASSET_PATCHABLE_FIELDS.has(k)) safe[k] = v;
  }
  return safe;
}

// ── Safe handler registration ─────────────────────────────────────────────

function safeHandle(channel, handler) {
  registeredChannels.push(channel);
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await handler(event, ...args);
    } catch (err) {
      console.warn(`[IPC:${channel}] Error:`, err.message);
      return { error: err.message || 'Internal error' };
    }
  });
}

/**
 * Initialize all services and register IPC handlers
 * @param {Electron.BrowserWindow | null} mainWindow
 */
function registerIpcHandlers(mainWindow) {
  const userDataDir = app.getPath('userData');

  // Initialize services
  apiService = new ApiServiceManager(userDataDir, mainWindow);
  assetService = new AssetLibraryService(userDataDir);
  canvasService = new CanvasStateService(userDataDir);
  updateChecker = new UpdateChecker({
    currentVersion: app.getVersion(),
    repoUrl: 'https://github.com/hero8152/Infinite-Canvas',
  });

  // ── API generation handlers ─────────────────────────────────────────────
  safeHandle('api:generate', async (_event, params) => {
    assertObject(params, 'params');
    assertString(params.prompt, 'params.prompt');
    assertString(params.model, 'params.model');
    assertNumber(params.width, 'params.width');
    assertNumber(params.height, 'params.height');
    assertNumber(params.batchSize, 'params.batchSize');
    return await apiService.generate(params);
  });

  safeHandle('api:cancel', (_event, taskId) => {
    assertString(taskId, 'taskId');
    return apiService.cancel(taskId);
  });

  safeHandle('api:status', (_event, taskId) => {
    assertString(taskId, 'taskId');
    return apiService.getStatus(taskId);
  });

  // ── Provider management ─────────────────────────────────────────────────
  safeHandle('api:providers', () => {
    return apiService.getProviders();
  });

  safeHandle('api:provider:add', (_event, config) => {
    assertObject(config, 'config');
    return apiService.addProvider(config);
  });

  safeHandle('api:provider:update', (_event, data) => {
    assertObject(data, 'data');
    assertString(data.id, 'id');
    assertObject(data.patch, 'patch');
    return apiService.updateProvider(data.id, data.patch);
  });

  safeHandle('api:provider:remove', (_event, id) => {
    assertString(id, 'id');
    return apiService.removeProvider(id);
  });

  safeHandle('api:test', async (_event, providerId) => {
    assertString(providerId, 'providerId');
    return apiService.testProvider(providerId);
  });

  safeHandle('api:models', async (_event, providerId) => {
    assertString(providerId, 'providerId');
    return apiService.getModels(providerId);
  });

  safeHandle('api:import-settings', (_event, settings) => {
    assertObject(settings, 'settings');
    apiService.importRendererSettings(settings);
    return { ok: true };
  });

  safeHandle('api:service-status', () => {
    return apiService.getServiceStatus();
  });

  // ── Canvas handlers ─────────────────────────────────────────────────────
  safeHandle('canvas:list', () => {
    return canvasService.list();
  });

  safeHandle('canvas:load', (_event, canvasId) => {
    assertSafeId(canvasId, 'canvasId');
    return canvasService.load(canvasId);
  });

  safeHandle('canvas:save', (_event, canvasData) => {
    assertObject(canvasData, 'canvasData');
    canvasService.save(canvasData);
    return { ok: true };
  });

  safeHandle('canvas:create', (_event, name) => {
    const safeName = assertOptionalString(name, 'name') || 'Untitled';
    return canvasService.create(safeName);
  });

  safeHandle('canvas:rename', (_event, data) => {
    assertObject(data, 'data');
    assertSafeId(data.id, 'id');
    assertString(data.name, 'name');
    canvasService.rename(data.id, data.name);
    return { ok: true };
  });

  safeHandle('canvas:trash', (_event, canvasId) => {
    assertSafeId(canvasId, 'canvasId');
    canvasService.trash(canvasId);
    return { ok: true };
  });

  safeHandle('canvas:restore', (_event, canvasId) => {
    assertSafeId(canvasId, 'canvasId');
    canvasService.restore(canvasId);
    return { ok: true };
  });

  safeHandle('canvas:list-trash', () => {
    return canvasService.listTrash();
  });

  // ── Asset Library handlers ──────────────────────────────────────────────
  safeHandle('assets:list', (_event, options) => {
    return assetService.getAll(options || {});
  });

  safeHandle('assets:get', (_event, id) => {
    assertSafeId(id, 'id');
    return assetService.getById(id);
  });

  safeHandle('assets:import', async (_event, options) => {
    assertObject(options, 'options');
    assertString(options.data, 'options.data');
    return await assetService.import(options);
  });

  safeHandle('assets:update', (_event, data) => {
    assertObject(data, 'data');
    assertSafeId(data.id, 'id');
    assertObject(data.patch, 'patch');
    // Sanitize patch to prevent fileName/filePath overwrite
    const safePatch = sanitizeAssetPatch(data.patch);
    return assetService.update(data.id, safePatch);
  });

  safeHandle('assets:delete', (_event, id) => {
    assertSafeId(id, 'id');
    return assetService.delete(id);
  });

  safeHandle('assets:tags', () => {
    return assetService.getAllTags();
  });

  safeHandle('assets:batch-tags', (_event, data) => {
    assertObject(data, 'data');
    if (!Array.isArray(data.ids)) throw new Error('ids must be an array');
    if (!Array.isArray(data.tags)) throw new Error('tags must be an array');
    assetService.batchAddTags(data.ids, data.tags);
    return { ok: true };
  });

  safeHandle('assets:categories', () => {
    return assetService.getCategories();
  });

  safeHandle('assets:category:add', (_event, category) => {
    assertObject(category, 'category');
    return assetService.addCategory(category);
  });

  safeHandle('assets:category:update', (_event, data) => {
    assertObject(data, 'data');
    assertSafeId(data.id, 'id');
    assertObject(data.patch, 'patch');
    return assetService.updateCategory(data.id, data.patch);
  });

  safeHandle('assets:category:delete', (_event, id) => {
    assertSafeId(id, 'id');
    return assetService.deleteCategory(id);
  });

  // ── App-level handlers ──────────────────────────────────────────────────
  safeHandle('app:ws-port', () => {
    return apiService.wsPort;
  });

  safeHandle('app:check-update', async () => {
    return updateChecker.check();
  });

  // Removed app:user-data-dir to avoid exposing internal filesystem paths

  // Start API service
  apiService.start().catch(err => {
    console.error('[IPC] Failed to start API service:', err.message);
  });

  // Clean up canvas trash on startup
  canvasService.cleanupTrash();

  console.log('[IPC] All handlers registered');
}

/**
 * Set the main window reference (for event forwarding)
 * @param {Electron.BrowserWindow | null} win
 */
function setMainWindow(win) {
  if (apiService) apiService.setMainWindow(win);
}

/**
 * Dispose all services and unregister IPC handlers
 */
function disposeServices() {
  // Unregister all IPC handlers
  for (const channel of registeredChannels) {
    try { ipcMain.removeHandler(channel); } catch { /* ignore */ }
  }
  registeredChannels.length = 0;

  // Dispose services
  if (apiService) { apiService.dispose(); apiService = null; }
  if (assetService) { assetService.dispose(); assetService = null; }
  canvasService = null;
  updateChecker = null;
}

module.exports = { registerIpcHandlers, setMainWindow, disposeServices };
