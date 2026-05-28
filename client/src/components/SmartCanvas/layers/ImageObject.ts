// ─────────────────────────────────────────────────────────────────────────────
//  ImageObject.ts — Represents a single image on the canvas
//
//  Properties: position, size, rotation, z-order, opacity, lock state
//  Operations: drag, resize, rotate, select
// ─────────────────────────────────────────────────────────────────────────────

export type ImageObjectStatus = 'idle' | 'loading' | 'generating' | 'error'

export interface ImageObjectData {
  id: string
  type: 'image'
  x: number
  y: number
  width: number
  height: number
  rotation: number
  zIndex: number
  opacity: number
  locked: boolean

  // Image data
  imageUrl: string // data URL, file URL, or cloud URL
  thumbnailUrl?: string
  originalUrl?: string

  // Generation metadata
  prompt?: string
  model?: string
  status: ImageObjectStatus
  progress?: number // 0-100 for generating
  error?: string
  taskId?: string

  // Asset library link
  assetId?: string
}

export class ImageObject {
  data: ImageObjectData
  private _imgElement: HTMLImageElement | null = null
  private _loaded = false
  private _loadError = false

  constructor(data: Partial<ImageObjectData> & { id: string }) {
    this.data = {
      type: 'image',
      x: 0,
      y: 0,
      width: 512,
      height: 512,
      rotation: 0,
      zIndex: 0,
      opacity: 1,
      locked: false,
      imageUrl: '',
      status: 'idle',
      ...data,
    }
  }

  /** Load the image for rendering */
  loadImage(): Promise<HTMLImageElement> {
    if (this._imgElement && this._loaded) return Promise.resolve(this._imgElement)

    return new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        this._imgElement = img
        this._loaded = true
        this._loadError = false
        // Auto-set dimensions from image if not specified
        if (this.data.width <= 0) this.data.width = img.naturalWidth
        if (this.data.height <= 0) this.data.height = img.naturalHeight
        resolve(img)
      }
      img.onerror = () => {
        this._loadError = true
        reject(new Error('Failed to load image'))
      }
      img.src = this.data.imageUrl
    })
  }

  /** Check if a point (canvas-space) hits this object */
  hitTest(cx: number, cy: number): boolean {
    if (this.data.rotation !== 0) {
      // Rotate point into object's local space
      const centerX = this.data.x + this.data.width / 2
      const centerY = this.data.y + this.data.height / 2
      const rad = (-this.data.rotation * Math.PI) / 180
      const cos = Math.cos(rad)
      const sin = Math.sin(rad)
      const dx = cx - centerX
      const dy = cy - centerY
      const lx = dx * cos - dy * sin + centerX
      const ly = dx * sin + dy * cos + centerY
      return (
        lx >= this.data.x &&
        lx <= this.data.x + this.data.width &&
        ly >= this.data.y &&
        ly <= this.data.y + this.data.height
      )
    }
    return (
      cx >= this.data.x &&
      cx <= this.data.x + this.data.width &&
      cy >= this.data.y &&
      cy <= this.data.y + this.data.height
    )
  }

  /** Render this object onto the canvas context */
  render(ctx: CanvasRenderingContext2D) {
    ctx.save()
    ctx.globalAlpha = this.data.opacity

    // Apply rotation around center
    if (this.data.rotation !== 0) {
      const cx = this.data.x + this.data.width / 2
      const cy = this.data.y + this.data.height / 2
      ctx.translate(cx, cy)
      ctx.rotate((this.data.rotation * Math.PI) / 180)
      ctx.translate(-cx, -cy)
    }

    if (this._loaded && this._imgElement) {
      ctx.drawImage(this._imgElement, this.data.x, this.data.y, this.data.width, this.data.height)
    } else if (this.data.status === 'generating') {
      this.renderGeneratingPlaceholder(ctx)
    } else if (this._loadError || this.data.status === 'error') {
      this.renderErrorPlaceholder(ctx)
    } else {
      this.renderLoadingPlaceholder(ctx)
    }

    ctx.restore()
  }

  private renderGeneratingPlaceholder(ctx: CanvasRenderingContext2D) {
    const { x, y, width, height, progress } = this.data
    // Background
    ctx.fillStyle = 'rgba(15, 23, 42, 0.8)'
    ctx.fillRect(x, y, width, height)
    ctx.strokeStyle = 'rgba(99, 102, 241, 0.5)'
    ctx.lineWidth = 2
    ctx.strokeRect(x, y, width, height)

    // Progress ring
    const cx = x + width / 2
    const cy = y + height / 2
    const radius = Math.min(width, height) * 0.15
    const pct = (progress || 0) / 100

    ctx.beginPath()
    ctx.arc(cx, cy, radius, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(99, 102, 241, 0.2)'
    ctx.lineWidth = 4
    ctx.stroke()

    if (pct > 0) {
      ctx.beginPath()
      ctx.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct)
      ctx.strokeStyle = '#6366f1'
      ctx.lineWidth = 4
      ctx.stroke()
    }

    // Text
    ctx.fillStyle = '#94a3b8'
    ctx.font = `${Math.max(12, Math.min(16, width * 0.04))}px sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText(`${Math.round(progress || 0)}%`, cx, cy + radius + 24)
    ctx.fillText('Generating...', cx, cy + radius + 44)
  }

  private renderErrorPlaceholder(ctx: CanvasRenderingContext2D) {
    const { x, y, width, height, error } = this.data
    ctx.fillStyle = 'rgba(15, 23, 42, 0.8)'
    ctx.fillRect(x, y, width, height)
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)'
    ctx.lineWidth = 2
    ctx.strokeRect(x, y, width, height)

    const cx = x + width / 2
    const cy = y + height / 2
    ctx.fillStyle = '#ef4444'
    ctx.font = `${Math.max(14, Math.min(20, width * 0.05))}px sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText('Error', cx, cy - 10)

    if (error) {
      ctx.fillStyle = '#94a3b8'
      ctx.font = `${Math.max(10, Math.min(14, width * 0.03))}px sans-serif`
      const truncated = error.length > 60 ? error.slice(0, 57) + '...' : error
      ctx.fillText(truncated, cx, cy + 15)
    }

    ctx.fillStyle = 'rgba(99, 102, 241, 0.8)'
    ctx.font = `${Math.max(11, Math.min(14, width * 0.035))}px sans-serif`
    ctx.fillText('Click to retry', cx, cy + 40)
  }

  private renderLoadingPlaceholder(ctx: CanvasRenderingContext2D) {
    const { x, y, width, height } = this.data
    ctx.fillStyle = 'rgba(15, 23, 42, 0.6)'
    ctx.fillRect(x, y, width, height)
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)'
    ctx.lineWidth = 1
    ctx.setLineDash([5, 5])
    ctx.strokeRect(x, y, width, height)
    ctx.setLineDash([])

    ctx.fillStyle = '#64748b'
    ctx.font = `${Math.max(12, Math.min(16, width * 0.04))}px sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText('Loading...', x + width / 2, y + height / 2)
  }

  /** Get the bounding box */
  getBounds(): { x: number; y: number; width: number; height: number } {
    return { x: this.data.x, y: this.data.y, width: this.data.width, height: this.data.height }
  }

  /** Clone this object with a new ID */
  clone(newId: string): ImageObject {
    return new ImageObject({ ...this.data, id: newId })
  }

  /** Check if image is loaded */
  get isLoaded(): boolean {
    return this._loaded
  }

  /** Get the cached HTMLImageElement */
  get imageElement(): HTMLImageElement | null {
    return this._imgElement
  }
}
