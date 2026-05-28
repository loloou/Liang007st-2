// ─────────────────────────────────────────────────────────────────────────────
//  CanvasEngine.ts — Core raw Canvas2D engine: infinite zoom/pan, render loop
//
//  Features:
//   - Infinite zoom (0.1x - 10x) with smooth animation
//   - Pan with momentum/inertia via Space+drag or middle mouse
//   - Grid background (density adapts to zoom level)
//   - Coordinate transform helpers (screen ↔ canvas)
//   - requestAnimationFrame render loop with dirty-flag optimization
// ─────────────────────────────────────────────────────────────────────────────

export interface Viewport {
  x: number
  y: number
  zoom: number
}

export interface CanvasSize {
  width: number
  height: number
}

export type RenderCallback = (
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  canvasSize: CanvasSize,
) => void

export class CanvasEngine {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private viewport: Viewport = { x: 0, y: 0, zoom: 1 }
  private canvasSize: CanvasSize = { width: 0, height: 0 }

  private dirty = true
  private rafId: number | null = null
  private renderCallbacks: RenderCallback[] = []

  // Pan state
  private isPanning = false
  private panStartX = 0
  private panStartY = 0
  private panStartViewX = 0
  private panStartViewY = 0
  private panButton = -1 // Track which button initiated pan

  // Momentum (velocity-based)
  private lastMouseX = 0
  private lastMouseY = 0
  private lastMouseTime = 0
  private momentumVx = 0
  private momentumVy = 0
  private momentumTimer: number | null = null

  // Space key state for pan mode
  private spaceDown = false

  // Grid
  private showGrid = true
  private gridColor = 'rgba(255,255,255,0.05)'

  // Zoom limits
  private minZoom = 0.1
  private maxZoom = 10

  // DPR
  private dpr = 1

  // External handlers
  onViewportChange?: (viewport: Viewport) => void

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Failed to get canvas 2d context')
    this.ctx = ctx
    this.dpr = window.devicePixelRatio || 1

