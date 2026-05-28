// ─────────────────────────────────────────────────────────────────────────────
//  SmartPromptNode.tsx — Prompt/text node for the SmartCanvas node graph
//
//  Features:
//   - Title bar with "Prompt" label
//   - Editable text area (contentEditable div)
//   - Collapsible system prompt section
//   - Input/output ports
//   - Default size: 280x200
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useCallback, useRef } from 'react'
import type { SmartNode } from '../types'
import NodePorts from './NodePorts'

export interface SmartPromptNodeProps {
  node: SmartNode
  selected: boolean
  onUpdate: (id: string, patch: Partial<SmartNode>) => void
  onPortMouseDown: (nodeId: string, portType: 'input' | 'output', e: React.MouseEvent) => void
  onNodeMouseDown: (nodeId: string, e: React.MouseEvent) => void
  onResizeMouseDown: (nodeId: string, e: React.MouseEvent) => void
  onDeleteNode: (nodeId: string) => void
}

const SmartPromptNode: React.FC<SmartPromptNodeProps> = ({
  node,
  selected,
  onUpdate,
  onPortMouseDown,
  onNodeMouseDown,
  onResizeMouseDown,
  onDeleteNode,
}) => {
  const [showSystemPrompt, setShowSystemPrompt] = useState(false)
  const [showContextMenu, setShowContextMenu] = useState(false)
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 })
  const promptRef = useRef<HTMLDivElement>(null)
  const systemPromptRef = useRef<HTMLDivElement>(null)

  const width = node.w || 280
  const height = node.h || 200
  const isRunning = node.running

  // ── Prompt editing ───────────────────────────────────────────────────

  const handlePromptBlur = useCallback(() => {
    const text = promptRef.current?.textContent ?? ''
    if (text !== node.text) {
      onUpdate(node.id, { text })
    }
  }, [node.id, node.text, onUpdate])

  const handleSystemPromptBlur = useCallback(() => {
    const text = systemPromptRef.current?.textContent ?? ''
    if (text !== node.systemPrompt) {
      onUpdate(node.id, { systemPrompt: text })
    }
  }, [node.id, node.systemPrompt, onUpdate])

  // ── Interaction handlers ─────────────────────────────────────────────

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return
      // Don't initiate drag if clicking inside editable area
      const target = e.target as HTMLElement
      if (target.isContentEditable || target.closest('[contenteditable]')) return
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
          <div className="h-2.5 w-2.5 flex-shrink-0 rounded-full bg-emerald-500" />
          <span className="text-xs font-medium text-slate-200">Prompt</span>
        </div>
        <div className="flex items-center gap-1.5">
          {isRunning && (
            <svg
              className="h-3.5 w-3.5 animate-spin text-indigo-400"
              viewBox="0 0 24 24"
              fill="none"
            >
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
          <button
            onClick={e => {
              e.stopPropagation()
              setShowSystemPrompt(v => !v)
            }}
            className={`rounded px-1.5 py-0.5 text-[10px] transition-colors ${
              showSystemPrompt
                ? 'border border-indigo-500/30 bg-indigo-500/20 text-indigo-400'
                : 'border border-transparent text-slate-500 hover:text-slate-300'
            }`}
            title="Toggle system prompt"
          >
            SYS
          </button>
        </div>
      </div>

      {/* ── Content area ──────────────────────────────────────────── */}
      <div className="flex flex-col overflow-hidden" style={{ height: height - 36 }}>
        {/* System prompt (collapsible) */}
        {showSystemPrompt && (
          <div className="border-b border-slate-700/40">
            <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-slate-500">
              System Prompt
            </div>
            <div
              ref={systemPromptRef}
              contentEditable
              suppressContentEditableWarning
              spellCheck={false}
              onBlur={handleSystemPromptBlur}
              className="max-h-[60px] min-h-[40px] overflow-y-auto whitespace-pre-wrap break-words bg-slate-900/40 px-3 py-2 text-xs text-slate-400 outline-none empty:before:text-slate-600 empty:before:content-['System_instructions...']"
              onMouseDown={e => e.stopPropagation()}
            >
              {node.systemPrompt}
            </div>
          </div>
        )}

        {/* Main prompt area */}
        <div
          ref={promptRef}
          contentEditable
          suppressContentEditableWarning
          spellCheck={false}
          onBlur={handlePromptBlur}
          className="flex-1 overflow-y-auto whitespace-pre-wrap break-words bg-transparent px-3 py-2.5 text-sm leading-relaxed text-slate-200 outline-none empty:before:text-slate-600 empty:before:content-['Enter_your_prompt...']"
          onMouseDown={e => e.stopPropagation()}
        >
          {node.text}
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

export default React.memo(SmartPromptNode)
