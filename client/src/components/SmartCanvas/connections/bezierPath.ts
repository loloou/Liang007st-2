// ─────────────────────────────────────────────────────────────────────────────
//  bezierPath.ts — Cubic bezier path utilities for node connections
//
//  Computes SVG path `d` attributes and midpoints for connection curves.
//  Source ports are on the right side of nodes; target ports on the left.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute the SVG `d` attribute for a cubic bezier connection path.
 *
 * Control-point handles are placed horizontally so the curve leaves the source
 * port going right and enters the target port going left, giving a clean
 * "noodle" shape regardless of relative node positions.
 *
 * @param x1 Source port X (right side of source node)
 * @param y1 Source port Y (vertical center of source node)
 * @param x2 Target port X (left side of target node)
 * @param y2 Target port Y (vertical center of target node)
 */
export function computeBezierPath(x1: number, y1: number, x2: number, y2: number): string {
  const dx = Math.abs(x2 - x1)
  const offset = Math.max(80, dx * 0.4)

  const cp1x = x1 + offset
  const cp1y = y1
  const cp2x = x2 - offset
  const cp2y = y2

  return `M${x1},${y1} C${cp1x},${cp1y} ${cp2x},${cp2y} ${x2},${y2}`
}

/**
 * Evaluate a point on the cubic bezier at parameter `t` (0..1).
 *
 * Uses the standard De Casteljau formula:
 *   B(t) = (1-t)^3 P0 + 3(1-t)^2 t P1 + 3(1-t) t^2 P2 + t^3 P3
 */
function bezierPoint(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const u = 1 - t
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3
}

/**
 * Compute the midpoint of the connection bezier (t = 0.5).
 *
 * Uses the same control-point calculation as `computeBezierPath` so the
 * returned point is guaranteed to sit exactly on the rendered curve.
 *
 * @param x1 Source port X
 * @param y1 Source port Y
 * @param x2 Target port X
 * @param y2 Target port Y
 */
export function computeBezierMidpoint(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): { x: number; y: number } {
  const dx = Math.abs(x2 - x1)
  const offset = Math.max(80, dx * 0.4)

  const cp1x = x1 + offset
  const cp1y = y1
  const cp2x = x2 - offset
  const cp2y = y2

  const t = 0.5
  return {
    x: bezierPoint(x1, cp1x, cp2x, x2, t),
    y: bezierPoint(y1, cp1y, cp2y, y2, t),
  }
}
