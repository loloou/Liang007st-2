// ─────────────────────────────────────────────────────────────────────────────
//  ObjectManager.ts — Manages all objects on the canvas
//
//  Responsibilities:
//   - Add/remove/update objects
//   - Z-order management
//   - Hit testing (top-down z-order)
//   - Batch operations
//   - Undo/redo support
// ─────────────────────────────────────────────────────────────────────────────

import { ImageObject, type ImageObjectData } from './ImageObject'

export class ObjectManager {
  private objects: Map<string, ImageObject> = new Map()
  private zOrder: string[] = [] // IDs in z-order (index 0 = bottom)
  private undoStack: ImageObjectData[][] = []
  private redoStack: ImageObjectData[][] = []
  private maxUndoSize = 50

  onChange?: () => void

  /** Get all objects sorted by z-order */
  getAll(): ImageObject[] {
    return this.zOrder.map(id => this.objects.get(id)!).filter(Boolean)
  }

  /** Get an object by ID */
  get(id: string): ImageObject | undefined {
    return this.objects.get(id)
  }

  /** Get object count */
  get count(): number {
    return this.objects.size
  }

  /** Add an object */
  add(data: Partial<ImageObjectData> & { id: string }): ImageObject {
    this.saveUndoState()
    const obj = new ImageObject({ ...data, zIndex: this.zOrder.length })
    this.objects.set(obj.data.id, obj)
    this.zOrder.push(obj.data.id)

    // Start loading image
    if (obj.data.imageUrl) {
      obj
        .loadImage()
        .then(() => this.onChange?.())
        .catch(() => this.onChange?.())
    }

    this.onChange?.()
    return obj
  }

  /** Remove an object by ID */
  remove(id: string): boolean {
    this.saveUndoState()
    const existed = this.objects.delete(id)
    this.zOrder = this.zOrder.filter(z => z !== id)
    this.reindexZOrder()
    if (existed) this.onChange?.()
    return existed
  }

  /** Remove multiple objects */
  removeMany(ids: string[]) {
    this.saveUndoState()
    const idSet = new Set(ids)
    for (const id of ids) this.objects.delete(id)
    this.zOrder = this.zOrder.filter(z => !idSet.has(z))
    this.reindexZOrder()
    this.onChange?.()
  }

  /** Update an object's data */
  update(id: string, patch: Partial<ImageObjectData>) {
    const obj = this.objects.get(id)
    if (!obj) return
    Object.assign(obj.data, patch)

    // If imageUrl changed, reload
    if (patch.imageUrl) {
      obj
        .loadImage()
        .then(() => this.onChange?.())
        .catch(() => this.onChange?.())
    }

    this.onChange?.()
  }

  /** Move objects by delta */
  moveMany(ids: string[], dx: number, dy: number) {
    for (const id of ids) {
      const obj = this.objects.get(id)
      if (obj && !obj.data.locked) {
        obj.data.x += dx
        obj.data.y += dy
      }
    }
    this.onChange?.()
  }

  /** Hit test: find the topmost object at a point */
  hitTest(cx: number, cy: number): ImageObject | null {
    // Test from top to bottom (reverse z-order)
    for (let i = this.zOrder.length - 1; i >= 0; i--) {
      const obj = this.objects.get(this.zOrder[i])
      if (obj && obj.hitTest(cx, cy)) return obj
    }
    return null
  }

  /** Bring object to front */
  bringToFront(id: string) {
    this.zOrder = this.zOrder.filter(z => z !== id)
    this.zOrder.push(id)
    this.reindexZOrder()
    this.onChange?.()
  }

  /** Send object to back */
  sendToBack(id: string) {
    this.zOrder = this.zOrder.filter(z => z !== id)
    this.zOrder.unshift(id)
    this.reindexZOrder()
    this.onChange?.()
  }

  /** Duplicate an object */
  duplicate(id: string): ImageObject | null {
    const obj = this.objects.get(id)
    if (!obj) return null

    const newId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const newData = {
      ...obj.data,
      id: newId,
      x: obj.data.x + 20,
      y: obj.data.y + 20,
    }
    return this.add(newData)
  }

  // ── Z-order ─────────────────────────────────────────────────────────────

  private reindexZOrder() {
    this.zOrder.forEach((id, i) => {
      const obj = this.objects.get(id)
      if (obj) obj.data.zIndex = i
    })
  }

  // ── Undo/Redo ─────────────────────────────────────────────────────────

  private saveUndoState() {
    const state = this.getAll().map(o => ({ ...o.data }))
    this.undoStack.push(state)
    if (this.undoStack.length > this.maxUndoSize) this.undoStack.shift()
    this.redoStack.length = 0 // Clear redo on new action
  }

  undo() {
    if (this.undoStack.length === 0) return
    // Save current as redo
    this.redoStack.push(this.getAll().map(o => ({ ...o.data })))

    const state = this.undoStack.pop()!
    this.restoreState(state)
  }

  redo() {
    if (this.redoStack.length === 0) return
    // Save current as undo
    this.undoStack.push(this.getAll().map(o => ({ ...o.data })))

    const state = this.redoStack.pop()!
    this.restoreState(state)
  }

  private restoreState(state: ImageObjectData[]) {
    this.objects.clear()
    this.zOrder = []
    for (const data of state) {
      const obj = new ImageObject(data)
      this.objects.set(data.id, obj)
      this.zOrder.push(data.id)
      if (data.imageUrl) {
        obj.loadImage().catch(() => {})
      }
    }
    this.onChange?.()
  }

  /** Get serializable data for all objects */
  serialize(): ImageObjectData[] {
    return this.getAll().map(o => ({ ...o.data }))
  }

  /** Load from serialized data */
  deserialize(data: ImageObjectData[]) {
    this.objects.clear()
    this.zOrder = []
    for (const d of data) {
      const obj = new ImageObject(d)
      this.objects.set(d.id, obj)
      this.zOrder.push(d.id)
      if (d.imageUrl) {
        obj
          .loadImage()
          .then(() => this.onChange?.())
          .catch(() => this.onChange?.())
      }
    }
    this.onChange?.()
  }

  /** Get all image URLs (for adapter interface) */
  getAllImageUrls(): string[] {
    const urls: string[] = []
    for (const obj of this.objects.values()) {
      if (obj.data.imageUrl) urls.push(obj.data.imageUrl)
    }
    return urls
  }
}
