// ─────────────────────────────────────────────────────────────────────────────
//  TaskQueue.js — Async task queue with configurable concurrency
//
//  Features:
//   - Configurable concurrency (default: 3)
//   - Task priority (high/normal/low)
//   - Cancel support
//   - Disk persistence via TaskStore for crash recovery
//   - Event-based progress reporting
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const { EventEmitter } = require('events');
const { genTaskId, TaskStatus } = require('./types');

class TaskQueue extends EventEmitter {
  /**
   * @param {object} options
   * @param {number} [options.concurrency=3]
   * @param {import('./TaskStore')} [options.taskStore]
   */
  constructor(options = {}) {
    super();
    this._concurrency = options.concurrency || 3;
    this._taskStore = options.taskStore || null;
    /** @type {Array<{ task: object, resolve: Function, reject: Function }>} */
    this._queue = [];
    /** @type {Map<string, { task: object, abort: AbortController }>} */
    this._running = new Map();
    /** @type {Map<string, object>} */
    this._results = new Map();
    this._maxResults = 200; // Limit results cache size
    this._paused = false;
  }

  /**
   * Submit a generation task
   * @param {object} params - Generation parameters
   * @param {(task: object, signal: AbortSignal) => Promise<object>} executor - The function to run
   * @param {object} [options]
   * @param {string} [options.priority='normal']
   * @returns {{ taskId: string, promise: Promise<object> }}
   */
  submit(params, executor, options = {}) {
    const taskId = genTaskId();
    const task = {
      taskId,
      params: { ...params },
      status: TaskStatus.QUEUED,
      priority: options.priority || 'normal',
      createdAt: Date.now(),
      progress: 0,
    };

    // Persist to disk
    if (this._taskStore) this._taskStore.save(task);

    const promise = new Promise((resolve, reject) => {
      this._queue.push({ task, resolve, reject, executor });
      // Sort by priority: high > normal > low
      this._queue.sort((a, b) => {
        const prio = { high: 0, normal: 1, low: 2 };
        return (prio[a.task.priority] || 1) - (prio[b.task.priority] || 1);
      });
    });

    this.emit('task:queued', task);
    this._processNext();

    return { taskId, promise };
  }

  /**
   * Cancel a task
   * @param {string} taskId
   * @returns {boolean} Whether the task was found and cancelled
   */
  cancel(taskId) {
    // Check running tasks
    const running = this._running.get(taskId);
    if (running) {
      running.abort.abort();
      running.task.status = TaskStatus.CANCELLED;
      if (this._taskStore) this._taskStore.save(running.task);
      this._running.delete(taskId);
      // Settle the promise so it doesn't hang
      if (running.resolve) running.resolve({ ...running.task, status: TaskStatus.CANCELLED });
      this.emit('task:cancelled', running.task);
      this._processNext();
      return true;
    }

    // Check queued tasks
    const idx = this._queue.findIndex(q => q.task.taskId === taskId);
    if (idx !== -1) {
      const entry = this._queue.splice(idx, 1)[0];
      entry.task.status = TaskStatus.CANCELLED;
      if (this._taskStore) this._taskStore.save(entry.task);
      entry.resolve({ ...entry.task, status: TaskStatus.CANCELLED });
      this.emit('task:cancelled', entry.task);
      return true;
    }

    return false;
  }

  /**
   * Get task status
   * @param {string} taskId
   * @returns {object | null}
   */
  getStatus(taskId) {
    // Check running
    const running = this._running.get(taskId);
    if (running) return { ...running.task };

    // Check queued
    const queued = this._queue.find(q => q.task.taskId === taskId);
    if (queued) return { ...queued.task };

    // Check results cache
    const result = this._results.get(taskId);
    if (result) return { ...result };

    // Check task store
    if (this._taskStore) {
      const stored = this._taskStore.get(taskId);
      if (stored) return { ...stored };
    }

    return null;
  }

  /**
   * Update task progress
   * @param {string} taskId
   * @param {number} progress - 0-100
   */
  updateProgress(taskId, progress) {
    const running = this._running.get(taskId);
    if (running) {
      running.task.progress = progress;
      this.emit('task:progress', running.task);
    }
  }

  /**
   * Get queue statistics
   * @returns {{ queued: number, running: number, completed: number }}
   */
  getStats() {
    return {
      queued: this._queue.length,
      running: this._running.size,
      completed: this._results.size,
    };
  }

  /**
   * Process next tasks in the queue
   */
  _processNext() {
    if (this._paused) return;

    while (this._running.size < this._concurrency && this._queue.length > 0) {
      const entry = this._queue.shift();
      if (!entry) break;

      const abort = new AbortController();
      entry.task.status = TaskStatus.RUNNING;
      entry.task.startedAt = Date.now();
      if (this._taskStore) this._taskStore.save(entry.task);

      this._running.set(entry.task.taskId, { task: entry.task, abort, resolve: entry.resolve });
      this.emit('task:started', entry.task);

      // Execute the task
      entry.executor(entry.task, abort.signal)
        .then(result => {
          if (abort.signal.aborted) return; // Already cancelled

          entry.task.status = TaskStatus.COMPLETED;
          entry.task.completedAt = Date.now();
          entry.task.progress = 100;
          const finalResult = { ...entry.task, result };
          if (this._taskStore) this._taskStore.save(finalResult);
          // Evict oldest results if over limit
          if (this._results.size >= this._maxResults) {
            const firstKey = this._results.keys().next().value;
            if (firstKey !== undefined) this._results.delete(firstKey);
          }
          this._results.set(entry.task.taskId, finalResult);
          this._running.delete(entry.task.taskId);
          this.emit('task:completed', finalResult);
          entry.resolve(finalResult);
          this._processNext();
        })
        .catch(err => {
          if (abort.signal.aborted) return; // Already cancelled

          entry.task.status = TaskStatus.FAILED;
          entry.task.completedAt = Date.now();
          entry.task.error = err.message || String(err);
          if (this._taskStore) this._taskStore.save(entry.task);
          if (this._results.size >= this._maxResults) {
            const firstKey = this._results.keys().next().value;
            if (firstKey !== undefined) this._results.delete(firstKey);
          }
          this._results.set(entry.task.taskId, entry.task);
          this._running.delete(entry.task.taskId);
          this.emit('task:failed', entry.task);
          entry.resolve(entry.task); // Resolve (not reject) to let caller handle
          this._processNext();
        });
    }
  }

  /**
   * Pause processing (running tasks continue, but no new ones start)
   */
  pause() {
    this._paused = true;
  }

  /**
   * Resume processing
   */
  resume() {
    this._paused = false;
    this._processNext();
  }

  /**
   * Dispose and cancel all pending/running tasks
   */
  dispose() {
    // Cancel all running
    for (const [, entry] of this._running) {
      entry.abort.abort();
      if (entry.resolve) entry.resolve({ ...entry.task, status: TaskStatus.CANCELLED });
    }
    this._running.clear();

    // Cancel all queued
    for (const entry of this._queue) {
      entry.task.status = TaskStatus.CANCELLED;
      entry.resolve(entry.task);
    }
    this._queue.length = 0;
    this._results.clear();

    if (this._taskStore) this._taskStore.dispose();
  }
}

module.exports = TaskQueue;
