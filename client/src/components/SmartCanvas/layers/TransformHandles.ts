// ─────────────────────────────────────────────────────────────────────────────
//  TransformHandles.ts — Render and handle resize/rotate transform controls
// ─────────────────────────────────────────────────────────────────────────────

import type { ImageObject } from './ImageObject'

export type HandleType = 'tl' | 'tr' | 'bl' | 'br' | 'rotate' | 'none'

const HANDLE_SIZE = 8
const HANDLE_COLOR = '#6366f1'
const HANDLE_BORDER = '#ffffff'
const ROTATE_HANDLE_OFFSET = 24

export class TransformHandles {
  /** Get the handle positions for an object */
  static getHandles(obj: ImageObject): { type: HandleType; x: number; y: number }[] {
    const { x, y, width, height } = obj.data
    return [
      { type: 'tl', x: x, y: y },
      { type: 'tr', x: x + width, y: y },
      { type: 'bl', x: x, y: y + height },
      { type: 'br', x: x + width, y: y + height },
      { type: 'rotate', x: x + width / 2, y: y - ROTATE_HANDLE_OFFSET },
    ]
  }

  /** Hit test handles for an object, returns handle type or 'none' */
  static hitTestHandle(obj: ImageObject, cx: number, cy: number, zoom: number): HandleType {
    const threshold = (HANDLE_SIZE + 4) / zoom
    const handles = TransformHandles.getHandles(obj)

    for (const h of handles) {
      if (Math.abs(cx - h.x) <= threshold && Math.abs(cy - h.y) <= threshold) {
        return h.type as HandleType
      }
    }
    return 'none'
  }

  /** Render transform handles for an object */
  static render(ctx: CanvasRenderingContext2D, obj: ImageObject, zoom: number) {
    const { x, y, width, height, rotation } = obj.data
    const handleSize = HANDLE_SIZE / zoom

    ctx.save()

    // Apply rotation
    if (rotation !== 0) {
      const cx = x + width / 2
      const cy = y + height / 2
      ctx.translate(cx, cy)
      ctx.rotate((rotation * Math.PI) / 180)
      ctx.translate(-cx, -cy)
    }

    // Selection border
    ctx.strokeStyle = HANDLE_COLOR
    ctx.lineWidth = 2 / zoom
    ctx.setLineDash([6 / zoom, 4 / zoom])
    ctx.strokeRect(x, y, width, height)
    ctx.setLineDash([])

    // Corner handles
    const corners = [
      { x: x, y: y },
      { x: x + width, y: y },
      { x: x, y: y + height },
      { x: x + width, y: y + height },
    ]

    for (const c of corners) {
      ctx.fillStyle = HANDLE_COLOR
      ctx.strokeStyle = HANDLE_BORDER
      ctx.lineWidth = 1.5 / zoom
      ctx.fillRect(c.x - handleSize / 2, c.y - handleSize / 2, handleSize, handleSize)
      ctx.strokeRect(c.x - handleSize / 2, c.y - handleSize / 2, handleSize, handleSize)
    }

    // Rotate handle
    const rotateCx = x + width / 2
    const rotateCy = y - ROTATE_HANDLE_OFFSET / zoom

    // Line from top center to rotate handle
    ctx.beginPath()
    ctx.moveTo(x + width / 2, y)
    ctx.lineTo(rotateCx, rotateCy)
    ctx.strokeStyle = HANDLE_COLOR
    ctx.lineWidth = 1.5 / zoom
    ctx.stroke()

    // Rotate handle circle
    ctx.beginPath()
    ctx.arc(rotateCx, rotateCy, handleSize * 0.7, 0, Math.PI * 2)
    ctx.fillStyle = HANDLE_COLOR
    ctx.fill()
    ctx.strokeStyle = HANDLE_BORDER
    ctx.lineWidth = 1.5 / zoom
    ctx.stroke()

    ctx.restore()
  }

  /** Get cursor style for a handle type */
  static getCursor(handleType: HandleType): string {
    switch (handleType) {
      case 'tl':
        return 'nwse-resize'
      case 'tr':
        return 'nesw-resize'
      case 'bl':
        return 'nesw-resize'
      case 'br':
        return 'nwse-resize'
      case 'rotate':
        return 'grab'
      default:
        return 'default'
    }
  }
}
