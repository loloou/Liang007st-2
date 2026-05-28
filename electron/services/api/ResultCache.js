// ─────────────────────────────────────────────────────────────────────────────
//  ResultCache.js — LRU cache for generation results
//
//  Key: hash(prompt + model + params)
//  Configurable max entries (default 100)
//  Bypass on explicit "no-cache" flag
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const crypto = require('crypto');

class ResultCache {
  /**
   * @param {number} [maxSize=100]
   */
  constructor(maxSize = 100) {
    this._maxSize = maxSize;
    /** @type {Map<string, { result: object, createdAt: number, accessedAt: number }>} */
    this._cache = new Map();
  }

  /**
   * Generate a cache key from params
   * @param {object} params
   * @returns {string}
   */
  _makeKey(params) {
    const canonical = JSON.stringify({
      prompt: params.prompt || '',
      model: params.model || '',
      width: params.width || 0,
      height: params.height || 0,
      batchSize: params.batchSize || 1,
      negativePrompt: params.negativePrompt || '',
    });
    return crypto.createHash('sha256').update(canonical).digest('hex').slice(0, 16);
  }

  /**
   * Get a cached result
   * @param {object} params - Generation parameters
   * @returns {object | null}
   */
  get(params) {
    const key = this._makeKey(params);
    const entry = this._cache.get(key);
    if (!entry) return null;

    // Update access time (LRU)
    entry.accessedAt = Date.now();
    // Move to end (most recently used)
    this._cache.delete(key);
    this._cache.set(key, entry);

    return entry.result;
  }

  /**
   * Store a result in cache
   * @param {object} params - Generation parameters
   * @param {object} result - Generation result
   */
  set(params, result) {
    const key = this._makeKey(params);

    // Evict LRU entries if at capacity
    while (this._cache.size >= this._maxSize) {
      const firstKey = this._cache.keys().next().value;
      this._cache.delete(firstKey);
    }

    this._cache.set(key, {
      result: { ...result },
      createdAt: Date.now(),
      accessedAt: Date.now(),
    });
  }

  /**
   * Check if a result is cached
   * @param {object} params
   * @returns {boolean}
   */
  has(params) {
    return this._cache.has(this._makeKey(params));
  }

  /**
   * Remove a cached entry
   * @param {object} params
   */
  remove(params) {
    this._cache.delete(this._makeKey(params));
  }

  /**
   * Clear all cached entries
   */
  clear() {
    this._cache.clear();
  }

  /**
   * @returns {number}
   */
  get size() {
    return this._cache.size;
  }

  /**
   * Get cache stats
   * @returns {{ size: number, maxSize: number }}
   */
  getStats() {
    return { size: this._cache.size, maxSize: this._maxSize };
  }
}

module.exports = ResultCache;
