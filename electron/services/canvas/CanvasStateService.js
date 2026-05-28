// ─────────────────────────────────────────────────────────────────────────────
//  CanvasStateService.js — Canvas state persistence (main process)
//
//  Features:
//   - Multiple canvas documents
//   - File-based persistence in userData/canvases/
//   - Trash with 30-day retention
//   - Auto-cleanup trashed canvases
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const fs = require('fs');
const path = require('path');
const { genId } = require('../api/types');

class CanvasStateService {
  /**
   * @param {string} userDataDir
   */
  constructor(userDataDir) {
    this._canvasesDir = path.join(userDataDir, 'canvases');
    this._trashDir = path.join(userDataDir, 'canvases_trash');

    for (const dir of [this._canvasesDir, this._trashDir]) {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Validate and sanitize a canvas ID to prevent path traversal
   * @param {string} canvasId
   * @returns {string} Sanitized ID
   */
  _sanitizeId(canvasId) {
    const sanitized = String(canvasId || '').replace(/[^a-zA-Z0-9_-]/g, '');
    if (!sanitized) throw new Error('Invalid canvas ID');
    return sanitized;
  }

  /**
   * Resolve a safe file path within the target directory
   * @param {string} dir
   * @param {string} canvasId
   * @returns {string}
   */
  _safePath(dir, canvasId) {
    const id = this._sanitizeId(canvasId);
    const resolved = path.resolve(dir, `${id}.json`);
    if (!resolved.startsWith(path.resolve(dir))) {
      throw new Error('Path traversal detected');
    }
    return resolved;
  }

  /**
   * List all canvases
   * @returns {Array<{ id: string, name: string, createdAt: number, updatedAt: number }>}
   */
  list() {
    try {
      const files = fs.readdirSync(this._canvasesDir).filter(f => f.endsWith('.json'));
      return files.map(f => {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(this._canvasesDir, f), 'utf-8'));
          return { id: data.id, name: data.name, createdAt: data.createdAt, updatedAt: data.updatedAt };
        } catch {
          return null;
        }
      }).filter(Boolean).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    } catch {
      return [];
    }
  }

  /**
   * Load a canvas document
   * @param {string} canvasId
   * @returns {object | null}
   */
  load(canvasId) {
    const filePath = this._safePath(this._canvasesDir, canvasId);
    try {
      if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      }
    } catch (err) {
      console.warn('[CanvasState] Failed to load canvas:', err.message);
    }
    return null;
  }

  /**
   * Save a canvas document
   * @param {object} canvas - Canvas document (must have .id)
   */
  save(canvas) {
    if (!canvas.id) canvas.id = genId();
    canvas.updatedAt = Date.now();
    if (!canvas.createdAt) canvas.createdAt = Date.now();

    const filePath = this._safePath(this._canvasesDir, canvas.id);
    try {
      fs.writeFileSync(filePath, JSON.stringify(canvas, null, 2));
    } catch (err) {
      console.warn('[CanvasState] Failed to save canvas:', err.message);
    }
  }

  /**
   * Create a new canvas
   * @param {string} [name='Untitled']
   * @returns {object}
   */
  create(name = 'Untitled') {
    const canvas = {
      id: genId(),
      name,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      viewport: { x: 0, y: 0, zoom: 1 },
      objects: [],
      metadata: {},
    };
    this.save(canvas);
    return canvas;
  }

  /**
   * Rename a canvas
   * @param {string} canvasId
   * @param {string} newName
   */
  rename(canvasId, newName) {
    const canvas = this.load(canvasId);
    if (canvas) {
      canvas.name = newName;
      this.save(canvas);
    }
  }

  /**
   * Move canvas to trash
   * @param {string} canvasId
   */
  trash(canvasId) {
    const srcPath = this._safePath(this._canvasesDir, canvasId);
    const dstPath = this._safePath(this._trashDir, canvasId);
    try {
      if (fs.existsSync(srcPath)) {
        // Add trash metadata
        const data = JSON.parse(fs.readFileSync(srcPath, 'utf-8'));
        data._trashedAt = Date.now();
        fs.writeFileSync(dstPath, JSON.stringify(data, null, 2));
        fs.unlinkSync(srcPath);
      }
    } catch (err) {
      console.warn('[CanvasState] Failed to trash canvas:', err.message);
    }
  }

  /**
   * Restore canvas from trash
   * @param {string} canvasId
   */
  restore(canvasId) {
    const srcPath = this._safePath(this._trashDir, canvasId);
    const dstPath = this._safePath(this._canvasesDir, canvasId);
    try {
      if (fs.existsSync(srcPath)) {
        const data = JSON.parse(fs.readFileSync(srcPath, 'utf-8'));
        delete data._trashedAt;
        fs.writeFileSync(dstPath, JSON.stringify(data, null, 2));
        fs.unlinkSync(srcPath);
      }
    } catch (err) {
      console.warn('[CanvasState] Failed to restore canvas:', err.message);
    }
  }

  /**
   * Permanently delete a trashed canvas
   * @param {string} canvasId
   */
  permanentDelete(canvasId) {
    const trashPath = this._safePath(this._trashDir, canvasId);
    try {
      if (fs.existsSync(trashPath)) fs.unlinkSync(trashPath);
    } catch { /* ignore */ }
  }

  /**
   * Clean up trash older than 30 days
   */
  cleanupTrash() {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    try {
      const files = fs.readdirSync(this._trashDir).filter(f => f.endsWith('.json'));
      for (const f of files) {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(this._trashDir, f), 'utf-8'));
          if (data._trashedAt && data._trashedAt < cutoff) {
            fs.unlinkSync(path.join(this._trashDir, f));
          }
        } catch { /* skip */ }
      }
    } catch { /* ignore */ }
  }

  /**
   * List trashed canvases
   * @returns {Array<{ id: string, name: string, trashedAt: number }>}
   */
  listTrash() {
    try {
      const files = fs.readdirSync(this._trashDir).filter(f => f.endsWith('.json'));
      return files.map(f => {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(this._trashDir, f), 'utf-8'));
          return { id: data.id, name: data.name, trashedAt: data._trashedAt };
        } catch {
          return null;
        }
      }).filter(Boolean);
    } catch {
      return [];
    }
  }
}

module.exports = CanvasStateService;
