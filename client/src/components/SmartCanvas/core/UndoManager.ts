import type { SmartNode, NodeConnection } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
//  UndoManager — stack-based undo/redo for canvas state snapshots
// ─────────────────────────────────────────────────────────────────────────────

export interface CanvasSnapshot {
  nodes: SmartNode[]
  connections: NodeConnection[]
}

/**
 * Maintains two stacks (undo & redo) of deep-cloned canvas snapshots.
 *
 * Usage pattern:
 *   1. Before a mutation, call `push(currentState)`.
 *   2. To undo, call `undo(currentState)` — it returns the previous state.
 *   3. To redo, call `redo(currentState)` — it returns the next state.
 *
 * Any new `push` after an undo clears the redo stack (standard behavior).
 */
export class UndoManager {
  private undoStack: CanvasSnapshot[] = []
  private redoStack: CanvasSnapshot[] = []
  private maxSize: number

  constructor(maxSize = 40) {
    this.maxSize = maxSize
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /** Push a snapshot onto the undo stack (called *before* a mutation). */
  push(snapshot: CanvasSnapshot): void {
    this.undoStack.push(this.clone(snapshot))

    // Trim oldest entries when exceeding capacity
    if (this.undoStack.length > this.maxSize) {
      this.undoStack.splice(0, this.undoStack.length - this.maxSize)
    }

    // New action invalidates the redo history
    this.redoStack.length = 0
  }

  /**
   * Undo: pop the last snapshot from the undo stack and push `currentState`
   * onto the redo stack.
   *
   * @returns The restored snapshot, or `null` if nothing to undo.
   */
  undo(currentState: CanvasSnapshot): CanvasSnapshot | null {
    const prev = this.undoStack.pop()
    if (!prev) return null

    this.redoStack.push(this.clone(currentState))
    return prev
  }

  /**
   * Redo: pop the last snapshot from the redo stack and push `currentState`
   * onto the undo stack.
   *
   * @returns The restored snapshot, or `null` if nothing to redo.
   */
  redo(currentState: CanvasSnapshot): CanvasSnapshot | null {
    const next = this.redoStack.pop()
    if (!next) return null

    this.undoStack.push(this.clone(currentState))
    return next
  }

  /** Clear both stacks. */
  clear(): void {
    this.undoStack.length = 0
    this.redoStack.length = 0
  }

  // ── Accessors ───────────────────────────────────────────────────────────

  get canUndo(): boolean {
    return this.undoStack.length > 0
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0
  }

  // ── Internal ────────────────────────────────────────────────────────────

  /** Deep clone a snapshot via structured clone (safe for plain data). */
  private clone(snapshot: CanvasSnapshot): CanvasSnapshot {
    return structuredClone(snapshot)
  }
}
