// ─────────────────────────────────────────────────────────────────────────────
//  RunningHubAdapter.js — RunningHub image API adapter
//
//  Keeps Infinite-Canvas RunningHub online API support while excluding all
//  ComfyUI workflow execution paths.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const { successResult, failedResult } = require('./types');
const AbstractApiAdapter = require('./AbstractApiAdapter');

class RunningHubAdapter extends AbstractApiAdapter {
  constructor(config) {
    super(config);
    this.protocol = 'runninghub';
  }

  _headers(apiKey) {
    const headers = this._buildHeaders(apiKey);
    headers['Content-Type'] = 'application/json';
    return headers;
  }

  _endpoint(model) {
    const custom = this.config.customEndpoints?.textToImage || this.config.image_generation_endpoint;
    if (custom) return custom.replace(/\/+$/, '');
    const clean = this.baseUrl.replace(/\/+$/, '') || 'https://www.runninghub.cn';
    if (/\/openapi\/v2\//i.test(clean)) return clean;
    return `${clean}/openapi/v2/${String(model || '').replace(/^\/+/, '')}`;
  }

  async textToImage(params) {
    const taskId = this._genTaskId();
    const apiKey = this.config.apiKeys[0] || this.config.walletApiKey || '';
    const endpoint = this._endpoint(params.model);

    try {
      const body = {
        prompt: params.prompt,
        negative_prompt: params.negativePrompt || undefined,
        width: params.width,
        height: params.height,
        batch_size: params.batchSize || 1,
      };
      if (params.referenceImages && params.referenceImages.length > 0) {
        body.image_urls = params.referenceImages.slice(0, 4).map(buf => `data:image/png;base64,${buf.toString('base64')}`);
      }
      if (params.runninghub) Object.assign(body, params.runninghub);

      const resp = await this._fetchWithRetry(endpoint, {
        method: 'POST',
        headers: this._headers(apiKey),
        body: JSON.stringify(body),
      });
      const data = this._safeParseJson(resp.text);
      if (!resp.ok) return failedResult(taskId, this.providerName, params.model, this._extractError(data, resp.text), resp.status);

      const images = this._extractImages(data);
      if (images.length > 0) return successResult(taskId, this.providerName, params.model, images, undefined, resp.status);

      const remoteTaskId = this._extractTaskId(data);
      if (remoteTaskId) return await this._pollOutputs(taskId, remoteTaskId, params.model, apiKey);

      return failedResult(taskId, this.providerName, params.model, 'No images or task id in RunningHub response', resp.status);
    } catch (err) {
      return failedResult(taskId, this.providerName, params.model, err.message || String(err));
    }
  }

  async imageToImage(params) {
    return this.textToImage({
      ...params,
      referenceImages: [params.sourceImage, ...(params.referenceImages || [])].filter(Boolean),
    });
  }

  async inpaint(params) {
    return this.textToImage({
      ...params,
      referenceImages: [params.sourceImage, params.mask, ...(params.referenceImages || [])].filter(Boolean),
    });
  }

  async testConnection() {
    if (!this.baseUrl) return { ok: false, message: 'RunningHub baseUrl is empty' };
    return { ok: true, message: `RunningHub adapter configured (${this.baseUrl})` };
  }

  async getModels() {
    return (this.config.imageModels || []).map(id => ({ id, name: id }));
  }

  _extractTaskId(data) {
    if (!data || typeof data !== 'object') return '';
    return String(
      data.taskId || data.task_id || data.id || data.data?.taskId || data.data?.task_id || data.data?.id || ''
    );
  }

  _extractImages(data) {
    const images = [];
    const visit = value => {
      if (!value) return;
      if (typeof value === 'string') {
        if (/^https?:\/\/.+\.(png|jpe?g|webp|gif)(\?|$)/i.test(value) || value.startsWith('data:image/')) {
          images.push({ id: String(images.length), format: value.startsWith('data:') ? 'base64' : 'cloudUrl', data: value });
        }
        return;
      }
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      if (typeof value === 'object') {
        for (const key of ['url', 'image', 'imageUrl', 'fileUrl', 'output', 'data']) visit(value[key]);
        for (const v of Object.values(value)) {
          if (images.length >= 16) break;
          if (typeof v === 'object') visit(v);
        }
      }
    };
    visit(data);
    return images;
  }

  async _pollOutputs(taskId, remoteTaskId, model, apiKey) {
    const clean = this.baseUrl.replace(/\/+$/, '') || 'https://www.runninghub.cn';
    const endpoint = `${clean}/openapi/v2/query`;
    for (let i = 0; i < 120; i += 1) {
      await this._sleep(i < 3 ? 1500 : 3000);
      const resp = await this._fetchWithRetry(endpoint, {
        method: 'POST',
        headers: this._headers(apiKey),
        body: JSON.stringify({ taskId: remoteTaskId, task_id: remoteTaskId }),
      }, 30000, 1);
      const data = this._safeParseJson(resp.text);
      if (!resp.ok) return failedResult(taskId, this.providerName, model, this._extractError(data, resp.text), resp.status);
      const images = this._extractImages(data);
      if (images.length > 0) return successResult(taskId, this.providerName, model, images, undefined, resp.status);
      const status = String(data?.status || data?.data?.status || '').toLowerCase();
      if (/fail|error|cancel/.test(status)) return failedResult(taskId, this.providerName, model, this._extractError(data, `Remote task ${remoteTaskId} failed`));
    }
    return failedResult(taskId, this.providerName, model, `Remote task ${remoteTaskId} timed out`);
  }
}

module.exports = RunningHubAdapter;
