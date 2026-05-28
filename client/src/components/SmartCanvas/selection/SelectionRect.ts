// ─────────────────────────────────────────────────────────────────────────────
//  SelectionRect.ts — Visual rubber-band rectangle rendering
//  (Integrated into SelectionManager.ts render method)
// ─────────────────────────────────────────────────────────────────────────────

export interface SelectionRectData {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Render a selection rectangle on the canvas
 */
export function renderSelectionRect(
  ctx: CanvasRenderingContext2D,
  rect: SelectionRectData,
  zoom: number,
) {
  ctx.fillStyle = 'rgba(99, 102, 241, 0.1)'
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height)
  ctx.strokeStyle = 'rgba(99, 102, 241, 0.5)'
  ctx.lineWidth = 1 / zoom
  ctx.setLineDash([4 / zoom, 4 / zoom])
  ctx.strokeRect(rect.x, rect.y, rect.width, rect.height)
  ctx.setLineDash([])
}
