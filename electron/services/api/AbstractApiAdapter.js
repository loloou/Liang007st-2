// ─────────────────────────────────────────────────────────────────────────────
//  AbstractApiAdapter.js — Base class for all API adapters
//
//  Each adapter implements:
//   - textToImage(params) -> GenerationResult
//   - imageToImage(params) -> GenerationResult
//   - inpaint(params)     -> GenerationResult
//   - testConnection()    -> TestResult
//   - getModels()         -> ModelInfo[]
//   - supportsInpaint()   -> boolean
//   - dispose()
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const { genTaskId } = require('./types');

class AbstractApiAdapter {
  /**
   * @param {import('./types').ProviderConfig} config
   */
  constructor(config) {
    if (new.target === AbstractApiAdapter) {
      throw new Error('AbstractApiAdapter is abstract and cannot be instantiated directly.');
    }
    /** @type {import('./types').ProviderConfig} */
    this.config = config;
    /** @type {string} */
    this.protocol = config.protocol;
    /** @type {string} */
    this.providerId = config.id;
    /** @type {string} */
    this.providerName = config.name;
    /** @type {boolean} */
    this._disposed = false;
  }

  /** @returns {string} */
  get baseUrl() {
    return (this.config.baseUrl || '').replace(/\/+$/, '');
  }

  /**
   * Text-to-image generation
   * @param {import('./types').TextToImageParams} _params
   * @returns {Promise<import('./types').GenerationResult>}
   */
  async textToImage(_params) {
    throw new Error('textToImage() must be implemented by subclass');
  }

  /**
   * Image-to-image generation
   * @param {import('./types').ImageToImageParams} _params
   * @returns {Promise<import('./types').GenerationResult>}
   */
  async imageToImage(_params) {
    throw new Error('imageToImage() must be implemented by subclass');
  }

  /**
   * Inpaint generation
   * @param {import('./types').InpaintParams} _params
   * @returns {Promise<import('./types').GenerationResult>}
   */
  async inpaint(_params) {
    throw new Error('inpaint() must be implemented by subclass');
  }

  /**
   * Test API connection
   * @returns {Promise<import('./types').TestResult>}
   */
  async testConnection() {
    throw new Error('testConnection() must be implemented by subclass');
  }

  /**
   * List available models
   * @returns {Promise<import('./types').ModelInfo[]>}
   */
  async getModels() {
    return [];
  }

  /**
   * Whether this adapter supports inpainting
   * @returns {boolean}
   */
  supportsInpaint() {
    return false;
  }

  /**
   * Clean up resources
   */
  dispose() {
    this._disposed = true;
  }

  // ── Shared utilities for subclasses ───────────────────────────────────────

  /**
   * Build Authorization header
   * @param {string} apiKey
   * @returns {Record<string, string>}
   */
  _buildHeaders(apiKey) {
    const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
    if (apiKey && apiKey.trim()) {
      headers['Authorization'] = `Bearer ${apiKey.trim()}`;
    }
    return headers;
  }

  /**
   * Execute an HTTP request with timeout and retry
   * @param {string} url
   * @param {object} options - fetch options
   * @param {number} [timeoutMs=600000]
   * @param {number} [maxRetries=2]
   * @returns {Promise<{ ok: boolean, status: number, text: string, headers: Record<string, string> }>}
   */
  async _fetchWithRetry(url, options, timeoutMs = 600000, maxRetries = 2) {
    const TRANSIENT = new Set([408, 429, 500, 502, 503, 504]);
    let lastError = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (this._disposed) throw new Error('Adapter disposed');

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const resp = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(timer);
        const text = await resp.text();
        const respHeaders = {};
        resp.headers.forEach((v, k) => { respHeaders[k] = v; });

        if (!TRANSIENT.has(resp.status) || attempt >= maxRetries) {
          return { ok: resp.ok, status: resp.status, text, headers: respHeaders };
        }
        // Transient error, retry after delay
        await this._sleep(1500 * Math.pow(2, attempt) + Math.floor(Math.random() * 500));
      } catch (err) {
        clearTimeout(timer);
        lastError = err;
        if (attempt < maxRetries) {
          await this._sleep(1500 * Math.pow(2, attempt) + Math.floor(Math.random() * 500));
          continue;
        }
        throw err;
      }
    }

    throw lastError || new Error('Request failed after retries');
  }

  /**
   * Safe JSON parse
   * @param {string} text
   * @returns {unknown | null}
   */
  _safeParseJson(text) {
    try { return JSON.parse(text); } catch { return null; }
  }

  /**
   * @param {number} ms
   * @returns {Promise<void>}
   */
  _sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  /**
   * Extract error message from parsed JSON
   * @param {unknown} parsed
   * @param {string} fallback
   * @returns {string}
   */
  _extractError(parsed, fallback) {
    if (!parsed || typeof parsed !== 'object') return fallback;
    const obj = /** @type {Record<string, unknown>} */ (parsed);
    for (const key of ['message', 'error', 'detail', 'msg', 'reason', 'description']) {
      if (obj[key] !== undefined) {
        if (typeof obj[key] === 'string') return obj[key];
        if (typeof obj[key] === 'object' && obj[key] !== null) {
          const nested = /** @type {Record<string, unknown>} */ (obj[key]);
          if (typeof nested.message === 'string') return nested.message;
          return JSON.stringify(obj[key]);
        }
      }
    }
    return fallback || JSON.stringify(parsed).slice(0, 500);
  }

  /**
   * Generate a new task ID
   * @returns {string}
   */
  _genTaskId() {
    return genTaskId();
  }
}

module.exports = AbstractApiAdapter;
