import type { Viewport } from '../types'

/**
 * DOM-based viewport controller.
 *
 * Architecture: a `shell` element captures pointer/wheel events while a nested
 * `world` element is CSS-transformed (`translate` + `scale`) to implement
 * pan & zoom. Every node is absolutely positioned inside `world`.
 */
export class ViewportManager {
  private shell: HTMLElement
  private world: HTMLElement
  private viewport: Viewport = { x: 0, y: 0, scale: 1 }

  // Pan tracking
  private isPanning = false
  private panButton = -1
  private panStartX = 0
  private panStartY = 0
  private panStartVpX = 0
  private panStartVpY = 0
  private didPan = false

  // Zoom limits
  private minScale = 0.05
  private maxScale = 5

  // Callbacks
  onChange?: (viewport: Viewport) => void
  onPanEnd?: () => void

  // Bound handlers (stored for cleanup)
  private handleWheel: (e: WheelEvent) => void
  private handlePointerDown: (e: PointerEvent) => void
  private handlePointerMove: (e: PointerEvent) => void
  private handlePointerUp: (e: PointerEvent) => void
  private handleContextMenu: (e: Event) => void

  constructor(shell: HTMLElement, world: HTMLElement) {
    this.shell = shell
    this.world = world

    // Bind handlers once so we can remove them on dispose
    this.handleWheel = this.onWheel.bind(this)
    this.handlePointerDown = this.onPointerDown.bind(this)
    this.handlePointerMove = this.onPointerMove.bind(this)
    this.handlePointerUp = this.onPointerUp.bind(this)
    this.handleContextMenu = (e: Event) => e.preventDefault()

    this.setupEvents()
    this.applyViewport()
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /** Write the current viewport transform to the world element's CSS */
  applyViewport(): void {
    const { x, y, scale } = this.viewport
    this.world.style.transform = `translate(${x}px, ${y}px) scale(${scale})`
  }

  /** Convert screen (client) coordinates to world coordinates */
  screenToWorld(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.shell.getBoundingClientRect()
    return {
      x: (clientX - rect.left - this.viewport.x) / this.viewport.scale,
      y: (clientY - rect.top - this.viewport.y) / this.viewport.scale,
    }
  }

  /** Convert world coordinates to screen (client) coordinates */
  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    const rect = this.shell.getBoundingClientRect()
    return {
      x: wx * this.viewport.scale + this.viewport.x + rect.left,
      y: wy * this.viewport.scale + this.viewport.y + rect.top,
    }
  }

  /**
   * Fit a set of node bounding boxes into view with padding.
   * If the array is empty the viewport is reset to the identity.
   */
  fitNodes(nodes: Array<{ x: number; y: number; w: number; h: number }>): void {
    if (nodes.length === 0) {
      this.viewport = { x: 0, y: 0, scale: 1 }
      this.applyViewport()
      this.emitChange()
      return
    }

    // Compute bounding box in world space
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity

    for (const n of nodes) {
      if (n.x < minX) minX = n.x
      if (n.y < minY) minY = n.y
      if (n.x + n.w > maxX) maxX = n.x + n.w
      if (n.y + n.h > maxY) maxY = n.y + n.h
    }

    const bboxW = maxX - minX
    const bboxH = maxY - minY

    const rect = this.shell.getBoundingClientRect()
    const padding = 80 // pixels of screen-space padding on each side

    const availW = rect.width - padding * 2
    const availH = rect.height - padding * 2

    if (availW <= 0 || availH <= 0) return

    const scaleX = availW / bboxW
    const scaleY = availH / bboxH
    const scale = Math.min(scaleX, scaleY, this.maxScale)
    const clampedScale = Math.max(this.minScale, Math.min(this.maxScale, scale))

    // Center the bounding box in the shell
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2

    this.viewport = {
      x: rect.width / 2 - cx * clampedScale,
      y: rect.height / 2 - cy * clampedScale,
      scale: clampedScale,
    }

    this.applyViewport()
    this.emitChange()
  }

  /** Center the viewport on a world-space point without changing scale */
  centerOn(wx: number, wy: number): void {
    const rect = this.shell.getBoundingClientRect()
    this.viewport.x = rect.width / 2 - wx * this.viewport.scale
    this.viewport.y = rect.height / 2 - wy * this.viewport.scale
    this.applyViewport()
    this.emitChange()
  }

