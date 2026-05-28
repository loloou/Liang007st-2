// ─────────────────────────────────────────────────────────────────────────────
//  SelectionManager.ts — Multi-select with rubber-band selection
// ─────────────────────────────────────────────────────────────────────────────

import { ObjectManager } from '../layers/ObjectManager'
import { TransformHandles, type HandleType } from '../layers/TransformHandles'
import type { ImageObject } from '../layers/ImageObject'
import type { CanvasEngine, Viewport, CanvasSize } from '../CanvasEngine'

export class SelectionManager {
  private selectedIds: Set<string> = new Set()
  private objectManager: ObjectManager
  private engine: CanvasEngine

  // Rubber-band state
  private isRubberBanding = false
  private rubberBandStart = { x: 0, y: 0 }
  private rubberBandEnd = { x: 0, y: 0 }

  // Drag state
  private isDragging = false
  private dragStartX = 0
  private dragStartY = 0
  private dragLastX = 0
  private dragLastY = 0

  // Resize state
  private isResizing = false
  private resizeHandle: HandleType = 'none'
  private resizeStartBounds = { x: 0, y: 0, w: 0, h: 0 }
  private resizeAnchorX = 0
  private resizeAnchorY = 0

  // Rotate state
  private isRotating = false
  private rotateStartAngle = 0
  private rotateCenterX = 0
  private rotateCenterY = 0

  onChange?: () => void

  constructor(objectManager: ObjectManager, engine: CanvasEngine) {
    this.objectManager = objectManager
    this.engine = engine
  }

  // ── Public API ──────────────────────────────────────────────────────────

  getSelected(): string[] {
    return [...this.selectedIds]
  }

  getSelectedObjects(): ImageObject[] {
    return this.getSelected()
      .map(id => this.objectManager.get(id))
      .filter(Boolean) as ImageObject[]
  }

  isSelected(id: string): boolean {
    return this.selectedIds.has(id)
  }

  get count(): number {
    return this.selectedIds.size
  }

  select(id: string, additive = false) {
    if (!additive) this.selectedIds.clear()
    this.selectedIds.add(id)
    this.onChange?.()
  }

  deselect(id: string) {
    this.selectedIds.delete(id)
    this.onChange?.()
  }

  toggleSelect(id: string) {
    if (this.selectedIds.has(id)) this.selectedIds.delete(id)
    else this.selectedIds.add(id)
    this.onChange?.()
  }

  selectAll() {
    for (const obj of this.objectManager.getAll()) {
      this.selectedIds.add(obj.data.id)
    }
    this.onChange?.()
  }

  clearSelection() {
    if (this.selectedIds.size === 0) return
    this.selectedIds.clear()
    this.onChange?.()
  }

  deleteSelected() {
    if (this.selectedIds.size === 0) return
    this.objectManager.removeMany([...this.selectedIds])
    this.selectedIds.clear()
    this.onChange?.()
  }

  duplicateSelected() {
    const newIds: string[] = []
    for (const id of this.selectedIds) {
      const obj = this.objectManager.duplicate(id)
      if (obj) newIds.push(obj.data.id)
    }
    this.selectedIds.clear()
    for (const id of newIds) this.selectedIds.add(id)
    this.onChange?.()
  }

  // ── Mouse interaction ─────────────────────────────────────────────────

  handleMouseDown(cx: number, cy: number, shiftKey: boolean): boolean {
    // Check if clicking on a transform handle of selected object
    if (this.selectedIds.size === 1) {
      const obj = this.objectManager.get([...this.selectedIds][0])
      if (obj) {
        const handle = TransformHandles.hitTestHandle(obj, cx, cy, this.engine.getViewport().zoom)
        if (handle !== 'none') {
          if (handle === 'rotate') {
            this.startRotate(obj, cx, cy)
          } else {
            this.startResize(obj, handle, cx, cy)
          }
          return true
        }
      }
    }

    // Hit test objects
    const hit = this.objectManager.hitTest(cx, cy)
    if (hit) {
      if (shiftKey) {
        this.toggleSelect(hit.data.id)
      } else if (!this.selectedIds.has(hit.data.id)) {
        this.select(hit.data.id)
      }

      if (!hit.data.locked) {
        this.startDrag(cx, cy)
      }
      return true
    }

    // Start rubber-band selection
    if (!shiftKey) this.clearSelection()
    this.isRubberBanding = true
    this.rubberBandStart = { x: cx, y: cy }
    this.rubberBandEnd = { x: cx, y: cy }
    return false
  }

  handleMouseMove(cx: number, cy: number): string {
    if (this.isDragging) {
      const dx = cx - this.dragLastX
      const dy = cy - this.dragLastY
      this.objectManager.moveMany([...this.selectedIds], dx, dy)
      this.dragLastX = cx
      this.dragLastY = cy
      return 'move'
    }

    if (this.isResizing) {
      this.doResize(cx, cy)
      return 'resize'
    }

    if (this.isRotating) {
      this.doRotate(cx, cy)
      return 'rotate'
    }

    if (this.isRubberBanding) {
      this.rubberBandEnd = { x: cx, y: cy }
      this.updateRubberBandSelection()
      this.onChange?.()
      return 'rubberband'
    }

    // Cursor hint: check hover over handles
    if (this.selectedIds.size === 1) {
      const obj = this.objectManager.get([...this.selectedIds][0])
      if (obj) {
        const handle = TransformHandles.hitTestHandle(obj, cx, cy, this.engine.getViewport().zoom)
        if (handle !== 'none') return 'handle:' + handle
      }
    }

    // Check hover over objects
    const hover = this.objectManager.hitTest(cx, cy)
    if (hover) return 'hover'

    return 'none'
  }

