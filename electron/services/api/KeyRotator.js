// ─────────────────────────────────────────────────────────────────────────────
//  KeyRotator.js — Round-robin multi-key rotation per provider
//
//  Features:
//   - Round-robin across multiple API keys
//   - Auto-skip exhausted/rate-limited keys
//   - Track per-key state (last used, error count, cooldown)
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

class KeyRotator {
  /**
   * @param {string[]} keys - API keys to rotate through
   * @param {number} [cooldownMs=60000] - Cooldown period for exhausted keys
   */
  constructor(keys = [], cooldownMs = 60000) {
    this._keys = keys.filter(k => k && k.trim());
    this._cooldownMs = cooldownMs;
    this._currentIndex = 0;
    /** @type {Map<string, { errorCount: number, exhaustedAt: number | null, lastUsed: number }>} */
    this._keyState = new Map();

    for (const key of this._keys) {
      this._keyState.set(key, { errorCount: 0, exhaustedAt: null, lastUsed: 0 });
    }
  }

  /** @returns {number} */
  get keyCount() {
    return this._keys.length;
  }

  /** @returns {boolean} */
  get hasKeys() {
    return this._keys.length > 0;
  }

  /**
   * Get the next available key via round-robin
   * @returns {string | null} The next key, or null if all exhausted
   */
  getNextKey() {
    if (this._keys.length === 0) return null;

    const now = Date.now();
    const startIndex = this._currentIndex;

    // Try each key once
    for (let i = 0; i < this._keys.length; i++) {
      const idx = (startIndex + i) % this._keys.length;
      const key = this._keys[idx];
      const state = this._keyState.get(key);

      // Skip keys that are in cooldown
      if (state?.exhaustedAt) {
        if (now - state.exhaustedAt < this._cooldownMs) continue;
        // Cooldown expired, reset
        state.exhaustedAt = null;
        state.errorCount = 0;
      }

      this._currentIndex = (idx + 1) % this._keys.length;
      state.lastUsed = now;
      return key;
    }

    // All keys exhausted, force return first key (let it fail naturally)
    const fallbackKey = this._keys[0];
    this._currentIndex = 1 % this._keys.length;
    return fallbackKey;
  }

  /**
   * Report a successful use of a key
   * @param {string} key
   */
  reportSuccess(key) {
    const state = this._keyState.get(key);
    if (state) {
      state.errorCount = 0;
      state.exhaustedAt = null;
    }
  }

  /**
   * Report a failed use of a key
   * @param {string} key
   * @param {boolean} [isRateLimited=false]
   */
  reportError(key, isRateLimited = false) {
    const state = this._keyState.get(key);
    if (!state) return;
    state.errorCount++;
    if (isRateLimited || state.errorCount >= 3) {
      state.exhaustedAt = Date.now();
    }
  }

  /**
   * Update the key list (e.g. from config change)
   * @param {string[]} newKeys
   */
  updateKeys(newKeys) {
    const filtered = newKeys.filter(k => k && k.trim());
    this._keys = filtered;
    this._currentIndex = 0;
    // Remove stale entries
    for (const [key] of this._keyState) {
      if (!filtered.includes(key)) this._keyState.delete(key);
    }
    // Add new entries
    for (const key of filtered) {
      if (!this._keyState.has(key)) {
        this._keyState.set(key, { errorCount: 0, exhaustedAt: null, lastUsed: 0 });
      }
    }
  }

  /**
   * Get status of all keys (for diagnostics)
   * @returns {Array<{ key: string, errorCount: number, exhausted: boolean, lastUsed: number }>}
   */
  getStatus() {
    const now = Date.now();
    return this._keys.map(key => {
      const s = this._keyState.get(key);
      return {
        key: key.slice(0, 8) + '...',
        errorCount: s?.errorCount || 0,
        exhausted: !!(s?.exhaustedAt && now - s.exhaustedAt < this._cooldownMs),
        lastUsed: s?.lastUsed || 0,
      };
    });
  }
}

module.exports = KeyRotator;
