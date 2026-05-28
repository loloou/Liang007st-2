// ─────────────────────────────────────────────────────────────────────────────
//  ImageCleaner.js — Auto-cleanup generated images older than N days
//
//  Features:
//   - Runs on app start + hourly interval
//   - Configurable retention period (default 30 days)
//   - Respects asset library favorites (never delete favorited)
//   - Cleans orphaned thumbnails
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const fs = require('fs');
const path = require('path');

class ImageCleaner {
  /**
   * @param {object} options
   * @param {string} options.imagesDir - Directory containing generated images
   * @param {string} [options.thumbnailsDir] - Directory containing thumbnails
   * @param {number} [options.retentionDays=30]
   * @param {() => Set<string>} [options.getFavorites] - Returns set of favorited file names
   */
  constructor(options) {
    this._imagesDir = options.imagesDir;
    this._thumbnailsDir = options.thumbnailsDir || '';
    this._retentionDays = options.retentionDays || 30;
    this._getFavorites = options.getFavorites || (() => new Set());
    this._interval = null;
    this._running = false;
  }

  /**
   * Start periodic cleanup (hourly)
   */
  start() {
    // Run immediately
    this.cleanup().catch(err => console.warn('[ImageCleaner] Initial cleanup error:', err.message));

    // Schedule hourly
    this._interval = setInterval(() => {
      this.cleanup().catch(err => console.warn('[ImageCleaner] Cleanup error:', err.message));
    }, 60 * 60 * 1000);
  }

  /**
   * Run cleanup now
   * @returns {Promise<{ deleted: number, skipped: number }>}
   */
  async cleanup() {
    if (this._running) return { deleted: 0, skipped: 0 };
    this._running = true;

    try {
      if (!fs.existsSync(this._imagesDir)) return { deleted: 0, skipped: 0 };

      const cutoff = Date.now() - this._retentionDays * 24 * 60 * 60 * 1000;
      const favorites = this._getFavorites();
      let deleted = 0;
      let skipped = 0;

      const files = fs.readdirSync(this._imagesDir);
      for (const file of files) {
        const filePath = path.join(this._imagesDir, file);
        try {
          const stat = fs.statSync(filePath);
          if (!stat.isFile()) continue;

          // Skip favorites
          if (favorites.has(file) || favorites.has(filePath)) {
            skipped++;
            continue;
          }

          if (stat.mtimeMs < cutoff) {
            fs.unlinkSync(filePath);
            deleted++;

            // Clean corresponding thumbnail
            if (this._thumbnailsDir) {
              const thumbPath = path.join(this._thumbnailsDir, file);
              if (fs.existsSync(thumbPath)) {
                fs.unlinkSync(thumbPath);
              }
            }
          }
        } catch {
          // Skip files that can't be processed
        }
      }

      if (deleted > 0) {
        console.log(`[ImageCleaner] Deleted ${deleted} old images, skipped ${skipped} favorites`);
      }
      return { deleted, skipped };
    } finally {
      this._running = false;
    }
  }

  /**
   * Stop periodic cleanup
   */
  dispose() {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
  }
}

module.exports = ImageCleaner;
