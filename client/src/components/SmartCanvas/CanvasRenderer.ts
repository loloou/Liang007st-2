// ─────────────────────────────────────────────────────────────────────────────
//  CanvasRenderer.ts — Additional render helpers for canvas
//
//  Provides utility rendering functions used by the CanvasEngine.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Render a rounded rectangle
 */
export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.arcTo(x + w, y, x + w, y + r, r)
  ctx.lineTo(x + w, y + h - r)
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
  ctx.lineTo(x + r, y + h)
  ctx.arcTo(x, y + h, x, y + h - r, r)
  ctx.lineTo(x, y + r)
  ctx.arcTo(x, y, x + r, y, r)
  ctx.closePath()
}

/**
 * Render text with word wrapping
 */
export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): number {
  const words = text.split(' ')
  let line = ''
  let lineCount = 0

  for (const word of words) {
    const testLine = line + (line ? ' ' : '') + word
    const metrics = ctx.measureText(testLine)
    if (metrics.width > maxWidth && line) {
      ctx.fillText(line, x, y + lineCount * lineHeight)
      line = word
      lineCount++
    } else {
      line = testLine
    }
  }
  ctx.fillText(line, x, y + lineCount * lineHeight)
  return lineCount + 1
}

/**
 * Render a progress indicator (animated ring)
 */
export function renderProgressRing(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  progress: number, // 0-100
  color = '#6366f1',
  bgColor = 'rgba(99, 102, 241, 0.2)',
  lineWidth = 4,
) {
  const pct = Math.max(0, Math.min(100, progress)) / 100

  // Background ring
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.strokeStyle = bgColor
  ctx.lineWidth = lineWidth
  ctx.stroke()

  // Progress arc
  if (pct > 0) {
    ctx.beginPath()
    ctx.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct)
    ctx.strokeStyle = color
    ctx.lineWidth = lineWidth
    ctx.lineCap = 'round'
    ctx.stroke()
    ctx.lineCap = 'butt'
  }
}
