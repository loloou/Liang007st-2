// ─────────────────────────────────────────────────────────────────────────────
//  GeminiAdapter.js — Google Gemini API adapter
//
//  Endpoint:
//    POST {baseUrl}/v1beta/models/{modelId}:generateContent
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const AbstractApiAdapter = require('./AbstractApiAdapter');
const { successResult, failedResult } = require('./types');

const GEMINI_DEFAULT_MODEL = 'gemini-2.0-flash-preview-image-generation';
const GEMINI_BATCH_CONCURRENCY = 2;

const GEMINI_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4', '21:9', '3:2', '2:3', '5:4', '4:5'];

function toAspectRatio(width, height, presetId) {
  if (presetId && presetId !== 'original' && GEMINI_RATIOS.includes(presetId)) return presetId;
  const ratio = width / height;
  if (ratio > 2.0) return '21:9';
  if (ratio > 1.63) return '16:9';
  if (ratio > 1.41) return '3:2';
  if (ratio > 1.29) return '4:3';
  if (ratio > 1.12) return '5:4';
  if (ratio >= 0.89) return '1:1';
  if (ratio > 0.77) return '4:5';
  if (ratio > 0.71) return '3:4';
  if (ratio > 0.61) return '2:3';
  return '9:16';
}

function toImageSize(sizeTier, width, height) {
  if (sizeTier && { '1K': '1K', '2K': '2K', '4K': '4K' }[sizeTier]) return sizeTier;
  const maxSide = Math.max(width, height);
  if (maxSide >= 3000) return '4K';
  if (maxSide >= 1500) return '2K';
  return '1K';
}

class GeminiAdapter extends AbstractApiAdapter {
  constructor(config) {
    super(config);
    this.protocol = 'gemini';
  }

  _buildEndpoint(modelId) {
    const clean = this.baseUrl.replace(/\/+$/, '');
    if (/generateContent\/?$/i.test(clean)) return clean;
    const resolved = (modelId || '').trim() || GEMINI_DEFAULT_MODEL;
    const base = clean.replace(/\/v1beta\/?$/, '');
    return `${base}/v1beta/models/${resolved}:generateContent`;
  }

  async textToImage(params) {
    const taskId = this._genTaskId();
    const apiKey = this.config.apiKeys[0] || '';

    try {
      // Gemini returns 1 image per call, need concurrent calls for batchSize > 1
      if (params.batchSize > 1) {
        return this._batchGenerate(params, taskId);
      }

      const endpoint = this._buildEndpoint(params.model);
      const body = this._buildGeminiBody(params);
      const headers = this._buildHeaders(apiKey);
      const resp = await this._fetchWithRetry(endpoint, { method: 'POST', headers, body: JSON.stringify(body) });

      if (!resp.ok) {
        const parsed = this._safeParseJson(resp.text);
        return failedResult(taskId, this.providerName, params.model, this._extractError(parsed, resp.text), resp.status);
      }

      const data = this._safeParseJson(resp.text);
      if (!data) return failedResult(taskId, this.providerName, params.model, 'Invalid JSON response', resp.status);

      // Check for Gemini-specific errors in text parts
      const errorText = this._extractGeminiError(data);
      if (errorText) {
        const lower = errorText.toLowerCase();
        if (lower.includes('cannot read') || lower.includes('does not support image') ||
            lower.includes('unable to read') || lower.includes("can't read")) {
          return failedResult(taskId, this.providerName, params.model, 'Model does not support image input', resp.status);
        }
      }

      const images = this._extractGeminiImages(data);
      if (!images || images.length === 0) {
        return failedResult(taskId, this.providerName, params.model, 'No images in Gemini response', resp.status);
      }
      return successResult(taskId, this.providerName, params.model, images, undefined, resp.status);
    } catch (err) {
      return failedResult(taskId, this.providerName, params.model, err.message || String(err));
    }
  }

  async imageToImage(params) {
    // Gemini uses inline image data in the same generateContent endpoint
    return this.textToImage({
      ...params,
      referenceImages: [params.sourceImage, ...(params.referenceImages || [])],
    });
  }

  async inpaint(params) {
    // Gemini doesn't have a native inpaint endpoint
    // Attempt via generateContent with image + mask as reference
    return this.textToImage({
      ...params,
      referenceImages: [params.sourceImage, params.mask, ...(params.referenceImages || [])],
    });
  }

