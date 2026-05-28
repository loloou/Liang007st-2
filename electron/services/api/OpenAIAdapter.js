// ─────────────────────────────────────────────────────────────────────────────
//  OpenAIAdapter.js — OpenAI-compatible API adapter
//
//  Endpoints:
//    Text-to-image:  POST {baseUrl}/v1/images/generations
//    Inpaint:        POST {baseUrl}/v1/images/edits (FormData multipart)
//    Models:         GET  {baseUrl}/v1/models
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const AbstractApiAdapter = require('./AbstractApiAdapter');
const { successResult, failedResult } = require('./types');

function normalizeSizeAxis(value) {
  const n = Math.max(64, Math.min(8192, Number(value) || 1024));
  return Math.max(64, Math.round(n / 16) * 16);
}

function toSizeString(w, h) {
  return `${normalizeSizeAxis(w)}x${normalizeSizeAxis(h)}`;
}

class OpenAIAdapter extends AbstractApiAdapter {
  constructor(config) {
    super(config);
    this.protocol = 'openai';
  }

  /**
   * Build the text-to-image endpoint URL
   * @param {string} [basePath]
   * @returns {string}
   */
  _buildEndpoint(basePath) {
    const base = basePath || this.baseUrl;
    const clean = base.replace(/\/+$/, '');
    const custom = this.config.customEndpoints?.textToImage || this.config.image_generation_endpoint;
    if (custom) return custom.replace(/\/+$/, '');
    if (/\/images\/generations\/?$/i.test(clean)) return clean;
    if (/\/generate\/?$/i.test(clean)) return clean;
    if (/\/v1\/?$/i.test(clean)) return `${clean.replace(/\/v1\/?$/, '')}/v1/images/generations`;
    return `${clean}/v1/images/generations`;
  }

  /**
   * Build the inpaint endpoint URL
   * @returns {string}
   */
  _buildInpaintEndpoint() {
    const custom = this.config.customEndpoints?.inpaint || this.config.image_edit_endpoint;
    if (custom) return custom.replace(/\/+$/, '');
    const clean = this.baseUrl.replace(/\/+$/, '');
    if (/\/images\/edits\/?$/i.test(clean)) return clean;
    if (/\/v1\/?$/i.test(clean)) return `${clean.replace(/\/v1\/?$/, '')}/v1/images/edits`;
    return `${clean}/v1/images/edits`;
  }

  async textToImage(params) {
    const taskId = this._genTaskId();
    const apiKey = this.config.apiKeys[0] || '';
    const endpoint = this._buildEndpoint();

    try {
      const body = { model: params.model, prompt: params.prompt, size: toSizeString(params.width, params.height), n: params.batchSize };
      if (params.negativePrompt) body.negative_prompt = params.negativePrompt;
      if (params.extraPayload && typeof params.extraPayload === 'object') Object.assign(body, params.extraPayload);

      // If reference images exist, use messages format
      if (params.referenceImages && params.referenceImages.length > 0) {
        const imageContents = params.referenceImages.slice(0, 4).map(buf => ({
          type: 'image_url',
          image_url: { url: `data:image/png;base64,${buf.toString('base64')}` },
        }));
        body.messages = [
          { role: 'user', content: [...imageContents, { type: 'text', text: params.prompt }] },
        ];
        delete body.prompt; // messages format doesn't use prompt field
      }

      const headers = this._buildHeaders(apiKey);
      const resp = await this._fetchWithRetry(endpoint, { method: 'POST', headers, body: JSON.stringify(body) });

      if (!resp.ok) {
        const parsed = this._safeParseJson(resp.text);
        const errMsg = this._extractError(parsed, resp.text || `HTTP ${resp.status}`);

        // Auto-downgrade size on 400/422
        if ((resp.status === 400 || resp.status === 422) && (params.width > 1536 || params.height > 1536)) {
          const lower = errMsg.toLowerCase();
          if (lower.includes('size') || lower.includes('dimension') || lower.includes('resolution') || lower.includes('width') || lower.includes('height')) {
            const scale = Math.min(1536 / params.width, 1536 / params.height, 1);
            const retryParams = { ...params, width: Math.round(params.width * scale), height: Math.round(params.height * scale) };
            return this.textToImage(retryParams);
          }
        }
        return failedResult(taskId, this.providerName, params.model, errMsg, resp.status);
      }

      const data = this._safeParseJson(resp.text);
      if (!data) return failedResult(taskId, this.providerName, params.model, 'Response is not valid JSON', resp.status);

      const images = this._extractImages(data);
      if (images && images.length > 0) {
        return successResult(taskId, this.providerName, params.model, images, undefined, resp.status);
      }

      const remoteTaskId = this._extractTaskId(data);
      if (remoteTaskId) return await this._pollTask(taskId, remoteTaskId, params.model, apiKey);

      return failedResult(taskId, this.providerName, params.model, 'No images in response', resp.status);
    } catch (err) {
      return failedResult(taskId, this.providerName, params.model, err.message || String(err));
    }
  }

