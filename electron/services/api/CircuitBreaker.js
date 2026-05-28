// ─────────────────────────────────────────────────────────────────────────────
//  CircuitBreaker.js — Per-provider circuit breaker with auto-failover
//
//  States: CLOSED (normal) -> OPEN (failing) -> HALF_OPEN (probing)
//  Threshold: 3 consecutive failures -> OPEN
//  Recovery: after cooldown (default 60s), transition to HALF_OPEN
//  If HALF_OPEN succeeds -> CLOSED; fails -> OPEN again
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const CBState = Object.freeze({
  CLOSED: 'closed',
  OPEN: 'open',
  HALF_OPEN: 'half_open',
});

class CircuitBreaker {
  /**
   * @param {object} [options]
   * @param {number} [options.failureThreshold=3]
   * @param {number} [options.cooldownMs=60000]
   * @param {(providerId: string, state: string) => void} [options.onStateChange]
   */
  constructor(options = {}) {
    this._failureThreshold = options.failureThreshold || 3;
    this._cooldownMs = options.cooldownMs || 60000;
    this._onStateChange = options.onStateChange || (() => {});

    /** @type {Map<string, { state: string, failureCount: number, lastFailure: number, lastSuccess: number }>} */
    this._providers = new Map();
  }

  /**
   * Register a provider
   * @param {string} providerId
   */
  register(providerId) {
    if (!this._providers.has(providerId)) {
      this._providers.set(providerId, {
        state: CBState.CLOSED,
        failureCount: 0,
        lastFailure: 0,
        lastSuccess: 0,
      });
    }
  }

  /**
   * Check if a provider is available for requests
   * @param {string} providerId
   * @returns {boolean}
   */
  isAvailable(providerId) {
    const p = this._providers.get(providerId);
    if (!p) return true; // Unknown provider treated as available

    if (p.state === CBState.CLOSED) return true;

    if (p.state === CBState.OPEN) {
      // Check if cooldown expired
      if (Date.now() - p.lastFailure >= this._cooldownMs) {
        p.state = CBState.HALF_OPEN;
        this._onStateChange(providerId, CBState.HALF_OPEN);
        return true; // Allow one probe request
      }
      return false;
    }

    // HALF_OPEN: allow the probe through
    return true;
  }

  /**
   * Report a successful request
   * @param {string} providerId
   */
  reportSuccess(providerId) {
    const p = this._providers.get(providerId);
    if (!p) return;

    if (p.state !== CBState.CLOSED) {
      p.state = CBState.CLOSED;
      this._onStateChange(providerId, CBState.CLOSED);
    }
    p.failureCount = 0;
    p.lastSuccess = Date.now();
  }

  /**
   * Report a failed request
   * @param {string} providerId
   */
  reportFailure(providerId) {
    const p = this._providers.get(providerId);
    if (!p) return;

    p.failureCount++;
    p.lastFailure = Date.now();

    if (p.state === CBState.HALF_OPEN) {
      // Probe failed, go back to OPEN
      p.state = CBState.OPEN;
      this._onStateChange(providerId, CBState.OPEN);
      return;
    }

    if (p.failureCount >= this._failureThreshold && p.state === CBState.CLOSED) {
      p.state = CBState.OPEN;
      this._onStateChange(providerId, CBState.OPEN);
    }
  }

  /**
   * Get the first available provider from a list (failover)
   * @param {string[]} providerIds - Ordered by priority
   * @returns {string | null} First available provider ID, or null if all unavailable
   */
  getAvailableProvider(providerIds) {
    for (const id of providerIds) {
      if (this.isAvailable(id)) return id;
    }
    // Fallback: return the first provider anyway (let it fail naturally)
    return providerIds[0] || null;
  }

  /**
   * Get status of all providers
   * @returns {Array<{ providerId: string, state: string, failureCount: number }>}
   */
  getStatus() {
    const result = [];
    for (const [id, p] of this._providers) {
      // Auto-transition for display
      if (p.state === CBState.OPEN && Date.now() - p.lastFailure >= this._cooldownMs) {
        p.state = CBState.HALF_OPEN;
      }
      result.push({ providerId: id, state: p.state, failureCount: p.failureCount });
    }
    return result;
  }

  /**
   * Reset a specific provider circuit breaker
   * @param {string} providerId
   */
  reset(providerId) {
    const p = this._providers.get(providerId);
    if (p) {
      p.state = CBState.CLOSED;
      p.failureCount = 0;
      this._onStateChange(providerId, CBState.CLOSED);
    }
  }

  /**
   * Reset all circuit breakers
   */
  resetAll() {
    for (const [id] of this._providers) {
      this.reset(id);
    }
  }
}

module.exports = CircuitBreaker;
module.exports.CBState = CBState;
