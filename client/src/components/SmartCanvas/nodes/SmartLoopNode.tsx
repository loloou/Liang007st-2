// ─────────────────────────────────────────────────────────────────────────────
//  SmartLoopNode.tsx — Loop control node for the SmartCanvas node graph
//
//  Features:
//   - Title bar with "Loop" label
//   - Loop count numeric input
//   - Serial / Parallel mode toggle
//   - Loop variables list (editable, add/remove)
//   - Input/output ports
//   - Compact default size: 240x180
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useMemo, useState } from 'react'
import type { SmartNode } from '../types'
import NodePorts from './NodePorts'

export interface SmartLoopNodeProps {
  node: SmartNode
  selected: boolean
  onUpdate: (id: string, patch: Partial<SmartNode>) => void
  onPortMouseDown: (nodeId: string, portType: 'input' | 'output', e: React.MouseEvent) => void
  onNodeMouseDown: (nodeId: string, e: React.MouseEvent) => void
  onResizeMouseDown: (nodeId: string, e: React.MouseEvent) => void
  onDeleteNode: (nodeId: string) => void
}

const SmartLoopNode: React.FC<SmartLoopNodeProps> = ({
  node,
  selected,
  onUpdate,
  onPortMouseDown,
  onNodeMouseDown,
  onResizeMouseDown,
  onDeleteNode,
}) => {
  const [showContextMenu, setShowContextMenu] = useState(false)
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 })

  const width = node.w || 240
  const height = node.h || 180
  const isRunning = node.running

  const loopVariables = useMemo(() => node.loopVariables ?? [], [node.loopVariables])

  // ── Loop count ───────────────────────────────────────────────────────

  const handleLoopCountChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = Math.max(1, Math.min(999, parseInt(e.target.value, 10) || 1))
      onUpdate(node.id, { loopCount: val })
    },
    [node.id, onUpdate],
  )

  // ── Mode toggle ──────────────────────────────────────────────────────

  const handleModeToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onUpdate(node.id, {
        loopMode: node.loopMode === 'serial' ? 'parallel' : 'serial',
      })
    },
    [node.id, node.loopMode, onUpdate],
  )

  // ── Loop variables ───────────────────────────────────────────────────

  const handlePromptChange = useCallback(
    (index: number, value: string) => {
      const updated = [...loopVariables]
      updated[index] = value
      onUpdate(node.id, { loopVariables: updated })
    },
    [node.id, loopVariables, onUpdate],
  )

  const handleAddPrompt = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onUpdate(node.id, { loopVariables: [...loopVariables, ''] })
    },
    [node.id, loopVariables, onUpdate],
  )

  const handleRemovePrompt = useCallback(
    (index: number, e: React.MouseEvent) => {
      e.stopPropagation()
      const updated = loopVariables.filter((_: string, i: number) => i !== index)
      onUpdate(node.id, { loopVariables: updated })
    },
    [node.id, loopVariables, onUpdate],
  )

  // ── Interaction handlers ─────────────────────────────────────────────

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return
      // Don't initiate drag when interacting with inputs
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'BUTTON') return
      onNodeMouseDown(node.id, e)
    },
    [node.id, onNodeMouseDown],
  )

  const handleResizeDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onResizeMouseDown(node.id, e)
    },
    [node.id, onResizeMouseDown],
  )

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenuPos({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY })
    setShowContextMenu(true)
  }, [])

  const closeContextMenu = useCallback(() => setShowContextMenu(false), [])

  const handleDelete = useCallback(() => {
    closeContextMenu()
    onDeleteNode(node.id)
  }, [node.id, onDeleteNode, closeContextMenu])

  const handleDuplicate = useCallback(() => {
    closeContextMenu()
    onUpdate(node.id, { x: node.x + 40, y: node.y + 40 })
  }, [node.id, node.x, node.y, onUpdate, closeContextMenu])

  // ── Render ───────────────────────────────────────────────────────────

  return (
    <div
      className={`absolute select-none overflow-hidden rounded-xl border bg-slate-800 transition-shadow duration-200 ${selected ? 'border-indigo-500/60 ring-2 ring-indigo-500' : 'border-slate-600/60'} ${isRunning ? 'shadow-[0_0_16px_rgba(99,102,241,0.15)]' : ''}`}
      style={{
        left: node.x,
        top: node.y,
        width,
        height,
        zIndex: selected ? 10 : 1,
      }}
      onMouseDown={handleMouseDown}
      onContextMenu={handleContextMenu}
    >
      {/* Ports */}
      <NodePorts nodeId={node.id} nodeHeight={height} onPortMouseDown={onPortMouseDown} />

      {/* ── Title bar ─────────────────────────────────────────────── */}
      <div className="flex cursor-grab items-center justify-between border-b border-slate-700/50 bg-slate-900/80 px-3 py-1.5">
        <div className="flex items-center gap-2">
          <div className="h-2.5 w-2.5 flex-shrink-0 rounded-full bg-amber-500" />
          <span className="text-xs font-medium text-slate-200">Loop</span>
        </div>
        {isRunning && (
          <svg className="h-3.5 w-3.5 animate-spin text-indigo-400" viewBox="0 0 24 24" fill="none">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="3"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
            />
          </svg>
        )}
      </div>

      {/* ── Controls ──────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 overflow-y-auto p-3" style={{ height: height - 36 }}>
        {/* Loop count + mode */}
        <div className="flex items-center gap-2">
          <label className="w-10 flex-shrink-0 text-[10px] uppercase tracking-wider text-slate-500">
            Count
          </label>
          <input
            type="number"
            min={1}
            max={999}
            value={node.loopCount}
            onChange={handleLoopCountChange}
            onMouseDown={e => e.stopPropagation()}
            className="w-14 rounded border border-slate-600/40 bg-slate-900/60 px-1.5 py-0.5 text-center text-xs text-slate-200 [appearance:textfield] focus:border-indigo-500/50 focus:outline-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <button
            onClick={handleModeToggle}
            className={`ml-auto rounded border px-2 py-0.5 text-[10px] font-medium transition-colors ${
              node.loopMode === 'parallel'
                ? 'border-indigo-500/30 bg-indigo-500/20 text-indigo-400'
                : 'border-slate-600/30 bg-slate-700/40 text-slate-400 hover:bg-slate-700/60'
            }`}
          >
            {node.loopMode === 'parallel' ? 'Parallel' : 'Serial'}
          </button>
        </div>

        {/* Loop variables */}
        <div className="flex min-h-0 flex-1 flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider text-slate-500">Variables</span>
            <button
              onClick={handleAddPrompt}
              className="flex h-4 w-4 items-center justify-center rounded bg-slate-700/40 text-xs leading-none text-slate-500 transition-colors hover:bg-slate-700/60 hover:text-indigo-400"
              title="Add variable prompt"
            >
              +
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
            {loopVariables.length === 0 ? (
              <div className="py-2 text-center text-[10px] italic text-slate-600">
                No variables defined
              </div>
            ) : (
              loopVariables.map((vp: string, i: number) => (
                <div key={i} className="group flex items-center gap-1">
                  <span className="w-3 flex-shrink-0 text-[10px] text-slate-600">{i + 1}</span>
                  <input
                    type="text"
                    value={vp}
                    onChange={e => handlePromptChange(i, e.target.value)}
                    onMouseDown={e => e.stopPropagation()}
                    placeholder={`Variable ${i + 1}...`}
                    className="min-w-0 flex-1 rounded border border-slate-700/30 bg-slate-900/40 px-1.5 py-0.5 text-[11px] text-slate-300 placeholder:text-slate-600 focus:border-indigo-500/40 focus:outline-none"
                  />
                  <button
                    onClick={e => handleRemovePrompt(i, e)}
                    className="flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center text-[10px] text-slate-600 opacity-0 transition-all hover:text-red-400 group-hover:opacity-100"
                    title="Remove"
                  >
                    x
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ── Resize handle ─────────────────────────────────────────── */}
      <div
        className="group absolute bottom-0 right-0 z-20 h-4 w-4 cursor-nwse-resize"
        onMouseDown={handleResizeDown}
      >
        <svg
          className="h-full w-full text-slate-600 transition-colors group-hover:text-slate-400"
          viewBox="0 0 16 16"
          fill="currentColor"
        >
          <path d="M14 14H10L14 10V14ZM14 8L8 14H6L14 6V8Z" />
        </svg>
      </div>

      {/* ── Context menu ──────────────────────────────────────────── */}
      {showContextMenu && (
        <>
          <div className="fixed inset-0 z-50" onClick={closeContextMenu} />
          <div
            className="absolute z-50 min-w-[140px] rounded-lg border border-slate-600/60 bg-slate-800 py-1 shadow-xl"
            style={{ left: contextMenuPos.x, top: contextMenuPos.y }}
          >
            <button
              onClick={handleDuplicate}
              className="w-full px-3 py-1.5 text-left text-xs text-slate-300 transition-colors hover:bg-slate-700/60"
            >
              Duplicate
            </button>
            <div className="my-1 border-t border-slate-700/50" />
            <button
              onClick={handleDelete}
              className="w-full px-3 py-1.5 text-left text-xs text-red-400 transition-colors hover:bg-red-500/10"
            >
              Delete
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export default React.memo(SmartLoopNode)