  async imageToImage(params) {
    // OpenAI uses the same endpoint with messages format for img2img
    return this.textToImage({
      ...params,
      referenceImages: [params.sourceImage, ...(params.referenceImages || [])],
    });
  }

  async inpaint(params) {
    const taskId = this._genTaskId();
    const apiKey = this.config.apiKeys[0] || '';
    const endpoint = this._buildInpaintEndpoint();

    try {
      // Build FormData - Node.js native FormData (available in Node 18+)
      const form = new FormData();
      form.append('model', params.model);
      form.append('prompt', params.prompt);
      form.append('image', new Blob([params.sourceImage], { type: 'image/png' }), 'image.png');
      form.append('mask', new Blob([params.mask], { type: 'image/png' }), 'mask.png');
      form.append('size', toSizeString(params.width, params.height));
      form.append('n', String(params.batchSize || 1));
      if (params.strength !== undefined) form.append('strength', String(params.strength));

      const headers = { 'Accept': 'application/json' };
      if (apiKey.trim()) headers['Authorization'] = `Bearer ${apiKey.trim()}`;

      const resp = await this._fetchWithRetry(endpoint, { method: 'POST', headers, body: form });
      if (!resp.ok) {
        const parsed = this._safeParseJson(resp.text);
        return failedResult(taskId, this.providerName, params.model, this._extractError(parsed, resp.text), resp.status);
      }

      const data = this._safeParseJson(resp.text);
      const images = this._extractImages(data);
      if (!images || images.length === 0) {
        return failedResult(taskId, this.providerName, params.model, 'No images in inpaint response', resp.status);
      }
      return successResult(taskId, this.providerName, params.model, images, undefined, resp.status);
    } catch (err) {
      return failedResult(taskId, this.providerName, params.model, err.message || String(err));
    }
  }

  async testConnection() {
    const apiKey = this.config.apiKeys[0] || '';
    const endpoint = this._buildEndpoint();
    const headers = this._buildHeaders(apiKey);
    const body = JSON.stringify({ prompt: '__api_connectivity_test__', size: '1024x1024', n: 1 });

    try {
      const resp = await this._fetchWithRetry(endpoint, { method: 'POST', headers, body }, 15000, 0);
      const parsed = this._safeParseJson(resp.text);

      if (!resp.ok) {
        return { ok: false, message: `HTTP ${resp.status}: ${this._extractError(parsed, resp.text)}` };
      }
      return { ok: true, message: `Connection OK (${endpoint})` };
    } catch (err) {
      return { ok: false, message: err.message || String(err) };
    }
  }

