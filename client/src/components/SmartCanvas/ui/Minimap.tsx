import React, { useCallback, useRef, useMemo } from 'react'
import type { SmartNode, Viewport } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
//  Minimap — live overview of the canvas with click/drag navigation
// ─────────────────────────────────────────────────────────────────────────────

export interface MinimapProps {
  nodes: SmartNode[]
  viewport: Viewport
  shellRect: DOMRect | null
  onViewportChange: (vp: Partial<Viewport>) => void
}

/** Fixed minimap dimensions (px). */
const MINIMAP_W = 200
const MINIMAP_H = 150
const PADDING = 20

/** Node type → fill colour. */
const NODE_COLORS: Record<string, string> = {
  'smart-image': '#6366f1', // indigo-500
  'smart-prompt': '#10b981', // emerald-500
  'smart-loop': '#f59e0b', // amber-500
}

/**
 * Compute the bounding box of all nodes with some padding,
 * then derive a uniform scale so the whole world fits into the minimap.
 */
function useMinimapTransform(nodes: SmartNode[]) {
  return useMemo(() => {
    if (nodes.length === 0) {
      return { offsetX: 0, offsetY: 0, scale: 1, worldW: MINIMAP_W, worldH: MINIMAP_H }
    }

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

    // Add padding around the bounding box
    minX -= PADDING * 10
    minY -= PADDING * 10
    maxX += PADDING * 10
    maxY += PADDING * 10

    const worldW = maxX - minX || 1
    const worldH = maxY - minY || 1

    const scaleX = (MINIMAP_W - PADDING * 2) / worldW
    const scaleY = (MINIMAP_H - PADDING * 2) / worldH
    const scale = Math.min(scaleX, scaleY)

    // Center the content in the minimap
    const offsetX = (MINIMAP_W - worldW * scale) / 2 - minX * scale
    const offsetY = (MINIMAP_H - worldH * scale) / 2 - minY * scale

    return { offsetX, offsetY, scale, worldW, worldH }
  }, [nodes])
}

export const Minimap: React.FC<MinimapProps> = React.memo(
  ({ nodes, viewport, shellRect, onViewportChange }) => {
    const containerRef = useRef<HTMLDivElement>(null)
    const draggingRef = useRef(false)
    const { offsetX, offsetY, scale } = useMinimapTransform(nodes)

    // ── Viewport rectangle in minimap space ──────────────────────────────
    const viewRect = useMemo(() => {
      if (!shellRect) return null

      // The visible portion of the world is:
      //   worldX = -viewport.x / viewport.scale
      //   worldY = -viewport.y / viewport.scale
      //   worldW = shellRect.width / viewport.scale
      //   worldH = shellRect.height / viewport.scale
      const wx = -viewport.x / viewport.scale
      const wy = -viewport.y / viewport.scale
      const ww = shellRect.width / viewport.scale
      const wh = shellRect.height / viewport.scale

      return {
        x: wx * scale + offsetX,
        y: wy * scale + offsetY,
        w: ww * scale,
        h: wh * scale,
      }
    }, [viewport, shellRect, scale, offsetX, offsetY])

    // ── Click / drag handler ─────────────────────────────────────────────
    const navigateTo = useCallback(
      (clientX: number, clientY: number) => {
        const el = containerRef.current
        if (!el || !shellRect) return

        const rect = el.getBoundingClientRect()
        const mx = clientX - rect.left
        const my = clientY - rect.top

        // Convert minimap coords → world coords
        const worldX = (mx - offsetX) / scale
        const worldY = (my - offsetY) / scale

        // Set viewport so this world point is at the center of the shell
        onViewportChange({
          x: shellRect.width / 2 - worldX * viewport.scale,
          y: shellRect.height / 2 - worldY * viewport.scale,
        })
      },
      [offsetX, offsetY, scale, shellRect, viewport.scale, onViewportChange],
    )

    const onPointerDown = useCallback(
      (e: React.PointerEvent) => {
        if (e.button !== 0) return
        e.stopPropagation()
        e.preventDefault()
        draggingRef.current = true
        ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
        navigateTo(e.clientX, e.clientY)
      },
      [navigateTo],
    )

    const onPointerMove = useCallback(
      (e: React.PointerEvent) => {
        if (!draggingRef.current) return
        navigateTo(e.clientX, e.clientY)
      },
      [navigateTo],
    )

    const onPointerUp = useCallback((e: React.PointerEvent) => {
      draggingRef.current = false
      try {
        ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
      } catch {
        // already released
      }
    }, [])

    // ── Render ────────────────────────────────────────────────────────────
    return (
      <div
        ref={containerRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{
          position: 'fixed',
          right: 16,
          bottom: 16,
          width: MINIMAP_W,
          height: MINIMAP_H,
          backgroundColor: 'rgba(15, 15, 15, 0.75)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: 8,
          overflow: 'hidden',
          cursor: 'crosshair',
          zIndex: 50,
          userSelect: 'none',
          touchAction: 'none',
        }}
      >
        {/* Node rectangles */}
        {nodes.map(node => {
          const nx = node.x * scale + offsetX
          const ny = node.y * scale + offsetY
          const nw = Math.max(node.w * scale, 2)
          const nh = Math.max(node.h * scale, 2)
          const fill = NODE_COLORS[node.type] ?? '#94a3b8'

          return (
            <div
              key={node.id}
              style={{
                position: 'absolute',
                left: nx,
                top: ny,
                width: nw,
                height: nh,
                backgroundColor: fill,
                borderRadius: 1,
                opacity: 0.85,
                pointerEvents: 'none',
              }}
            />
          )
        })}

        {/* Viewport rectangle */}
        {viewRect && (
          <div
            style={{
              position: 'absolute',
              left: viewRect.x,
              top: viewRect.y,
              width: viewRect.w,
              height: viewRect.h,
              border: '1.5px solid #ef4444',
              borderRadius: 2,
              pointerEvents: 'none',
            }}
          />
        )}
      </div>
    )
  },
)

Minimap.displayName = 'Minimap'
