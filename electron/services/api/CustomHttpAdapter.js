// ─────────────────────────────────────────────────────────────────────────────
//  CustomHttpAdapter.js — Custom HTTP API adapter
//
//  For arbitrary HTTP endpoints that don't conform to OpenAI/Gemini specs.
//  Endpoint paths configured via customEndpoints in ProviderConfig.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const OpenAIAdapter = require('./OpenAIAdapter');

class CustomHttpAdapter extends OpenAIAdapter {
  constructor(config) {
    super(config);
    this.protocol = 'custom';
  }

  _buildEndpoint() {
    const custom = this.config.customEndpoints?.textToImage;
    if (custom) return custom.replace(/\/+$/, '');
    return super._buildEndpoint();
  }

  _buildInpaintEndpoint() {
    const custom = this.config.customEndpoints?.inpaint;
    if (custom) return custom.replace(/\/+$/, '');
    return super._buildInpaintEndpoint();
  }
}

module.exports = CustomHttpAdapter;
