// ─────────────────────────────────────────────────────────────────────────────
//  ProviderConfigStore.js — File-based provider configuration persistence
//
//  Migrates renderer localStorage settings and merges Infinite-Canvas non-Comfy
//  provider presets (OpenAI-compatible, ModelScope, custom HTTP, RunningHub).
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const fs = require('fs');
const path = require('path');
const { genId } = require('../api/types');

const SUPPORTED_PROTOCOLS = new Set(['openai', 'apimart', 'gemini', 'modelscope', 'volcengine', 'runninghub', 'custom']);

function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

class ProviderConfigStore {
  /**
   * @param {string} userDataDir - Electron app.getPath('userData')
   */
  constructor(userDataDir) {
    this._userDataDir = userDataDir;
    this._configPath = path.join(userDataDir, 'providers.json');
    this._resourceRunningHubPath = path.resolve(__dirname, '..', '..', '..', 'resources', 'runninghub', 'api_providers.json');
    /** @type {import('../api/types').ProviderConfig[]} */
    this._providers = [];
    this._load();
    this._mergeDefaults();
  }

  _load() {
    try {
      if (fs.existsSync(this._configPath)) {
        const data = JSON.parse(fs.readFileSync(this._configPath, 'utf-8'));
        if (Array.isArray(data)) this._providers = data.map(p => this._normalizeProvider(p));
      }
    } catch (err) {
      console.warn('[ProviderConfigStore] Failed to load:', err.message);
    }
  }

  _save() {
    try {
      const dir = path.dirname(this._configPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this._configPath, JSON.stringify(this._providers, null, 2));
    } catch (err) {
      console.warn('[ProviderConfigStore] Failed to save:', err.message);
    }
  }

  _normalizeProvider(config) {
    const protocol = SUPPORTED_PROTOCOLS.has(config.protocol) ? config.protocol : 'openai';
    return {
      id: String(config.id || genId()).replace(/[^a-zA-Z0-9_-]/g, '_'),
      name: config.name || 'New Provider',
      protocol,
      baseUrl: normalizeBaseUrl(config.baseUrl || config.base_url || ''),
      apiKeys: Array.isArray(config.apiKeys) ? config.apiKeys : (config.apiKey ? [config.apiKey] : []),
      enabled: config.enabled !== false,
      primary: Boolean(config.primary),
      imageModels: Array.isArray(config.imageModels) ? config.imageModels : (Array.isArray(config.image_models) ? config.image_models : []),
      chatModels: Array.isArray(config.chatModels) ? config.chatModels : (Array.isArray(config.chat_models) ? config.chat_models : []),
      videoModels: Array.isArray(config.videoModels) ? config.videoModels : (Array.isArray(config.video_models) ? config.video_models : []),
      rateLimitRpm: config.rateLimitRpm,
      customEndpoints: config.customEndpoints || {
        textToImage: config.image_generation_endpoint,
        inpaint: config.image_edit_endpoint,
      },
      image_generation_endpoint: config.image_generation_endpoint,
      image_edit_endpoint: config.image_edit_endpoint,
      msLoras: config.msLoras || config.ms_loras || [],
      rhApps: config.rhApps || config.rh_apps || [],
      rhWorkflows: config.rhWorkflows || config.rh_workflows || [],
      walletApiKey: config.walletApiKey || config.wallet_api_key || '',
    };
  }

  _defaultProviders() {
    const providers = [
      {
        id: 'modelscope-default',
        name: 'ModelScope',
        protocol: 'modelscope',
        baseUrl: 'https://api-inference.modelscope.cn',
        enabled: true,
        primary: false,
        imageModels: [
          'Tongyi-MAI/Z-Image-Turbo',
          'Qwen/Qwen-Image-2512',
          'Qwen/Qwen-Image-Edit-2511',
          'black-forest-labs/FLUX.2-klein-9B',
        ],
        chatModels: ['Qwen/Qwen3-235B-A22B', 'Qwen/Qwen3-VL-235B-A22B-Instruct'],
      },
      {
        id: 'custom-http-default',
        name: 'Custom HTTP API',
        protocol: 'custom',
        baseUrl: '',
        enabled: false,
        primary: false,
        imageModels: [],
        chatModels: [],
      },
    ];

    const runningHub = this._loadRunningHubPreset();
    if (runningHub) providers.push(runningHub);
    return providers.map(p => this._normalizeProvider(p));
  }

