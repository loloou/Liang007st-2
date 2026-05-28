// ─────────────────────────────────────────────────────────────────────────────
//  connections/index.ts — Barrel exports for the connection subsystem
// ─────────────────────────────────────────────────────────────────────────────

export { default as ConnectionLayer } from './ConnectionLayer'
export type { ConnectionLayerProps, WipConnection } from './ConnectionLayer'
export { ConnectionManager } from './ConnectionManager'
export { computeBezierPath, computeBezierMidpoint } from './bezierPath'
