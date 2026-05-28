// ─────────────────────────────────────────────────────────────────────────────
//  APIMartAdapter.js — APIMart OpenAI-compatible image adapter
//
//  Ported from Infinite-Canvas online API behavior without ComfyUI workflow code.
//  APIMart accepts JSON payloads for text/image references and may return async
//  task IDs that need polling through /v1/tasks/{task_id}.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const OpenAIAdapter = require('./OpenAIAdapter');
const { successResult, failedResult } = require('./types');

class APIMartAdapter extends OpenAIAdapter {
  constructor(config) {
    super(config);
    this.protocol = 'apimart';
  }

  _buildEndpoint() {
    const custom = this.config.customEndpoints?.textToImage || this.config.image_generation_endpoint;
    if (custom) return custom.replace(/\/+$/, '');
    return super._buildEndpoint();
  }

  _buildTaskEndpoint(taskId) {
    const clean = this.baseUrl.replace(/\/+$/, '');
    const root = clean.replace(/\/v1(?:\/images\/generations)?\/?$/i, '');
    return `${root}/v1/tasks/${encodeURIComponent(taskId)}`;
  }

  async textToImage(params) {
    const taskId = this._genTaskId();
    const apiKey = this.config.apiKeys[0] || '';
    const endpoint = this._buildEndpoint();

    try {
      const body = {
        model: params.model,
        prompt: params.prompt,
        size: `${params.width}x${params.height}`,
        n: params.batchSize || 1,
        official_fallback: false,
      };
      if (params.negativePrompt) body.negative_prompt = params.negativePrompt;
      if (params.referenceImages && params.referenceImages.length > 0) {
        body.image_urls = params.referenceImages.slice(0, 4).map(buf => `data:image/png;base64,${buf.toString('base64')}`);
      }

      const resp = await this._fetchWithRetry(endpoint, {
        method: 'POST',
        headers: this._buildHeaders(apiKey),
        body: JSON.stringify(body),
      });
      const data = this._safeParseJson(resp.text);
      if (!resp.ok) return failedResult(taskId, this.providerName, params.model, this._extractError(data, resp.text), resp.status);

      const images = this._extractImages(data);
      if (images && images.length > 0) return successResult(taskId, this.providerName, params.model, images, undefined, resp.status);

      const remoteTaskId = this._extractTaskId(data);
      if (remoteTaskId) return await this._pollTask(taskId, remoteTaskId, params.model, apiKey);

      return failedResult(taskId, this.providerName, params.model, 'No images or task id in APIMart response', resp.status);
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

  _extractTaskId(data) {
    if (!data || typeof data !== 'object') return '';
    return String(
      data.task_id ||
      data.taskId ||
      data.id ||
      data.data?.task_id ||
      data.data?.taskId ||
      data.data?.id ||
      data.result?.task_id ||
      ''
    );
  }
}

module.exports = APIMartAdapter;