  _loadRunningHubPreset() {
    try {
      if (!fs.existsSync(this._resourceRunningHubPath)) {
        return {
          id: 'runninghub-default',
          name: 'RunningHub',
          protocol: 'runninghub',
          baseUrl: 'https://www.runninghub.cn',
          enabled: false,
          primary: false,
          imageModels: ['seedream-v5-lite/text-to-image', 'seedream-v5-lite/image-to-image'],
          rhApps: [],
          rhWorkflows: [],
        };
      }
      const raw = JSON.parse(fs.readFileSync(this._resourceRunningHubPath, 'utf-8'));
      const source = Array.isArray(raw) ? raw[0] : (Array.isArray(raw.providers) ? raw.providers[0] : raw);
      return {
        id: source.id || 'runninghub-default',
        name: source.name || 'RunningHub',
        protocol: 'runninghub',
        baseUrl: source.baseUrl || source.base_url || 'https://www.runninghub.cn',
        enabled: source.enabled === true,
        primary: false,
        imageModels: source.imageModels || source.image_models || ['seedream-v5-lite/text-to-image', 'seedream-v5-lite/image-to-image'],
        chatModels: source.chatModels || source.chat_models || [],
        videoModels: source.videoModels || source.video_models || [],
        rhApps: source.rhApps || source.rh_apps || source.apps || [],
        rhWorkflows: source.rhWorkflows || source.rh_workflows || source.workflows || [],
      };
    } catch (err) {
      console.warn('[ProviderConfigStore] Failed to load RunningHub preset:', err.message);
      return null;
    }
  }

  _mergeDefaults() {
    let changed = false;
    for (const preset of this._defaultProviders()) {
      const existing = this._providers.find(p => p.id === preset.id || (p.protocol === preset.protocol && p.name === preset.name));
      if (!existing) {
        this._providers.push(preset);
        changed = true;
      } else {
        const merged = {
          ...preset,
          ...existing,
          imageModels: existing.imageModels?.length ? existing.imageModels : preset.imageModels,
          chatModels: existing.chatModels?.length ? existing.chatModels : preset.chatModels,
          videoModels: existing.videoModels?.length ? existing.videoModels : preset.videoModels,
          rhApps: existing.rhApps?.length ? existing.rhApps : preset.rhApps,
          rhWorkflows: existing.rhWorkflows?.length ? existing.rhWorkflows : preset.rhWorkflows,
        };
        Object.assign(existing, merged);
      }
    }
    if (this._providers.length > 0 && !this._providers.some(p => p.primary)) {
      const enabled = this._providers.find(p => p.enabled);
      if (enabled) enabled.primary = true;
      changed = true;
    }
    if (changed) this._save();
  }

  getAll() { return [...this._providers]; }
  getById(id) { return this._providers.find(p => p.id === id); }
  getEnabled() { return this._providers.filter(p => p.enabled).sort((a, b) => (b.primary ? 1 : 0) - (a.primary ? 1 : 0)); }
  getPrimary() { return this._providers.find(p => p.enabled && p.primary) || this._providers.find(p => p.enabled); }

  add(config) {
    const provider = this._normalizeProvider(config);
    if (provider.primary) for (const p of this._providers) p.primary = false;
    this._providers.push(provider);
    this._save();
    return provider;
  }

  update(id, patch) {
    const idx = this._providers.findIndex(p => p.id === id);
    if (idx === -1) return null;
    if (patch.primary) for (const p of this._providers) p.primary = false;
    this._providers[idx] = this._normalizeProvider({ ...this._providers[idx], ...patch, id });
    this._save();
    return this._providers[idx];
  }

  remove(id) {
    const len = this._providers.length;
    this._providers = this._providers.filter(p => p.id !== id);
    if (this._providers.length < len) {
      this._save();
      return true;
    }
    return false;
  }

  importFromRenderer(rendererSettings) {
    const { globalBaseUrl, globalApiKey, globalApiSpec, imageModels, apiVendors } = rendererSettings || {};
    if (globalBaseUrl && !this._providers.some(p => normalizeBaseUrl(p.baseUrl) === normalizeBaseUrl(globalBaseUrl))) {
      this.add({
        id: 'liang007-default',
        name: 'liang007 Default',
        protocol: globalApiSpec === 'gemini' ? 'gemini' : 'openai',
        baseUrl: globalBaseUrl,
        apiKeys: globalApiKey ? [globalApiKey] : [],
        enabled: true,
        primary: !this._providers.some(p => p.primary),
        imageModels: Array.isArray(imageModels) ? imageModels.map(m => m.modelId || m).filter(Boolean) : [],
      });
    }

    if (Array.isArray(apiVendors)) {
      for (const vendor of apiVendors) {
        if (vendor.baseUrl && !this._providers.some(p => normalizeBaseUrl(p.baseUrl) === normalizeBaseUrl(vendor.baseUrl))) {
          this.add({
            name: vendor.name || 'Imported Vendor',
            protocol: vendor.apiSpec === 'gemini' ? 'gemini' : 'openai',
            baseUrl: vendor.baseUrl,
            apiKeys: vendor.apiKey ? [vendor.apiKey] : [],
            enabled: true,
            primary: false,
          });
        }
      }
    }
  }
}

module.exports = ProviderConfigStore;
