// ─────────────────────────────────────────────────────────────────────────────
//  AssetLibraryService.js — Asset library management (main process)
//
//  Features:
//   - Auto-import generation results
//   - Tags, categories, search
//   - Thumbnail generation
//   - File management (userData/assets/)
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { genId } = require('../api/types');

class AssetLibraryService {
  /**
   * @param {string} userDataDir
   */
  constructor(userDataDir) {
    this._assetsDir = path.join(userDataDir, 'assets');
    this._thumbnailsDir = path.join(userDataDir, 'asset_thumbnails');
    this._metadataPath = path.join(userDataDir, 'asset_library.json');

    // Ensure directories
    for (const dir of [this._assetsDir, this._thumbnailsDir]) {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    }

    /** @type {Array<{ id: string, fileName: string, originalName?: string, prompt?: string, model?: string, tags: string[], createdAt: number, width?: number, height?: number, favorite: boolean, category?: string }>} */
    this._assets = [];
    this._categories = [
      { id: 'characters', name: '角色', type: 'image' },
      { id: 'scenes', name: '场景', type: 'image' },
      { id: 'workflows', name: '工作流', type: 'workflow' },
    ];
    this._load();
    this._saveTimer = null;
  }

  _load() {
    try {
      if (fs.existsSync(this._metadataPath)) {
        const data = JSON.parse(fs.readFileSync(this._metadataPath, 'utf-8'));
        if (Array.isArray(data)) {
          this._assets = data;
        } else if (data && typeof data === 'object') {
          if (Array.isArray(data.items)) this._assets = data.items;
          if (Array.isArray(data.categories)) {
            const byId = new Map(this._categories.map(c => [c.id, c]));
            for (const category of data.categories) byId.set(category.id, category);
            this._categories = [...byId.values()];
          }
        }
      }
    } catch (err) {
      console.warn('[AssetLibrary] Failed to load metadata:', err.message);
    }
  }