  async testConnection() {
    const apiKey = this.config.apiKeys[0] || '';
    const endpoint = this._buildEndpoint(this.config.imageModels[0] || '');
    const headers = this._buildHeaders(apiKey);
    const body = JSON.stringify({
      contents: [{ parts: [{ text: '__api_connectivity_test__' }] }],
      generationConfig: { imageConfig: { aspectRatio: '1:1' } },
    });

    try {
      const resp = await this._fetchWithRetry(endpoint, { method: 'POST', headers, body }, 15000, 0);
      const parsed = this._safeParseJson(resp.text);
      if (!resp.ok) {
        return { ok: false, message: `HTTP ${resp.status}: ${this._extractError(parsed, resp.text)}` };
      }
      return { ok: true, message: `Gemini connection OK (${endpoint})` };
    } catch (err) {
      return { ok: false, message: err.message || String(err) };
    }
  }

  supportsInpaint() {
    return false; // Gemini doesn't natively support mask-based inpaint
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  _buildGeminiBody(params) {
    const textParts = [{ text: params.prompt }];
    if (params.negativePrompt) {
      textParts.push({ text: `Negative prompt: ${params.negativePrompt}` });
    }

    const imageParts = [];
    if (params.referenceImages && params.referenceImages.length > 0) {
      for (const buf of params.referenceImages.slice(0, 4)) {
        if (Buffer.isBuffer(buf)) {
          imageParts.push({ inlineData: { mimeType: 'image/png', data: buf.toString('base64') } });
        }
      }
    }

    const aspectRatio = toAspectRatio(params.width, params.height, params.resolutionPreset);
    const imageSize = toImageSize(params.sizeTier, params.width, params.height);

    const hasImages = imageParts.length > 0;
    const hasText = params.prompt.trim().length > 0;
    const responseModalities = hasImages && !hasText ? ['IMAGE'] : ['TEXT', 'IMAGE'];

    return {
      contents: [{ parts: [...textParts, ...imageParts] }],
      generationConfig: {
        responseModalities,
        imageConfig: { aspectRatio, imageSize },
      },
    };
  }

  async _batchGenerate(params, taskId) {
    const count = params.batchSize;
    const limit = GEMINI_BATCH_CONCURRENCY;
    const results = new Array(count);
    let nextIndex = 0;

    async function runWorker(adapter) {
      while (nextIndex < count) {
        const idx = nextIndex++;
        try {
          const r = await adapter.textToImage({ ...params, batchSize: 1 });
          r.images = r.images.map(img => ({ ...img, id: `${idx}-${img.id}` }));
          results[idx] = { status: 'fulfilled', value: r };
        } catch (reason) {
          results[idx] = { status: 'rejected', reason };
        }
      }
    }

    await Promise.all(Array.from({ length: Math.min(limit, count) }, () => runWorker(this)));

    const allImages = [];
    let lastResult = null;
    let failedCount = 0;

    for (const r of results) {
      if (r.status === 'fulfilled' && !r.value.error) {
        allImages.push(...r.value.images);
        lastResult = r.value;
      } else {
        failedCount++;
        if (!lastResult && r.status === 'fulfilled') lastResult = r.value;
      }
    }

    if (allImages.length === 0) {
      const errMsg = lastResult?.error || `All ${count} calls failed`;
      return failedResult(taskId, this.providerName, params.model, errMsg);
    }

    return successResult(taskId, this.providerName, params.model, allImages);
  }

  _extractGeminiImages(data) {
    if (!data || typeof data !== 'object') return null;
    const candidates = data.candidates;
    if (!Array.isArray(candidates) || candidates.length === 0) return null;

    const images = [];
    let idx = 0;

    for (const candidate of candidates) {
      if (!candidate?.content?.parts) continue;
      for (const part of candidate.content.parts) {
        if (part?.inlineData?.data && part.inlineData.data.length > 100) {
          const mime = part.inlineData.mimeType || 'image/png';
          images.push({
            id: String(idx++),
            format: 'base64',
            data: `data:${mime};base64,${part.inlineData.data}`,
          });
        }
      }
    }
    return images.length > 0 ? images : null;
  }

  _extractGeminiError(data) {
    if (!data || typeof data !== 'object') return null;
    const texts = [];

    if (data.promptFeedback) {
      if (data.promptFeedback.blockReasonMessage) texts.push(data.promptFeedback.blockReasonMessage);
      if (data.promptFeedback.blockReason) texts.push(`blockReason: ${data.promptFeedback.blockReason}`);
    }
    if (data.error?.message) texts.push(data.error.message);

    if (Array.isArray(data.candidates)) {
      for (const c of data.candidates) {
        if (!c?.content?.parts) continue;
        for (const p of c.content.parts) {
          if (p?.text) texts.push(p.text);
        }
      }
    }

    if (texts.length === 0) return null;
    const joined = texts.join('\n');
    const lower = joined.toLowerCase();
    const isError = ['cannot read', 'does not support', 'not support', 'unable to', 'error', "can't read", 'blockreason']
      .some(k => lower.includes(k));
    return isError ? joined : null;
  }
}

module.exports = GeminiAdapter;