  handleMouseUp(): void {
    this.isDragging = false
    this.isResizing = false
    this.isRotating = false

    if (this.isRubberBanding) {
      this.isRubberBanding = false
      this.onChange?.()
    }
  }

  // ── Drag ────────────────────────────────────────────────────────────────

  private startDrag(cx: number, cy: number) {
    this.isDragging = true
    this.dragStartX = cx
    this.dragStartY = cy
    this.dragLastX = cx
    this.dragLastY = cy
  }

  // ── Resize ──────────────────────────────────────────────────────────────

  private startResize(obj: ImageObject, handle: HandleType, _cx: number, _cy: number) {
    this.isResizing = true
    this.resizeHandle = handle
    this.resizeStartBounds = { x: obj.data.x, y: obj.data.y, w: obj.data.width, h: obj.data.height }

    // Anchor is the opposite corner
    switch (handle) {
      case 'tl':
        this.resizeAnchorX = obj.data.x + obj.data.width
        this.resizeAnchorY = obj.data.y + obj.data.height
        break
      case 'tr':
        this.resizeAnchorX = obj.data.x
        this.resizeAnchorY = obj.data.y + obj.data.height
        break
      case 'bl':
        this.resizeAnchorX = obj.data.x + obj.data.width
        this.resizeAnchorY = obj.data.y
        break
      case 'br':
        this.resizeAnchorX = obj.data.x
        this.resizeAnchorY = obj.data.y
        break
    }
  }

  private doResize(cx: number, cy: number) {
    if (this.selectedIds.size !== 1) return
    const obj = this.objectManager.get([...this.selectedIds][0])
    if (!obj) return

    const aspect = this.resizeStartBounds.w / this.resizeStartBounds.h

    let newX = Math.min(cx, this.resizeAnchorX)
    let newY = Math.min(cy, this.resizeAnchorY)
    let newW = Math.abs(cx - this.resizeAnchorX)
    let newH = Math.abs(cy - this.resizeAnchorY)

    // Maintain aspect ratio
    if (newW / newH > aspect) {
      newW = newH * aspect
    } else {
      newH = newW / aspect
    }

    // Minimum size
    newW = Math.max(newW, 20)
    newH = Math.max(newH, 20)

    // Adjust position based on anchor
    if (this.resizeHandle === 'tl' || this.resizeHandle === 'bl') {
      newX = this.resizeAnchorX - newW
    } else {
      newX = this.resizeAnchorX
    }
    if (this.resizeHandle === 'tl' || this.resizeHandle === 'tr') {
      newY = this.resizeAnchorY - newH
    } else {
      newY = this.resizeAnchorY
    }

    obj.data.x = newX
    obj.data.y = newY
    obj.data.width = newW
    obj.data.height = newH
    this.onChange?.()
  }

  // ── Rotate ──────────────────────────────────────────────────────────────

  private startRotate(obj: ImageObject, cx: number, cy: number) {
    this.isRotating = true
    this.rotateCenterX = obj.data.x + obj.data.width / 2
    this.rotateCenterY = obj.data.y + obj.data.height / 2
    this.rotateStartAngle =
      (Math.atan2(cy - this.rotateCenterY, cx - this.rotateCenterX) * 180) / Math.PI -
      obj.data.rotation
  }

  private doRotate(cx: number, cy: number) {
    if (this.selectedIds.size !== 1) return
    const obj = this.objectManager.get([...this.selectedIds][0])
    if (!obj) return

    const angle = (Math.atan2(cy - this.rotateCenterY, cx - this.rotateCenterX) * 180) / Math.PI
    obj.data.rotation = angle - this.rotateStartAngle
    this.onChange?.()
  }

  // ── Rubber-band ─────────────────────────────────────────────────────────

  private updateRubberBandSelection() {
    const minX = Math.min(this.rubberBandStart.x, this.rubberBandEnd.x)
    const minY = Math.min(this.rubberBandStart.y, this.rubberBandEnd.y)
    const maxX = Math.max(this.rubberBandStart.x, this.rubberBandEnd.x)
    const maxY = Math.max(this.rubberBandStart.y, this.rubberBandEnd.y)

    this.selectedIds.clear()
    for (const obj of this.objectManager.getAll()) {
      const b = obj.getBounds()
      if (b.x + b.width >= minX && b.x <= maxX && b.y + b.height >= minY && b.y <= maxY) {
        this.selectedIds.add(obj.data.id)
      }
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────

  render(ctx: CanvasRenderingContext2D, viewport: Viewport, _canvasSize: CanvasSize) {
    const zoom = viewport.zoom

    // Render selection handles on selected objects
    for (const id of this.selectedIds) {
      const obj = this.objectManager.get(id)
      if (obj) {
        TransformHandles.render(ctx, obj, zoom)
      }
    }

    // Render rubber-band rectangle
    if (this.isRubberBanding) {
      const minX = Math.min(this.rubberBandStart.x, this.rubberBandEnd.x)
      const minY = Math.min(this.rubberBandStart.y, this.rubberBandEnd.y)
      const w = Math.abs(this.rubberBandEnd.x - this.rubberBandStart.x)
      const h = Math.abs(this.rubberBandEnd.y - this.rubberBandStart.y)

      ctx.fillStyle = 'rgba(99, 102, 241, 0.1)'
      ctx.fillRect(minX, minY, w, h)
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.5)'
      ctx.lineWidth = 1 / zoom
      ctx.setLineDash([4 / zoom, 4 / zoom])
      ctx.strokeRect(minX, minY, w, h)
      ctx.setLineDash([])
    }
  }
}
