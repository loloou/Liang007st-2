// ─────────────────────────────────────────────────────────────────────────────
//  VolcengineAdapter.js — Volcengine image generation adapter
//
//  Implements Infinite-Canvas non-Comfy Volcengine API behavior in the existing
//  liang007 adapter architecture.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const OpenAIAdapter = require('./OpenAIAdapter');

class VolcengineAdapter extends OpenAIAdapter {
  constructor(config) {
    super(config);
    this.protocol = 'volcengine';
  }

  _buildEndpoint() {
    const custom = this.config.customEndpoints?.textToImage || this.config.image_generation_endpoint;
    if (custom) return custom.replace(/\/+$/, '');
    const clean = this.baseUrl.replace(/\/+$/, '');
    if (/\/api\/v3\/images\/generations\/?$/i.test(clean)) return clean;
    if (/\/api\/v3\/?$/i.test(clean)) return `${clean}/images/generations`;
    return `${clean}/api/v3/images/generations`;
  }

  _buildInpaintEndpoint() {
    const custom = this.config.customEndpoints?.inpaint || this.config.image_edit_endpoint;
    if (custom) return custom.replace(/\/+$/, '');
    return this._buildEndpoint();
  }

  async getModels() {
    const apiKey = this.config.apiKeys[0] || '';
    const clean = this.baseUrl.replace(/\/+$/, '');
    const root = clean.replace(/\/api\/v3(?:\/images\/generations)?\/?$/i, '');
    const modelsUrl = `${root}/api/v3/models`;
    try {
      const resp = await this._fetchWithRetry(modelsUrl, { method: 'GET', headers: this._buildHeaders(apiKey) }, 15000, 0);
      if (!resp.ok) return [];
      const data = this._safeParseJson(resp.text);
      const list = Array.isArray(data?.data) ? data.data : Array.isArray(data?.models) ? data.models : [];
      return list.map(m => ({ id: m.id || m.model || String(m), name: m.name || m.id || m.model || String(m) }));
    } catch {
      return [];
    }
  }
}

module.exports = VolcengineAdapter;
