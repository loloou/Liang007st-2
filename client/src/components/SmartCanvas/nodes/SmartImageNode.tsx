// ─────────────────────────────────────────────────────────────────────────────
//  SmartImageNode.tsx — Image gallery node for the SmartCanvas node graph
//
//  Features:
//   - Title bar with name + status (running spinner, pending badge)
//   - Multi-image gallery with prev/next navigation
//   - Upload button, drag-and-drop empty state
//   - Resize handle (bottom-right), input/output ports
//   - Running state: animated gradient border
//   - Double-click image to open editor
//   - Context menu: delete, duplicate, export
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useCallback, useRef } from 'react'
import type { NodeImage, SmartNode } from '../types'
import NodePorts from './NodePorts'

export interface SmartImageNodeProps {
  node: SmartNode
  selected: boolean
  onUpdate: (id: string, patch: Partial<SmartNode>) => void
  onPortMouseDown: (nodeId: string, portType: 'input' | 'output', e: React.MouseEvent) => void
  onImageDoubleClick: (nodeId: string, imageIndex: number) => void
  onNodeMouseDown: (nodeId: string, e: React.MouseEvent) => void
  onResizeMouseDown: (nodeId: string, e: React.MouseEvent) => void
  onUploadImages: (nodeId: string, files: FileList) => void
  onAssetDrop?: (nodeId: string, assetId: string) => void
  onSmartAssetDrop?: (nodeId: string, image: NodeImage) => void
  onDeleteNode: (nodeId: string) => void
}

