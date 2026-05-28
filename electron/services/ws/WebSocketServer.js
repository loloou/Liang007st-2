// ─────────────────────────────────────────────────────────────────────────────
//  WebSocketServer.js — Local WebSocket server for real-time progress push
//
//  Runs on localhost with auto-assigned port.
//  Pushes task progress, completion, failure events to the renderer.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const { EventEmitter } = require('events');

class WebSocketServer extends EventEmitter {
  /**
   * @param {object} [options]
   * @param {number} [options.port=0] - 0 for auto-assign
   */
  constructor(options = {}) {
    super();
    this._port = options.port || 0;
    this._wss = null;
    this._actualPort = 0;
    this._clients = new Set();
  }

  /**
   * Start the WebSocket server
   * @returns {Promise<number>} Assigned port
   */
  async start() {
    // Lazy-load ws module
    let WebSocket;
    try {
      WebSocket = require('ws');
    } catch {
      console.warn('[WebSocketServer] ws module not installed, using IPC-only mode');
      return 0;
    }

    return new Promise((resolve, reject) => {
      this._wss = new WebSocket.Server({ host: '127.0.0.1', port: this._port });

      this._wss.on('listening', () => {
        this._actualPort = this._wss.address().port;
        console.log(`[WebSocketServer] Listening on ws://127.0.0.1:${this._actualPort}`);
        resolve(this._actualPort);
      });

      this._wss.on('connection', (ws) => {
        this._clients.add(ws);
        ws.on('close', () => this._clients.delete(ws));
        ws.on('error', () => this._clients.delete(ws));
        // Send initial handshake
        ws.send(JSON.stringify({ type: 'connected', port: this._actualPort }));
      });

      this._wss.on('error', (err) => {
        console.error('[WebSocketServer] Error:', err.message);
        reject(err);
      });
    });
  }

  /**
   * Broadcast a message to all connected clients
   * @param {object} message
   */
  broadcast(message) {
    if (this._clients.size === 0) return;
    const data = JSON.stringify(message);
    for (const client of this._clients) {
      try {
        if (client.readyState === 1) { // WebSocket.OPEN
          client.send(data);
        }
      } catch {
        this._clients.delete(client);
      }
    }
  }

  /**
   * Send task progress update
   * @param {string} taskId
   * @param {number} progress
   * @param {string} [status]
   */
  sendProgress(taskId, progress, status) {
    this.broadcast({ type: 'task:progress', taskId, progress, status });
  }

  /**
   * Send task completion
   * @param {string} taskId
   * @param {object} result
   */
  sendCompleted(taskId, result) {
    this.broadcast({ type: 'task:completed', taskId, result });
  }

  /**
   * Send task failure
   * @param {string} taskId
   * @param {string} error
   */
  sendFailed(taskId, error) {
    this.broadcast({ type: 'task:failed', taskId, error });
  }

  /**
   * Send task cancelled
   * @param {string} taskId
   */
  sendCancelled(taskId) {
    this.broadcast({ type: 'task:cancelled', taskId });
  }

  /** @returns {number} */
  get port() {
    return this._actualPort;
  }

  /** @returns {number} */
  get clientCount() {
    return this._clients.size;
  }

  /**
   * Stop the server
   */
  dispose() {
    if (this._wss) {
      for (const client of this._clients) {
        try { client.close(); } catch { /* ignore */ }
      }
      this._clients.clear();
      this._wss.close();
      this._wss = null;
    }
  }
}

module.exports = WebSocketServer;
