// ─────────────────────────────────────────────────────────────────────────────
//  TaskStore.js — Disk-persistent task state for crash recovery
//
//  Stores task metadata (not image data) to a JSON file in userData.
//  On startup, incomplete tasks can be recovered and re-queued.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const fs = require('fs');
const path = require('path');

class TaskStore {
  /**
   * @param {string} storePath - Full path to the tasks JSON file
   */
  constructor(storePath) {
    this._storePath = storePath;
    /** @type {Map<string, object>} */
    this._tasks = new Map();
    this._dirty = false;
    this._saveTimer = null;
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this._storePath)) {
        const data = JSON.parse(fs.readFileSync(this._storePath, 'utf-8'));
        if (Array.isArray(data)) {
          for (const task of data) {
            if (task && task.taskId) this._tasks.set(task.taskId, task);
          }
        }
      }
    } catch (err) {
      console.warn('[TaskStore] Failed to load tasks:', err.message);
    }
  }

  _scheduleSave() {
    if (this._saveTimer) return;
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      this._flush();
    }, 1000);
  }

  _flush() {
    try {
      const dir = path.dirname(this._storePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this._storePath, JSON.stringify([...this._tasks.values()], null, 2));
    } catch (err) {
      console.warn('[TaskStore] Failed to save tasks:', err.message);
    }
  }

  /**
   * Save or update a task
   * @param {object} task - Task object (must have taskId)
   */
  save(task) {
    this._tasks.set(task.taskId, { ...task, updatedAt: Date.now() });
    this._scheduleSave();
  }

  /**
   * Get a task by ID
   * @param {string} taskId
   * @returns {object | undefined}
   */
  get(taskId) {
    return this._tasks.get(taskId);
  }

  /**
   * Get all tasks
   * @returns {object[]}
   */
  getAll() {
    return [...this._tasks.values()];
  }

  /**
   * Get tasks by status
   * @param {string} status
   * @returns {object[]}
   */
  getByStatus(status) {
    return this.getAll().filter(t => t.status === status);
  }

  /**
   * Remove a task
   * @param {string} taskId
   */
  remove(taskId) {
    this._tasks.delete(taskId);
    this._scheduleSave();
  }

  /**
   * Remove completed/failed tasks older than maxAge
   * @param {number} maxAgeMs
   */
  cleanup(maxAgeMs = 24 * 60 * 60 * 1000) {
    const now = Date.now();
    for (const [id, task] of this._tasks) {
      if ((task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') &&
          task.updatedAt && (now - task.updatedAt > maxAgeMs)) {
        this._tasks.delete(id);
      }
    }
    this._scheduleSave();
  }

  /**
   * Flush immediately and clean up
   */
  dispose() {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }
    this._flush();
  }
}

module.exports = TaskStore;
