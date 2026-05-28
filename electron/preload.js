const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // ── Window controls (existing) ──────────────────────────────────────────
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  toggleMaximize: () => ipcRenderer.send('window-toggle-maximize'),
  close: () => ipcRenderer.send('window-close'),
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  fetchRequest: (params) => ipcRenderer.invoke('fetch-request', params),

  // ── API generation ──────────────────────────────────────────────────────
  apiGenerate: (params) => ipcRenderer.invoke('api:generate', params),
  apiCancel: (taskId) => ipcRenderer.invoke('api:cancel', taskId),
  apiStatus: (taskId) => ipcRenderer.invoke('api:status', taskId),
  apiServiceStatus: () => ipcRenderer.invoke('api:service-status'),

  // ── Provider management ─────────────────────────────────────────────────
  apiProviders: () => ipcRenderer.invoke('api:providers'),
  apiProviderAdd: (config) => ipcRenderer.invoke('api:provider:add', config),
  apiProviderUpdate: (id, patch) => ipcRenderer.invoke('api:provider:update', { id, patch }),
  apiProviderRemove: (id) => ipcRenderer.invoke('api:provider:remove', id),
  apiTest: (providerId) => ipcRenderer.invoke('api:test', providerId),
  apiModels: (providerId) => ipcRenderer.invoke('api:models', providerId),
  apiImportSettings: (settings) => ipcRenderer.invoke('api:import-settings', settings),

  // ── Canvas ──────────────────────────────────────────────────────────────
  canvasList: () => ipcRenderer.invoke('canvas:list'),
  canvasLoad: (canvasId) => ipcRenderer.invoke('canvas:load', canvasId),
  canvasSave: (canvasData) => ipcRenderer.invoke('canvas:save', canvasData),
  canvasCreate: (name) => ipcRenderer.invoke('canvas:create', name),
  canvasRename: (id, name) => ipcRenderer.invoke('canvas:rename', { id, name }),
  canvasTrash: (canvasId) => ipcRenderer.invoke('canvas:trash', canvasId),
  canvasRestore: (canvasId) => ipcRenderer.invoke('canvas:restore', canvasId),
  canvasListTrash: () => ipcRenderer.invoke('canvas:list-trash'),

  // ── Asset Library ───────────────────────────────────────────────────────
  assetsList: (options) => ipcRenderer.invoke('assets:list', options),
  assetsGet: (id) => ipcRenderer.invoke('assets:get', id),
  assetsImport: (options) => ipcRenderer.invoke('assets:import', options),
  assetsUpdate: (id, patch) => ipcRenderer.invoke('assets:update', { id, patch }),
  assetsDelete: (id) => ipcRenderer.invoke('assets:delete', id),
  assetsTags: () => ipcRenderer.invoke('assets:tags'),
  assetsBatchTags: (ids, tags) => ipcRenderer.invoke('assets:batch-tags', { ids, tags }),
  assetsCategories: () => ipcRenderer.invoke('assets:categories'),
  assetsCategoryAdd: (category) => ipcRenderer.invoke('assets:category:add', category),
  assetsCategoryUpdate: (id, patch) => ipcRenderer.invoke('assets:category:update', { id, patch }),
  assetsCategoryDelete: (id) => ipcRenderer.invoke('assets:category:delete', id),

  // ── App utilities ───────────────────────────────────────────────────────
  appWsPort: () => ipcRenderer.invoke('app:ws-port'),
  appCheckUpdate: () => ipcRenderer.invoke('app:check-update'),

  // ── Event listeners (for task progress push from main process) ──────────
  onTaskEvent: (callback) => {
    const channels = ['task:queued', 'task:started', 'task:progress', 'task:completed', 'task:failed', 'task:cancelled'];
    const handlers = channels.map(channel => {
      const handler = (_event, data) => callback(channel, data);
      ipcRenderer.on(channel, handler);
      return { channel, handler };
    });
    // Return cleanup function
    return () => {
      for (const { channel, handler } of handlers) {
        ipcRenderer.removeListener(channel, handler);
      }
    };
  },
});