const SmartImageNode: React.FC<SmartImageNodeProps> = ({
  node,
  selected,
  onUpdate,
  onPortMouseDown,
  onImageDoubleClick,
  onNodeMouseDown,
  onResizeMouseDown,
  onUploadImages,
  onAssetDrop,
  onSmartAssetDrop,
  onDeleteNode,
}) => {
  const [imageIndex, setImageIndex] = useState(0)
  const [showContextMenu, setShowContextMenu] = useState(false)
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 })
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const images = node.images ?? []
  const hasImages = images.length > 0
  const currentImage = hasImages ? images[Math.min(imageIndex, images.length - 1)] : null
  const isRunning = node.running
  const isPending = node.pending > 0

  const width = node.w || 320
  const height = node.h || 320

  // ── Navigation ───────────────────────────────────────────────────────

  const handlePrev = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      setImageIndex(i => (i > 0 ? i - 1 : images.length - 1))
    },
    [images.length],
  )

  const handleNext = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      setImageIndex(i => (i < images.length - 1 ? i + 1 : 0))
    },
    [images.length],
  )

  // ── Upload ───────────────────────────────────────────────────────────

  const handleUploadClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    fileInputRef.current?.click()
  }, [])

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        onUploadImages(node.id, e.target.files)
        e.target.value = ''
      }
    },
    [node.id, onUploadImages],
  )

  // ── Drag-and-drop on node ───────────────────────────────────────────

  const dragCounterRef = useRef(0)

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current += 1
    if (dragCounterRef.current === 1) setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current -= 1
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0
      setIsDragOver(false)
    }
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      dragCounterRef.current = 0
      setIsDragOver(false)

      // 1. Handle asset-id drops from AssetLibrary
      const assetId = e.dataTransfer.getData('application/asset-id')
      if (assetId && onAssetDrop) {
        onAssetDrop(node.id, assetId)
        return
      }

      // 2. Handle legacy smart asset drops
      const smartAsset = e.dataTransfer.getData('application/x-smart-asset')
      if (smartAsset && onSmartAssetDrop) {
        try {
          const parsed = JSON.parse(smartAsset) as Partial<NodeImage>
          if (parsed.url) {
            onSmartAssetDrop(node.id, {
              url: parsed.url,
              name: parsed.name || 'smart-asset',
              kind: parsed.kind === 'generated' || parsed.kind === 'uploaded' ? parsed.kind : 'reference',
            })
            return
          }
        } catch {
          // Ignore malformed drag payloads.
        }
      }

      // 3. Handle file drops (from OS or other canvas images)
      const files = e.dataTransfer.files
      if (files.length > 0) {
        onUploadImages(node.id, files)
      }
    },
    [node.id, onUploadImages, onAssetDrop, onSmartAssetDrop],
  )

  // ── Double-click image ───────────────────────────────────────────────

  const handleImageDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      const idx = Math.min(imageIndex, images.length - 1)
      if (idx >= 0) onImageDoubleClick(node.id, idx)
    },
    [node.id, imageIndex, images.length, onImageDoubleClick],
  )

  // ── Context menu ─────────────────────────────────────────────────────

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

  // ── Mouse down on node body (for dragging) ───────────────────────────

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return
      onNodeMouseDown(node.id, e)
    },
    [node.id, onNodeMouseDown],
  )

  // ── Resize handle ────────────────────────────────────────────────────

  const handleResizeDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onResizeMouseDown(node.id, e)
    },
    [node.id, onResizeMouseDown],
  )

  // ── Title bar name editing ───────────────────────────────────────────

  const handleNameChange = useCallback(
    (e: React.FocusEvent<HTMLSpanElement>) => {
      const newName = e.currentTarget.textContent?.trim() || node.title
      if (newName !== node.title) {
        onUpdate(node.id, { title: newName })
      }
    },
    [node.id, node.title, onUpdate],
  )

  // ── Render ───────────────────────────────────────────────────────────

  return (
    <div
      className={`absolute select-none overflow-hidden rounded-xl border bg-slate-800 transition-shadow duration-200 ${selected ? 'border-indigo-500/60 ring-2 ring-indigo-500' : 'border-slate-600/60'} ${isDragOver ? 'border-indigo-400 ring-2 ring-indigo-400/60' : ''} ${isRunning ? 'smart-node-running' : ''}`}
      style={{
        left: node.x,
        top: node.y,
        width,
        height,
        zIndex: selected || isDragOver ? 10 : 1,
      }}
      onMouseDown={handleMouseDown}
      onContextMenu={handleContextMenu}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Ports */}
      <NodePorts nodeId={node.id} nodeHeight={height} onPortMouseDown={onPortMouseDown} />

      {/* ── Title bar ─────────────────────────────────────────────── */}
      <div className="flex cursor-grab items-center justify-between border-b border-slate-700/50 bg-slate-900/80 px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <div className="h-2.5 w-2.5 flex-shrink-0 rounded-full bg-indigo-500" />
          <span
            className="truncate text-xs font-medium text-slate-200 outline-none"
            contentEditable
            suppressContentEditableWarning
            spellCheck={false}
            onBlur={handleNameChange}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault()
                ;(e.target as HTMLElement).blur()
              }
            }}
          >
            {node.title}
          </span>
        </div>

        <div className="flex flex-shrink-0 items-center gap-1.5">
          {/* Pending count badge */}
          {node.pending > 0 && (
            <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-amber-400">
              {node.pending}
            </span>
          )}
          {/* Running spinner */}
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
          {/* Pending icon */}
          {isPending && (
            <div className="h-3 w-3 animate-spin rounded-full border-2 border-amber-400/60 border-t-transparent" />
          )}
        </div>
      </div>

      {/* ── Image area ────────────────────────────────────────────── */}
      <div className="relative flex-1" style={{ height: height - 36 }}>
        {hasImages && currentImage ? (
          <>
            {/* Current image */}
            <img
              src={currentImage.url}
              alt={currentImage.name || 'Generated image'}
              className="h-full w-full bg-slate-900/40 object-contain"
              draggable={false}
              onDoubleClick={handleImageDoubleClick}
            />

            {/* Running overlay */}
            {isRunning && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-900/60">
                <div className="flex flex-col items-center gap-2">
                  <svg
                    className="h-10 w-10 animate-spin text-indigo-500"
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
                  <span className="text-xs font-medium text-slate-300">Generating...</span>
                </div>
              </div>
            )}

            {/* Prev/Next navigation */}
            {images.length > 1 && (
              <>
                <button
                  onClick={handlePrev}
                  className="absolute left-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-slate-900/70 text-xs text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
                >
                  <svg
                    className="h-3 w-3"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <path d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button
                  onClick={handleNext}
                  className="absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-slate-900/70 text-xs text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
                >
                  <svg
                    className="h-3 w-3"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <path d="M9 5l7 7-7 7" />
                  </svg>
                </button>

                {/* Image counter */}
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-slate-900/70 px-2 py-0.5 text-[10px] text-slate-400">
                  {Math.min(imageIndex + 1, images.length)} / {images.length}
                </div>
              </>
            )}
          </>
        ) : (
          /* ── Empty state ─────────────────────────────────────────── */
          <div
            className={`flex h-full w-full cursor-pointer flex-col items-center justify-center gap-3 border-2 border-dashed transition-colors ${isDragOver ? 'border-indigo-400 bg-indigo-500/10' : 'border-slate-700/40 bg-slate-900/30 hover:border-indigo-500/30'}`}
            onClick={handleUploadClick}
          >
            <svg
              className="h-10 w-10 text-slate-600"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <rect x="3" y="3" width="18" height="18" rx="3" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
            <span className="text-xs text-slate-500">Drop images or generate</span>
            <button
              onClick={handleUploadClick}
              className="rounded-md border border-indigo-500/20 bg-indigo-500/10 px-3 py-1 text-[11px] font-medium text-indigo-400 transition-colors hover:bg-indigo-500/20"
            >
              Upload
            </button>
          </div>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />

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
            <button
              onClick={() => {
                closeContextMenu()
                // Export current image — trigger download
                if (currentImage?.url) {
                  const a = document.createElement('a')
                  a.href = currentImage.url
                  a.download = `${node.title || 'image'}.png`
                  a.click()
                }
              }}
              className="w-full px-3 py-1.5 text-left text-xs text-slate-300 transition-colors hover:bg-slate-700/60"
            >
              Export Image
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

      {/* ── Running animated border (CSS) ─────────────────────────── */}
      {isRunning && (
        <div className="smart-node-border-anim pointer-events-none absolute inset-0 rounded-xl" />
      )}

      {/* Inline style for running border animation */}
      <style>{`
        .smart-node-running {
          box-shadow: 0 0 16px rgba(99, 102, 241, 0.15);
        }
        .smart-node-border-anim {
          background: conic-gradient(
            from var(--angle, 0deg),
            transparent 0%,
            rgba(99, 102, 241, 0.5) 10%,
            transparent 20%
          );
          mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          mask-composite: exclude;
          -webkit-mask-composite: xor;
          padding: 2px;
          animation: smart-node-spin 2s linear infinite;
        }
        @keyframes smart-node-spin {
          to { --angle: 360deg; }
        }
        @property --angle {
          syntax: '<angle>';
          initial-value: 0deg;
          inherits: false;
        }
      `}</style>
    </div>
  )
}

export default React.memo(SmartImageNode)
