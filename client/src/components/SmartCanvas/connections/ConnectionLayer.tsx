// ─────────────────────────────────────────────────────────────────────────────
//  ConnectionLayer.tsx — SVG overlay that renders node connection beziers
//
//  Renders on top of the world container as a pointer-events-transparent SVG,
//  with interactive hit-areas per connection for hover highlight & deletion.
//
//  Features:
//   - Cubic bezier path from output port → input port
//   - "Cut" (delete) button at the curve midpoint on hover
//   - Work-in-progress connection line while the user drags from a port
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useMemo, useCallback } from 'react'
import type { NodeConnection, SmartNode, Viewport } from '../types'
import { computeBezierPath, computeBezierMidpoint } from './bezierPath'

// ── Props ────────────────────────────────────────────────────────────────────

export interface WipConnection {
  fromId: string
  fromPort: 'output'
  mouseX: number // world-space X
  mouseY: number // world-space Y
}

export interface ConnectionLayerProps {
  connections: NodeConnection[]
  nodes: SmartNode[]
  /** In-progress connection while the user drags from a port. */
  wipConnection: WipConnection | null
  onDeleteConnection: (from: string, to: string) => void
  viewport: Viewport
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Resolve the output port position (right edge, vertical center). */
function outputPort(node: SmartNode): { x: number; y: number } {
  return { x: node.x + node.w, y: node.y + node.h / 2 }
}

/** Resolve the input port position (left edge, vertical center). */
function inputPort(node: SmartNode): { x: number; y: number } {
  return { x: node.x, y: node.y + node.h / 2 }
}

// ── Styles ───────────────────────────────────────────────────────────────────

const STROKE_COLOR = '#6366f1'
const STROKE_COLOR_HOVER = '#818cf8'
const STROKE_WIDTH = 2
const STROKE_WIDTH_HOVER = 4
const WIP_STROKE_COLOR = '#a5b4fc'

const CUT_RADIUS = 10
const CUT_BG = '#ef4444'
const CUT_ICON_COLOR = '#fff'

// ── Sub-component: individual connection ─────────────────────────────────────

interface ConnectionPathProps {
  conn: NodeConnection
  sourceNode: SmartNode
  targetNode: SmartNode
  onDelete: (from: string, to: string) => void
}

const ConnectionPath: React.FC<ConnectionPathProps> = React.memo(
  ({ conn, sourceNode, targetNode, onDelete }) => {
    const [hovered, setHovered] = useState(false)

    const src = outputPort(sourceNode)
    const tgt = inputPort(targetNode)

    const d = useMemo(
      () => computeBezierPath(src.x, src.y, tgt.x, tgt.y),
      [src.x, src.y, tgt.x, tgt.y],
    )
    const mid = useMemo(
      () => computeBezierMidpoint(src.x, src.y, tgt.x, tgt.y),
      [src.x, src.y, tgt.x, tgt.y],
    )

    const handleMouseEnter = useCallback(() => setHovered(true), [])
    const handleMouseLeave = useCallback(() => setHovered(false), [])

    const handleCut = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation()
        onDelete(conn.from, conn.to)
      },
      [conn.from, conn.to, onDelete],
    )

    return (
      <g onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
        {/* Invisible wide hit-area so hovering the thin line is easy */}
        <path
          d={d}
          fill="none"
          stroke="transparent"
          strokeWidth={12}
          style={{ cursor: 'pointer', pointerEvents: 'stroke' }}
        />

        {/* Visible bezier curve */}
        <path
          d={d}
          fill="none"
          stroke={hovered ? STROKE_COLOR_HOVER : STROKE_COLOR}
          strokeWidth={hovered ? STROKE_WIDTH_HOVER : STROKE_WIDTH}
          strokeLinecap="round"
          style={{ pointerEvents: 'none', transition: 'stroke 0.15s, stroke-width 0.15s' }}
        />

        {/* Cut button — rendered at the midpoint, visible on hover */}
        {hovered && (
          <g onClick={handleCut} style={{ cursor: 'pointer' }}>
            <circle cx={mid.x} cy={mid.y} r={CUT_RADIUS} fill={CUT_BG} />
            {/* X icon (two small lines) */}
            <line
              x1={mid.x - 4}
              y1={mid.y - 4}
              x2={mid.x + 4}
              y2={mid.y + 4}
              stroke={CUT_ICON_COLOR}
              strokeWidth={2}
              strokeLinecap="round"
            />
            <line
              x1={mid.x + 4}
              y1={mid.y - 4}
              x2={mid.x - 4}
              y2={mid.y + 4}
              stroke={CUT_ICON_COLOR}
              strokeWidth={2}
              strokeLinecap="round"
            />
          </g>
        )}
      </g>
    )
  },
)

ConnectionPath.displayName = 'ConnectionPath'

// ── Main component ───────────────────────────────────────────────────────────

const ConnectionLayer: React.FC<ConnectionLayerProps> = ({
  connections,
  nodes,
  wipConnection,
  onDeleteConnection,
  viewport,
}) => {
  // Build a lookup map for O(1) node access
  const nodeMap = useMemo(() => {
    const map = new Map<string, SmartNode>()
    for (const n of nodes) map.set(n.id, n)
    return map
  }, [nodes])

  // Resolve WIP path
  const wipPath = useMemo(() => {
    if (!wipConnection) return null
    const srcNode = nodeMap.get(wipConnection.fromId)
    if (!srcNode) return null
    const src = outputPort(srcNode)
    return computeBezierPath(src.x, src.y, wipConnection.mouseX, wipConnection.mouseY)
  }, [wipConnection, nodeMap])

  return (
    <svg
      className="absolute inset-0 h-full w-full"
      style={{
        pointerEvents: 'none',
        overflow: 'visible',
        zIndex: 10,
      }}
    >
      {/*
        Apply the same world→screen transform as the canvas engine so
        connections align perfectly with the rendered nodes.
      */}
      <g
        transform={`translate(${viewport.x},${viewport.y}) scale(${viewport.scale})`}
        style={{ pointerEvents: 'auto' }}
      >
        {/* Established connections */}
        {connections.map(conn => {
          const srcNode = nodeMap.get(conn.from)
          const tgtNode = nodeMap.get(conn.to)
          if (!srcNode || !tgtNode) return null

          return (
            <ConnectionPath
              key={`${conn.from}→${conn.to}`}
              conn={conn}
              sourceNode={srcNode}
              targetNode={tgtNode}
              onDelete={onDeleteConnection}
            />
          )
        })}

        {/* Work-in-progress connection (dragging from a port) */}
        {wipPath && (
          <path
            d={wipPath}
            fill="none"
            stroke={WIP_STROKE_COLOR}
            strokeWidth={2}
            strokeDasharray="8 4"
            strokeLinecap="round"
            style={{ pointerEvents: 'none' }}
          />
        )}
      </g>
    </svg>
  )
}

export default ConnectionLayer
