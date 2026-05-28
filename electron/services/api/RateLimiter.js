// ─────────────────────────────────────────────────────────────────────────────
//  RateLimiter.js — Token bucket rate limiter per provider
//
//  Features:
//   - Per-provider configurable RPM (requests per minute)
//   - Token bucket algorithm with refill
//   - Queue overflow backpressure (waits for token availability)
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

class RateLimiter {
  constructor() {
    /** @type {Map<string, { rpm: number, tokens: number, lastRefill: number, queue: Array<{ resolve: Function, reject: Function }> }>} */
    this._buckets = new Map();
    this._refillInterval = null;
  }

  /**
   * Configure rate limit for a provider
   * @param {string} providerId
   * @param {number} rpm - Requests per minute (0 = unlimited)
   */
  configure(providerId, rpm) {
    if (!rpm || rpm <= 0) {
      this._buckets.delete(providerId);
      return;
    }

    this._buckets.set(providerId, {
      rpm,
      tokens: rpm,
      lastRefill: Date.now(),
      queue: [],
    });

    // Start refill interval if not running
    if (!this._refillInterval) {
      this._refillInterval = setInterval(() => this._refillAll(), 1000);
    }
  }

  /**
   * Acquire a token for a request. Resolves when a token is available.
   * @param {string} providerId
   * @param {number} [timeoutMs=30000]
   * @returns {Promise<void>}
   */
  async acquire(providerId, timeoutMs = 30000) {
    const bucket = this._buckets.get(providerId);
    if (!bucket) return; // No rate limit configured, pass through

    if (bucket.tokens > 0) {
      bucket.tokens--;
      return;
    }

    // Wait for a token
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = bucket.queue.indexOf(entry);
        if (idx !== -1) bucket.queue.splice(idx, 1);
        reject(new Error(`Rate limit timeout: provider ${providerId} (${timeoutMs}ms)`));
      }, timeoutMs);

      const entry = {
        resolve: () => { clearTimeout(timer); resolve(); },
        reject: (err) => { clearTimeout(timer); reject(err); },
      };
      bucket.queue.push(entry);
    });
  }

  /**
   * Release a token back (e.g. on request cancellation)
   * @param {string} providerId
   */
  release(providerId) {
    const bucket = this._buckets.get(providerId);
    if (!bucket) return;
    bucket.tokens = Math.min(bucket.tokens + 1, bucket.rpm);
  }

  /**
   * Refill all buckets based on elapsed time
   */
  _refillAll() {
    const now = Date.now();
    for (const [, bucket] of this._buckets) {
      const elapsed = now - bucket.lastRefill;
      const refillAmount = Math.floor((elapsed / 60000) * bucket.rpm);
      if (refillAmount > 0) {
        bucket.tokens = Math.min(bucket.tokens + refillAmount, bucket.rpm);
        bucket.lastRefill = now;

        // Drain waiting queue
        while (bucket.queue.length > 0 && bucket.tokens > 0) {
          const waiter = bucket.queue.shift();
          bucket.tokens--;
          waiter.resolve();
        }
      }
    }
  }

  /**
   * Get rate limiter status
   * @returns {Array<{ providerId: string, rpm: number, availableTokens: number, queueLength: number }>}
   */
  getStatus() {
    const result = [];
    for (const [id, bucket] of this._buckets) {
      result.push({
        providerId: id,
        rpm: bucket.rpm,
        availableTokens: bucket.tokens,
        queueLength: bucket.queue.length,
      });
    }
    return result;
  }

  /**
   * Dispose and clean up
   */
  dispose() {
    if (this._refillInterval) {
      clearInterval(this._refillInterval);
      this._refillInterval = null;
    }
    // Reject all waiting
    for (const [, bucket] of this._buckets) {
      for (const waiter of bucket.queue) {
        waiter.reject(new Error('RateLimiter disposed'));
      }
      bucket.queue.length = 0;
    }
    this._buckets.clear();
  }
}

module.exports = RateLimiter;
