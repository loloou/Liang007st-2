// ─────────────────────────────────────────────────────────────────────────────
//  ModelScopeAdapter.js — ModelScope API adapter
//
//  Keeps Infinite-Canvas ModelScope online API behavior (async task polling,
//  LoRA/custom payload support) inside liang007's standard adapter layer.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const OpenAIAdapter = require('./OpenAIAdapter');

class ModelScopeAdapter extends OpenAIAdapter {
  constructor(config) {
    super(config);
    this.protocol = 'modelscope';
  }

  _buildEndpoint() {
    const custom = this.config.customEndpoints?.textToImage || this.config.image_generation_endpoint;
    if (custom) return custom.replace(/\/+$/, '');
    return super._buildEndpoint();
  }

  _buildTaskEndpoint(taskId) {
    const root = this.baseUrl.replace(/\/v1(?:\/images\/generations)?\/?$/i, '');
    return `${root}/v1/tasks/${encodeURIComponent(taskId)}`;
  }

  async textToImage(params) {
    const merged = { ...params };
    if (Array.isArray(this.config.msLoras) && this.config.msLoras.length > 0) {
      merged.extraPayload = {
        ...(merged.extraPayload || {}),
        loras: this.config.msLoras,
      };
    }
    return super.textToImage(merged);
  }

  _buildHeaders(apiKey) {
    const headers = super._buildHeaders(apiKey);
    headers['X-ModelScope-Async-Mode'] = 'true';
    headers['X-ModelScope-Task-Type'] = 'image_generation';
    return headers;
  }
}

module.exports = ModelScopeAdapter;