  _scheduleSave() {
    if (this._saveTimer) return;
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      this._flush();
    }, 2000);
  }

  _flush() {
    try {
      fs.writeFileSync(this._metadataPath, JSON.stringify({ categories: this._categories, items: this._assets }, null, 2));
    } catch (err) {
      console.warn('[AssetLibrary] Failed to save metadata:', err.message);
    }
  }

  /**
   * Import a generated image into the library
   * @param {object} options
   * @param {Buffer | string} options.data - Image data (Buffer) or base64 data URL string
   * @param {string} [options.prompt]
   * @param {string} [options.model]
   * @param {string[]} [options.tags]
   * @param {number} [options.width]
   * @param {number} [options.height]
   * @returns {object} The created asset entry
   */
  async import(options) {
    const id = genId();
    const ext = '.png';
    const fileName = `${id}${ext}`;
    const filePath = path.join(this._assetsDir, fileName);

    const imageBuffer = await this._readImageData(options.data);
    if (!imageBuffer) {
      throw new Error('Invalid image data');
    }

    fs.writeFileSync(filePath, imageBuffer);

    // Generate thumbnail (simple: just save the same image for now; sharp can optimize later)
    const thumbPath = path.join(this._thumbnailsDir, fileName);
    fs.writeFileSync(thumbPath, imageBuffer);

    const asset = {
      id,
      fileName,
      prompt: options.prompt || '',
      model: options.model || '',
      tags: options.tags || [],
      createdAt: Date.now(),
      width: options.width,
      height: options.height,
      favorite: false,
      category: this._autoCategory(options.model, options.prompt),
    };

    this._assets.unshift(asset);
    this._scheduleSave();

    return asset;
  }

  async _readImageData(data) {
    if (Buffer.isBuffer(data)) return data;
    if (typeof data !== 'string') return null;

    const value = data.trim();
    const base64Match = value.match(/^data:image\/[^;]+;base64,(.+)$/i);
    if (base64Match) return Buffer.from(base64Match[1], 'base64');

    if (value.startsWith('file://')) {
      const filePath = decodeURIComponent(value.replace(/^file:\/\//i, ''));
      if (fs.existsSync(filePath)) return fs.readFileSync(filePath);
      return null;
    }

    if (/^https?:\/\//i.test(value)) {
      const resp = await fetch(value);
      if (!resp.ok) throw new Error(`Failed to download image: HTTP ${resp.status}`);
      return Buffer.from(await resp.arrayBuffer());
    }

    if (path.isAbsolute(value) && fs.existsSync(value)) {
      return fs.readFileSync(value);
    }

    if (value.length > 100) {
      return Buffer.from(value, 'base64');
    }

    return null;
  }

  /**
   * Get all assets (with pagination)
   * @param {object} [options]
   * @param {number} [options.offset=0]
   * @param {number} [options.limit=50]
   * @param {string} [options.search]
   * @param {string[]} [options.tags]
   * @param {string} [options.sort='date']
   * @returns {{ assets: object[], total: number }}
   */
  getAll(options = {}) {
    let filtered = [...this._assets];

    // Search
    if (options.search) {
      const q = options.search.toLowerCase();
      filtered = filtered.filter(a =>
        (a.prompt || '').toLowerCase().includes(q) ||
        (a.model || '').toLowerCase().includes(q) ||
        a.tags.some(t => t.toLowerCase().includes(q))
      );
    }

    // Tag filter
    if (options.tags && options.tags.length > 0) {
      filtered = filtered.filter(a =>
        options.tags.every(t => a.tags.includes(t))
      );
    }

    // Sort
    if (options.sort === 'name') {
      filtered.sort((a, b) => (a.fileName || '').localeCompare(b.fileName || ''));
    } else {
      filtered.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    }

    const total = filtered.length;
    const offset = options.offset || 0;
    const limit = options.limit || 50;

    return {
      assets: filtered.slice(offset, offset + limit).map(a => ({
        ...a,
        filePath: path.join(this._assetsDir, a.fileName),
        thumbnailPath: path.join(this._thumbnailsDir, a.fileName),
      })),
      total,
    };
  }

  /**
   * Get asset by ID
   * @param {string} id
   * @returns {object | null}
   */
  getById(id) {
    const asset = this._assets.find(a => a.id === id);
    if (!asset) return null;
    return {
      ...asset,
      filePath: path.join(this._assetsDir, asset.fileName),
      thumbnailPath: path.join(this._thumbnailsDir, asset.fileName),
    };
  }

  /**
   * Update asset metadata
   * @param {string} id
   * @param {object} patch
   * @returns {object | null}
   */
  update(id, patch) {
    const idx = this._assets.findIndex(a => a.id === id);
    if (idx === -1) return null;
    this._assets[idx] = { ...this._assets[idx], ...patch, id };
    this._scheduleSave();
    return this._assets[idx];
  }

  /**
   * Delete an asset
   * @param {string} id
   * @returns {boolean}
   */
  delete(id) {
    const idx = this._assets.findIndex(a => a.id === id);
    if (idx === -1) return false;

    const asset = this._assets[idx];
    // Delete files
    try { fs.unlinkSync(path.join(this._assetsDir, asset.fileName)); } catch { /* ignore */ }
    try { fs.unlinkSync(path.join(this._thumbnailsDir, asset.fileName)); } catch { /* ignore */ }

    this._assets.splice(idx, 1);
    this._scheduleSave();
    return true;
  }

  /**
   * Batch add tags
   * @param {string[]} ids
   * @param {string[]} tags
   */
  batchAddTags(ids, tags) {
    for (const id of ids) {
      const asset = this._assets.find(a => a.id === id);
      if (asset) {
        const newTags = new Set([...asset.tags, ...tags]);
        asset.tags = [...newTags];
      }
    }
    this._scheduleSave();
  }

  /**
   * Get all unique tags
   * @returns {string[]}
   */
  getAllTags() {
    const tagSet = new Set();
    for (const a of this._assets) {
      for (const t of a.tags) tagSet.add(t);
    }
    return [...tagSet].sort();
  }

  /**
   * Get favorites set (for ImageCleaner)
   * @returns {Set<string>}
   */
  getFavoriteFileNames() {
    return new Set(this._assets.filter(a => a.favorite).map(a => a.fileName));
  }

  getCategories() {
    return [...this._categories];
  }

  addCategory(category) {
    const id = String(category.id || genId()).replace(/[^a-zA-Z0-9_-]/g, '_');
    const next = { id, name: category.name || '未命名分类', type: category.type || 'image' };
    if (!this._categories.some(c => c.id === id)) this._categories.push(next);
    this._scheduleSave();
    return next;
  }

  updateCategory(id, patch) {
    const category = this._categories.find(c => c.id === id);
    if (!category) return null;
    if (typeof patch.name === 'string') category.name = patch.name;
    if (typeof patch.type === 'string') category.type = patch.type;
    this._scheduleSave();
    return category;
  }

  deleteCategory(id) {
    if (['characters', 'scenes', 'workflows'].includes(id)) return false;
    const len = this._categories.length;
    this._categories = this._categories.filter(c => c.id !== id);
    for (const asset of this._assets) {
      if (asset.category === id) asset.category = undefined;
    }
    this._scheduleSave();
    return this._categories.length < len;
  }

  /** @returns {string} */
  get assetsDir() { return this._assetsDir; }

  _autoCategory(model, prompt) {
    if (!model) return 'uncategorized';
    const lower = model.toLowerCase();
    if (lower.includes('dall-e') || lower.includes('dalle')) return 'DALL-E';
    if (lower.includes('gemini')) return 'Gemini';
    if (lower.includes('flux')) return 'Flux';
    if (lower.includes('stable') || lower.includes('sd')) return 'Stable Diffusion';
    if (lower.includes('banana')) return 'Banana';
    return model.split('/').pop() || 'Other';
  }

  dispose() {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }
    this._flush();
  }
}

module.exports = AssetLibraryService;
