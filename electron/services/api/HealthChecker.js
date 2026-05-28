// ─────────────────────────────────────────────────────────────────────────────
//  HealthChecker.js — Startup and periodic API provider health checks
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

class HealthChecker {
  /**
   * @param {object} options
   * @param {import('./AdapterFactory')} options.adapterFactory
   * @param {import('../config/ProviderConfigStore')} options.configStore
   * @param {number} [options.timeoutMs=10000]
   * @param {number} [options.maxConsecutiveFailures=5]
   */
  constructor(options) {
    this._adapterFactory = options.adapterFactory;
    this._configStore = options.configStore;
    this._timeoutMs = options.timeoutMs || 10000;
    this._maxFails = options.maxConsecutiveFailures || 5;

    /** @type {Map<string, { status: 'green' | 'yellow' | 'red', consecutiveFailures: number, lastCheck: number, message?: string }>} */
    this._healthMap = new Map();
    this._interval = null;
  }

  /**
   * Check all enabled providers in parallel
   * @returns {Promise<Array<{ providerId: string, status: string, message: string }>>}
   */
  async checkAll() {
    const providers = this._configStore.getEnabled();
    const results = await Promise.allSettled(
      providers.map(p => this._checkOne(p))
    );

    return results.map((r, i) => {
      const providerId = providers[i].id;
      if (r.status === 'fulfilled') return r.value;
      return { providerId, status: 'red', message: r.reason?.message || 'Check failed' };
    });
  }

  async _checkOne(provider) {
    const AdapterFactory = require('./AdapterFactory');
    const adapter = AdapterFactory.create(provider);
    try {
      const result = await Promise.race([
        adapter.testConnection(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), this._timeoutMs)),
      ]);

      const health = this._healthMap.get(provider.id) || { status: 'green', consecutiveFailures: 0, lastCheck: 0 };

      if (result.ok) {
        health.status = 'green';
        health.consecutiveFailures = 0;
        health.message = result.message;
      } else {
        health.consecutiveFailures++;
        health.status = health.consecutiveFailures >= this._maxFails ? 'red' : 'yellow';
        health.message = result.message;

        // Auto-disable on too many failures
        if (health.consecutiveFailures >= this._maxFails) {
          this._configStore.update(provider.id, { enabled: false });
        }
      }

      health.lastCheck = Date.now();
      this._healthMap.set(provider.id, health);
      adapter.dispose();

      return { providerId: provider.id, status: health.status, message: health.message };
    } catch (err) {
      adapter.dispose();
      const health = this._healthMap.get(provider.id) || { status: 'red', consecutiveFailures: 0, lastCheck: 0 };
      health.consecutiveFailures++;
      health.status = 'red';
      health.message = err.message;
      health.lastCheck = Date.now();
      this._healthMap.set(provider.id, health);
      return { providerId: provider.id, status: 'red', message: err.message };
    }
  }

  /**
   * Get health status for all providers
   * @returns {Array<{ providerId: string, status: string, consecutiveFailures: number, lastCheck: number, message?: string }>}
   */
  getStatus() {
    const result = [];
    for (const [id, h] of this._healthMap) {
      result.push({ providerId: id, ...h });
    }
    return result;
  }

  /**
   * Start periodic checks (every 5 minutes)
   */
  startPeriodic() {
    this._interval = setInterval(() => {
      this.checkAll().catch(err => console.warn('[HealthChecker]', err.message));
    }, 5 * 60 * 1000);
  }

  /**
   * Reset health state for a provider
   * @param {string} providerId
   */
  reset(providerId) {
    this._healthMap.delete(providerId);
  }

  dispose() {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
  }
}

module.exports = HealthChecker;
