// ─────────────────────────────────────────────────────────────────────────────
//  types.js — 统一 API 类型定义（CJS）
//
//  所有 adapter、task queue、IPC handler 共享的请求/响应/错误类型
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

/**
 * @typedef {'openai' | 'apimart' | 'gemini' | 'modelscope' | 'volcengine' | 'runninghub' | 'custom'} AdapterProtocol
 */

/**
 * @typedef {Object} ProviderConfig
 * @property {string} id
 * @property {string} name
 * @property {AdapterProtocol} protocol
 * @property {string} baseUrl
 * @property {string[]} apiKeys - multiple keys for rotation
 * @property {boolean} enabled
 * @property {boolean} primary
 * @property {string[]} imageModels
 * @property {string[]} chatModels
 * @property {number} [rateLimitRpm]
 * @property {{ textToImage?: string, imageToImage?: string, inpaint?: string }} [customEndpoints]
 * @property {string} [image_generation_endpoint]
 * @property {string} [image_edit_endpoint]
 * @property {string[]} [videoModels]
 * @property {object[]} [msLoras]
 * @property {object[]} [rhApps]
 * @property {object[]} [rhWorkflows]
 * @property {string} [walletApiKey]
 */

/**
 * @typedef {Object} TextToImageParams
 * @property {string} prompt
 * @property {string} [negativePrompt]
 * @property {string} model
 * @property {number} width
 * @property {number} height
 * @property {number} batchSize
 * @property {Buffer[]} [referenceImages] - for img2img within text-to-image flow
 * @property {string} [resolutionPreset]
 * @property {string} [sizeTier]
 */

/**
 * @typedef {Object} ImageToImageParams
 * @property {string} prompt
 * @property {string} [negativePrompt]
 * @property {string} model
 * @property {number} width
 * @property {number} height
 * @property {number} batchSize
 * @property {Buffer} sourceImage
 * @property {number} [strength]
 * @property {Buffer[]} [referenceImages]
 */

/**
 * @typedef {Object} InpaintParams
 * @property {string} prompt
 * @property {string} [negativePrompt]
 * @property {string} model
 * @property {number} width
 * @property {number} height
 * @property {number} batchSize
 * @property {Buffer} sourceImage
 * @property {Buffer} mask
 * @property {number} [strength]
 */

/**
 * @typedef {Object} GeneratedImageResult
 * @property {string} id
 * @property {'base64' | 'localPath' | 'cloudUrl'} format
 * @property {string} data - base64 string, local file path, or cloud URL
 * @property {number} [width]
 * @property {number} [height]
 */

/**
 * @typedef {Object} GenerationResult
 * @property {string} taskId
 * @property {'pending' | 'running' | 'completed' | 'failed' | 'cancelled'} status
 * @property {GeneratedImageResult[]} images
 * @property {string} [error]
 * @property {number} [progress] - 0-100
 * @property {{ model: string, provider: string, duration?: number, httpStatus?: number }} metadata
 */

/**
 * @typedef {Object} TestResult
 * @property {boolean} ok
 * @property {string} message
 * @property {string} [detail]
 */

/**
 * @typedef {Object} ModelInfo
 * @property {string} id
 * @property {string} name
 * @property {boolean} [supportsInpaint]
 */

// ── Error codes ─────────────────────────────────────────────────────────────

const ApiErrorCode = Object.freeze({
  AUTH_FAILED: 'AUTH_FAILED',
  RATE_LIMITED: 'RATE_LIMITED',
  MODEL_NOT_FOUND: 'MODEL_NOT_FOUND',
  INVALID_PARAMS: 'INVALID_PARAMS',
  TIMEOUT: 'TIMEOUT',
  NETWORK_ERROR: 'NETWORK_ERROR',
  PROVIDER_ERROR: 'PROVIDER_ERROR',
  CONTENT_FILTERED: 'CONTENT_FILTERED',
  CANCELLED: 'CANCELLED',
});

// ── Task status ─────────────────────────────────────────────────────────────

const TaskStatus = Object.freeze({
  QUEUED: 'queued',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
});

// ── Helper builders ─────────────────────────────────────────────────────────

/**
 * Build a failed GenerationResult
 * @param {string} taskId
 * @param {string} provider
 * @param {string} model
 * @param {string} error
 * @param {number} [httpStatus]
 * @returns {GenerationResult}
 */
function failedResult(taskId, provider, model, error, httpStatus) {
  return {
    taskId,
    status: 'failed',
    images: [],
    error,
    metadata: { model, provider, httpStatus },
  };
}

/**
 * Build a successful GenerationResult
 * @param {string} taskId
 * @param {string} provider
 * @param {string} model
 * @param {GeneratedImageResult[]} images
 * @param {number} [duration]
 * @param {number} [httpStatus]
 * @returns {GenerationResult}
 */
function successResult(taskId, provider, model, images, duration, httpStatus) {
  return {
    taskId,
    status: 'completed',
    images,
    progress: 100,
    metadata: { model, provider, duration, httpStatus },
  };
}

/**
 * Generate a unique task ID
 * @returns {string}
 */
function genTaskId() {
  return `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Generate a unique ID
 * @returns {string}
 */
function genId() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

module.exports = {
  ApiErrorCode,
  TaskStatus,
  failedResult,
  successResult,
  genTaskId,
  genId,
};