  async getModels() {
    const apiKey = this.config.apiKeys[0] || '';
    const root = this.baseUrl.replace(/\/v1(?:\/images\/(?:generations|edits))?\/?$/i, '');
    const modelsUrl = `${root}/v1/models`;
    const headers = this._buildHeaders(apiKey);

    try {
      const resp = await this._fetchWithRetry(modelsUrl, { method: 'GET', headers }, 15000, 0);
      if (!resp.ok) return [];
      const data = this._safeParseJson(resp.text);
      if (!data || !Array.isArray(data.data)) return [];
      return data.data.map(m => ({ id: m.id, name: m.id }));
    } catch {
      return [];
    }
  }

  supportsInpaint() {
    return true;
  }

  async _pollTask(taskId, remoteTaskId, model, apiKey) {
    const endpoint = this._buildTaskEndpoint(remoteTaskId);
    for (let i = 0; i < 120; i += 1) {
      await this._sleep(i < 3 ? 1500 : 3000);
      const resp = await this._fetchWithRetry(endpoint, { method: 'GET', headers: this._buildHeaders(apiKey) }, 30000, 1);
      const data = this._safeParseJson(resp.text);
      if (!resp.ok) return failedResult(taskId, this.providerName, model, this._extractError(data, resp.text), resp.status);
      const images = this._extractImages(data);
      if (images && images.length > 0) return successResult(taskId, this.providerName, model, images, undefined, resp.status);
      const status = String(data?.status || data?.data?.status || data?.task_status || '').toLowerCase();
      if (/fail|error|cancel/.test(status)) return failedResult(taskId, this.providerName, model, this._extractError(data, `Remote task ${remoteTaskId} failed`));
    }
    return failedResult(taskId, this.providerName, model, `Remote task ${remoteTaskId} timed out`);
  }

  _buildTaskEndpoint(taskId) {
    const root = this.baseUrl.replace(/\/v1(?:\/images\/generations)?\/?$/i, '');
    return `${root}/v1/tasks/${encodeURIComponent(taskId)}`;
  }

  _extractTaskId(data) {
    if (!data || typeof data !== 'object') return '';
    return String(
      data.task_id || data.taskId || data.id || data.data?.task_id || data.data?.taskId || data.data?.id || ''
    );
  }

  /**
   * Extract images from OpenAI-format response
   * @param {unknown} data
   * @returns {import('./types').GeneratedImageResult[] | null}
   */
  _extractImages(data) {
    if (!data || typeof data !== 'object') return null;
    const obj = /** @type {Record<string, unknown>} */ (data);

    // { data: [{ url | b64_json }] }
    if (Array.isArray(obj.data) && obj.data.length > 0) {
      const first = obj.data[0];
      if (typeof first.url === 'string' || typeof first.b64_json === 'string') {
        return obj.data.map((item, idx) => {
          let imgData = '';
          let format = 'cloudUrl';
          if (item.b64_json) {
            imgData = item.b64_json;
            format = 'base64';
          } else if (item.url) {
            imgData = item.url;
            format = item.url.startsWith('data:') ? 'base64' : 'cloudUrl';
          }
          return { id: String(idx), format, data: imgData };
        });
      }
    }

    // { images: string[] | object[] }
    if (Array.isArray(obj.images) && obj.images.length > 0) {
      if (typeof obj.images[0] === 'string') {
        return obj.images.map((url, idx) => ({ id: String(idx), format: 'cloudUrl', data: url }));
      }
      return obj.images.map((img, idx) => ({
        id: img.id || String(idx),
        format: img.b64_json ? 'base64' : 'cloudUrl',
        data: img.b64_json || img.url || '',
      }));
    }

    // Direct array
    if (Array.isArray(data) && data.length > 0) {
      if (typeof data[0] === 'string') {
        return data.map((url, idx) => ({ id: String(idx), format: 'cloudUrl', data: url }));
      }
      if (typeof data[0].url === 'string') {
        return data.map((img, idx) => ({ id: img.id || String(idx), format: 'cloudUrl', data: img.url }));
      }
    }
    return null;
  }
}

module.exports = OpenAIAdapter;
