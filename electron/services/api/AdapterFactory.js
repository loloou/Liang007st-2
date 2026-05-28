// ─────────────────────────────────────────────────────────────────────────────
//  AdapterFactory.js — Creates the correct adapter based on protocol
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const OpenAIAdapter = require('./OpenAIAdapter');
const APIMartAdapter = require('./APIMartAdapter');
const GeminiAdapter = require('./GeminiAdapter');
const ModelScopeAdapter = require('./ModelScopeAdapter');
const VolcengineAdapter = require('./VolcengineAdapter');
const RunningHubAdapter = require('./RunningHubAdapter');
const CustomHttpAdapter = require('./CustomHttpAdapter');

class AdapterFactory {
  /**
   * Create an adapter for the given provider config
   * @param {import('./types').ProviderConfig} config
   * @returns {import('./AbstractApiAdapter')}
   */
  static create(config) {
    switch (config.protocol) {
      case 'openai':
        return new OpenAIAdapter(config);
      case 'apimart':
        return new APIMartAdapter(config);
      case 'gemini':
        return new GeminiAdapter(config);
      case 'modelscope':
        return new ModelScopeAdapter(config);
      case 'volcengine':
        return new VolcengineAdapter(config);
      case 'runninghub':
        return new RunningHubAdapter(config);
      case 'custom':
        return new CustomHttpAdapter(config);
      default:
        throw new Error(`Unknown protocol: ${config.protocol}`);
    }
  }
}

module.exports = AdapterFactory;
