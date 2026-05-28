// ─────────────────────────────────────────────────────────────────────────────
//  UpdateChecker.js — Check GitHub releases for updates
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

class UpdateChecker {
  /**
   * @param {object} options
   * @param {string} [options.repoUrl] - GitHub repo URL
   * @param {string} options.currentVersion
   */
  constructor(options = {}) {
    this._repoUrl = options.repoUrl || '';
    this._currentVersion = options.currentVersion || '0.0.0';
    this._lastCheck = 0;
    this._latestVersion = null;
    this._releaseUrl = null;
  }

  /**
   * Check for updates (at most once per day)
   * @returns {Promise<{ hasUpdate: boolean, latestVersion?: string, releaseUrl?: string }>}
   */
  async check() {
    // Rate limit: once per day
    if (Date.now() - this._lastCheck < 24 * 60 * 60 * 1000) {
      return {
        hasUpdate: this._latestVersion ? this._compareVersions(this._latestVersion, this._currentVersion) > 0 : false,
        latestVersion: this._latestVersion,
        releaseUrl: this._releaseUrl,
      };
    }

    if (!this._repoUrl) return { hasUpdate: false };

    try {
      // Extract owner/repo from URL
      const match = this._repoUrl.match(/github\.com\/([^/]+\/[^/]+)/);
      if (!match) return { hasUpdate: false };

      const apiUrl = `https://api.github.com/repos/${match[1]}/releases/latest`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);

      const resp = await fetch(apiUrl, {
        headers: { 'Accept': 'application/vnd.github.v3+json' },
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!resp.ok) return { hasUpdate: false };

      const data = await resp.json();
      this._lastCheck = Date.now();
      this._latestVersion = (data.tag_name || '').replace(/^v/, '');
      this._releaseUrl = data.html_url || '';

      const hasUpdate = this._compareVersions(this._latestVersion, this._currentVersion) > 0;
      return { hasUpdate, latestVersion: this._latestVersion, releaseUrl: this._releaseUrl };
    } catch {
      return { hasUpdate: false };
    }
  }

  /**
   * Compare semver versions
   * @returns {number} Positive if a > b, negative if a < b, 0 if equal
   */
  _compareVersions(a, b) {
    const pa = (a || '').split('.').map(Number);
    const pb = (b || '').split('.').map(Number);
    for (let i = 0; i < 3; i++) {
      const va = pa[i] || 0;
      const vb = pb[i] || 0;
      if (va > vb) return 1;
      if (va < vb) return -1;
    }
    return 0;
  }
}

module.exports = UpdateChecker;