    this.resize()
    this.setupEventListeners()
    this.startRenderLoop()
  }

  // ── Public API ──────────────────────────────────────────────────────────

  getViewport(): Viewport {
    return { ...this.viewport }
  }

  setViewport(vp: Partial<Viewport>) {
    if (vp.x !== undefined) this.viewport.x = vp.x
    if (vp.y !== undefined) this.viewport.y = vp.y
    if (vp.zoom !== undefined)
      this.viewport.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, vp.zoom))
    this.markDirty()
    this.onViewportChange?.(this.getViewport())
  }

  addRenderCallback(cb: RenderCallback) {
    this.renderCallbacks.push(cb)
    this.markDirty()
  }

  removeRenderCallback(cb: RenderCallback) {
    this.renderCallbacks = this.renderCallbacks.filter(c => c !== cb)
  }

  markDirty() {
    this.dirty = true
  }

  /** Convert screen coordinates to canvas-space coordinates */
  screenToCanvas(sx: number, sy: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect()
    return {
      x: (sx - rect.left) / this.viewport.zoom + this.viewport.x,
      y: (sy - rect.top) / this.viewport.zoom + this.viewport.y,
    }
  }

  /** Convert canvas-space coordinates to screen coordinates */
  canvasToScreen(cx: number, cy: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect()
    return {
      x: (cx - this.viewport.x) * this.viewport.zoom + rect.left,
      y: (cy - this.viewport.y) * this.viewport.zoom + rect.top,
    }
  }

  getCanvasSize(): CanvasSize {
    return { ...this.canvasSize }
  }

  setGridVisible(v: boolean) {
    this.showGrid = v
    this.markDirty()
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect()
    this.dpr = window.devicePixelRatio || 1
    this.canvas.width = rect.width * this.dpr
    this.canvas.height = rect.height * this.dpr
    this.canvasSize = { width: rect.width, height: rect.height }
    this.markDirty()
  }

  dispose() {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId)
    if (this.momentumTimer !== null) cancelAnimationFrame(this.momentumTimer)
    this.removeEventListeners()
  }

  // ── Render Loop ─────────────────────────────────────────────────────────

  private startRenderLoop() {
    const loop = () => {
      this.rafId = requestAnimationFrame(loop)
      if (!this.dirty) return
      this.dirty = false
      this.render()
    }
    this.rafId = requestAnimationFrame(loop)
  }

  private render() {
    const ctx = this.ctx
    const w = this.canvas.width
    const h = this.canvas.height
    const dpr = this.dpr

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w / dpr, h / dpr)

    // Background
    ctx.fillStyle = '#0a0a0f'
    ctx.fillRect(0, 0, w / dpr, h / dpr)

    // Grid
    if (this.showGrid) this.renderGrid(ctx)

    // Apply viewport transform
    ctx.save()
    ctx.translate(-this.viewport.x * this.viewport.zoom, -this.viewport.y * this.viewport.zoom)
    ctx.scale(this.viewport.zoom, this.viewport.zoom)

    // Render objects
    for (const cb of this.renderCallbacks) {
      cb(ctx, this.viewport, this.canvasSize)
    }

    ctx.restore()
  }

  private renderGrid(ctx: CanvasRenderingContext2D) {
    const zoom = this.viewport.zoom
    // Adaptive grid spacing: 50px at zoom=1, adjusts with zoom
    let gridSize = 50
    if (zoom < 0.3) gridSize = 200
    else if (zoom < 0.7) gridSize = 100
    else if (zoom > 3) gridSize = 25
    else if (zoom > 6) gridSize = 10

    const startX = Math.floor(this.viewport.x / gridSize) * gridSize
    const startY = Math.floor(this.viewport.y / gridSize) * gridSize
    const endX = this.viewport.x + this.canvasSize.width / zoom
    const endY = this.viewport.y + this.canvasSize.height / zoom

    ctx.save()
    ctx.strokeStyle = this.gridColor
    ctx.lineWidth = 1 / this.dpr
    ctx.beginPath()

    for (let x = startX; x <= endX; x += gridSize) {
      const sx = (x - this.viewport.x) * zoom
      ctx.moveTo(sx, 0)
      ctx.lineTo(sx, this.canvasSize.height)
    }
    for (let y = startY; y <= endY; y += gridSize) {
      const sy = (y - this.viewport.y) * zoom
      ctx.moveTo(0, sy)
      ctx.lineTo(this.canvasSize.width, sy)
    }

    ctx.stroke()
    ctx.restore()
  }

  // ── Event Handling ──────────────────────────────────────────────────────

  private boundHandlers: Record<string, EventListener> = {}

  private setupEventListeners() {
    const h = {
      wheel: this.onWheel.bind(this) as EventListener,
      mousedown: this.onMouseDown.bind(this) as EventListener,
      mousemove: this.onMouseMove.bind(this) as EventListener,
      mouseup: this.onMouseUp.bind(this) as EventListener,
      keydown: this.onKeyDown.bind(this) as EventListener,
      keyup: this.onKeyUp.bind(this) as EventListener,
      resize: this.resize.bind(this) as EventListener,
    }
    this.boundHandlers = h

    this.canvas.addEventListener('wheel', h.wheel, { passive: false })
    this.canvas.addEventListener('mousedown', h.mousedown)
    window.addEventListener('mousemove', h.mousemove)
    window.addEventListener('mouseup', h.mouseup)
    window.addEventListener('keydown', h.keydown)
    window.addEventListener('keyup', h.keyup)
    window.addEventListener('resize', h.resize)
  }

  private removeEventListeners() {
    const h = this.boundHandlers
    this.canvas.removeEventListener('wheel', h.wheel)
    this.canvas.removeEventListener('mousedown', h.mousedown)
    window.removeEventListener('mousemove', h.mousemove)
    window.removeEventListener('mouseup', h.mouseup)
    window.removeEventListener('keydown', h.keydown)
    window.removeEventListener('keyup', h.keyup)
    window.removeEventListener('resize', h.resize)
  }

  private onWheel(e: WheelEvent) {
    e.preventDefault()
    const rect = this.canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top

    // World position before zoom
    const wx = mx / this.viewport.zoom + this.viewport.x
    const wy = my / this.viewport.zoom + this.viewport.y

    // Zoom
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1
    const newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.viewport.zoom * zoomFactor))

    // Adjust viewport so the point under cursor stays fixed
    this.viewport.zoom = newZoom
    this.viewport.x = wx - mx / newZoom
    this.viewport.y = wy - my / newZoom

    this.markDirty()
    this.onViewportChange?.(this.getViewport())
  }

  private onMouseDown(e: MouseEvent) {
    // Middle button or Space+Left = pan
    if (e.button === 1 || (e.button === 0 && this.spaceDown)) {
      this.isPanning = true
      this.panButton = e.button
      this.panStartX = e.clientX
      this.panStartY = e.clientY
      this.panStartViewX = this.viewport.x
      this.panStartViewY = this.viewport.y
      this.lastMouseX = e.clientX
      this.lastMouseY = e.clientY
      this.lastMouseTime = performance.now()
      this.momentumVx = 0
      this.momentumVy = 0
      this.stopMomentum()
      e.preventDefault()
    }
  }

  private onMouseMove(e: MouseEvent) {
    if (this.isPanning) {
      const dx = e.clientX - this.panStartX
      const dy = e.clientY - this.panStartY
      this.viewport.x = this.panStartViewX - dx / this.viewport.zoom
      this.viewport.y = this.panStartViewY - dy / this.viewport.zoom

      // Compute velocity from last frame delta (not total displacement)
      const now = performance.now()
      const dt = Math.max(1, now - this.lastMouseTime) / 1000
      const vx = (e.clientX - this.lastMouseX) / this.viewport.zoom / dt
      const vy = (e.clientY - this.lastMouseY) / this.viewport.zoom / dt
      // Smooth velocity with exponential moving average
      this.momentumVx = this.momentumVx * 0.5 + -vx * 0.5
      this.momentumVy = this.momentumVy * 0.5 + -vy * 0.5
      this.lastMouseX = e.clientX
      this.lastMouseY = e.clientY
      this.lastMouseTime = now

      this.markDirty()
      this.onViewportChange?.(this.getViewport())
    }
  }

  private onMouseUp(e: MouseEvent) {
    // Only end pan if the same button that started it is released
    if (this.isPanning && e.button === this.panButton) {
      this.isPanning = false
      this.panButton = -1
      // Start momentum animation
      if (Math.abs(this.momentumVx) > 0.5 || Math.abs(this.momentumVy) > 0.5) {
        this.startMomentum()
      }
    }
  }

  private onKeyDown(e: KeyboardEvent) {
    if (e.code === 'Space' && !this.spaceDown) {
      this.spaceDown = true
      this.canvas.style.cursor = 'grab'
    }
  }

  private onKeyUp(e: KeyboardEvent) {
    if (e.code === 'Space') {
      this.spaceDown = false
      this.canvas.style.cursor = 'default'
    }
  }

  // ── Momentum ────────────────────────────────────────────────────────────

  private startMomentum() {
    const decay = 0.92
    let lastTime = performance.now()
    const tick = () => {
      const now = performance.now()
      const dt = Math.min(0.05, (now - lastTime) / 1000) // Clamp to 50ms max
      lastTime = now
      this.momentumVx *= decay
      this.momentumVy *= decay
      if (Math.abs(this.momentumVx) < 0.1 && Math.abs(this.momentumVy) < 0.1) return
      this.viewport.x += this.momentumVx * dt
      this.viewport.y += this.momentumVy * dt
      this.markDirty()
      this.momentumTimer = requestAnimationFrame(tick)
    }
    this.momentumTimer = requestAnimationFrame(tick)
  }

  private stopMomentum() {
    if (this.momentumTimer !== null) {
      cancelAnimationFrame(this.momentumTimer)
      this.momentumTimer = null
    }
    this.momentumVx = 0
    this.momentumVy = 0
  }
}