  /** Return a snapshot of the current viewport */
  getViewport(): Viewport {
    return { ...this.viewport }
  }

  /** Merge partial viewport values and apply */
  setViewport(vp: Partial<Viewport>): void {
    if (vp.x !== undefined) this.viewport.x = vp.x
    if (vp.y !== undefined) this.viewport.y = vp.y
    if (vp.scale !== undefined) {
      this.viewport.scale = Math.max(this.minScale, Math.min(this.maxScale, vp.scale))
    }
    this.applyViewport()
    this.emitChange()
  }

  /** Whether the latest pointer-down sequence produced an actual drag */
  get wasPanning(): boolean {
    return this.didPan
  }

  /** Tear down all event listeners */
  dispose(): void {
    this.shell.removeEventListener('wheel', this.handleWheel)
    this.shell.removeEventListener('pointerdown', this.handlePointerDown)
    window.removeEventListener('pointermove', this.handlePointerMove)
    window.removeEventListener('pointerup', this.handlePointerUp)
    this.shell.removeEventListener('contextmenu', this.handleContextMenu)
  }

  // ── Private ─────────────────────────────────────────────────────────────

  private setupEvents(): void {
    // Passive: false for wheel so we can preventDefault to stop browser zoom
    this.shell.addEventListener('wheel', this.handleWheel, { passive: false })
    this.shell.addEventListener('pointerdown', this.handlePointerDown)
    // Pointer-move and pointer-up are on window so dragging beyond the shell still works
    window.addEventListener('pointermove', this.handlePointerMove)
    window.addEventListener('pointerup', this.handlePointerUp)
    this.shell.addEventListener('contextmenu', this.handleContextMenu)
  }

  /** Zoom toward / away from cursor using exponential factor */
  private onWheel(e: WheelEvent): void {
    e.preventDefault()

    const factor = Math.exp(-e.deltaY * 0.001)
    const newScale = Math.max(this.minScale, Math.min(this.maxScale, this.viewport.scale * factor))

    // Zoom toward cursor: keep the world-space point under the cursor fixed
    const rect = this.shell.getBoundingClientRect()
    const cursorX = e.clientX - rect.left
    const cursorY = e.clientY - rect.top

    // World-space point currently under cursor
    const wx = (cursorX - this.viewport.x) / this.viewport.scale
    const wy = (cursorY - this.viewport.y) / this.viewport.scale

    this.viewport.scale = newScale
    this.viewport.x = cursorX - wx * newScale
    this.viewport.y = cursorY - wy * newScale

    this.applyViewport()
    this.emitChange()
  }

  /**
   * Start panning on middle-click (button 1) or right-click (button 2).
   * Left-click (button 0) is reserved for node interactions.
   */
  private onPointerDown(e: PointerEvent): void {
    if (e.button !== 1 && e.button !== 2) return

    this.isPanning = true
    this.panButton = e.button
    this.panStartX = e.clientX
    this.panStartY = e.clientY
    this.panStartVpX = this.viewport.x
    this.panStartVpY = this.viewport.y
    this.didPan = false

    this.shell.setPointerCapture(e.pointerId)
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.isPanning) return

    const dx = e.clientX - this.panStartX
    const dy = e.clientY - this.panStartY

    // Only flag as a real pan once the cursor has moved a minimum distance
    if (!this.didPan && Math.hypot(dx, dy) > 3) {
      this.didPan = true
    }

    this.viewport.x = this.panStartVpX + dx
    this.viewport.y = this.panStartVpY + dy

    this.applyViewport()
    this.emitChange()
  }

  private onPointerUp(e: PointerEvent): void {
    if (!this.isPanning) return
    if (e.button !== this.panButton) return

    this.isPanning = false
    this.panButton = -1

    try {
      this.shell.releasePointerCapture(e.pointerId)
    } catch {
      // pointerId may already be released
    }

    if (this.didPan) {
      this.onPanEnd?.()
    }
  }

  private emitChange(): void {
    this.onChange?.({ ...this.viewport })
  }
}
