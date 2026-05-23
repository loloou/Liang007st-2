/**
 * ResultPanel — 生成结果展示区
 *
 * 从 App.tsx 提取的独立组件。
 * 展示生成结果、进度、缩略图、批量操作等。
 */
import React, { useState, useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { GeneratedImage } from '../api/imageClient'
import type { ResolutionPresetId, SizeTierId } from '../utils/resolutionPresets'
import { safeUrl } from '../utils/safeUrl'
import { downloadImage } from '../utils/download'

type GenerationSlotView = {
  id: string
  historySlotId?: string
  viewportIndex?: number
  viewportName?: string
  request: {
    prompt: string
    negativePrompt: string
    batchSize: number
    width: number
    height: number
    model: string
    resolutionPreset: ResolutionPresetId
    sizeTier: SizeTierId
  }
  status: 'running' | 'success' | 'error'
  elapsedSeconds: number
  progressPct: number
  lastDuration: string | null
  results: GeneratedImage[]
  /** 重新生图时保留的上一次结果 */
  previousResults?: GeneratedImage[]
  error?: string
  createdAt: number
}

interface Props {
  results: GeneratedImage[]
  setResults: React.Dispatch<React.SetStateAction<GeneratedImage[]>>
  resultActiveIdx: number
  setResultActiveIdx: (v: number | ((prev: number) => number)) => void
  selectedImageIds: Set<string>
  setSelectedImageIds: React.Dispatch<React.SetStateAction<Set<string>>>
  status: 'idle' | 'running'
  storeStatus: string
  elapsedSeconds: number
  progressPct: number
  lastDuration: string | null
  batchSize: number
  downloadStatus: 'idle' | 'downloading'
  toggleSelectAll: () => void
  handleBatchDownload: () => void
  setPreviewImage: (img: GeneratedImage | null) => void
  generationSlots?: GenerationSlotView[]
  parallelCount?: number
  viewportCount?: number
  activeSlotId?: string | null
  setActiveSlotId?: (slotId: string | null) => void
  onSelectSlot?: (slot: GenerationSlotView) => void
  onRegenerateSlot?: (slot: GenerationSlotView) => void
  onRenameSlot?: (slotId: string, newName: string) => void
  onRetrySlot?: (slot: GenerationSlotView) => void
  onOpenInpaint?: (img: GeneratedImage) => void
}

const ResultPanel: React.FC<Props> = ({
  results,
  setResults,
  resultActiveIdx,
  setResultActiveIdx,
  selectedImageIds,
  setSelectedImageIds,
  status,
  storeStatus,
  elapsedSeconds,
  progressPct,
  lastDuration,
  batchSize,
  downloadStatus,
  toggleSelectAll,
  handleBatchDownload,
  setPreviewImage,
  generationSlots = [],
  parallelCount = 1,
  viewportCount: rawViewportCount = 1,
  activeSlotId,
  setActiveSlotId,
  onSelectSlot,
  onRegenerateSlot,
  onRenameSlot,
  onRetrySlot,
  onOpenInpaint,
}) => {
  const viewportCount = Math.max(1, Math.min(6, rawViewportCount))
  const [maximizedViewportIndex, setMaximizedViewportIndex] = useState<number | null>(null)
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null)
  const [viewportActiveImgIdx, setViewportActiveImgIdx] = useState<Record<string, number>>({})
  // 内联编辑视口名称
  const [editingViewportId, setEditingViewportId] = useState<string | null>(null)
  const [editingViewportName, setEditingViewportName] = useState('')
  const editInputRef = useRef<HTMLInputElement>(null)
  const VIEWPORT_COLORS = [
    {
      border: 'border-blue-400/50',
      bg: 'bg-blue-500/10',
      text: 'text-blue-300',
      dot: 'bg-blue-400',
      label: 'text-blue-300',
      ring: 'ring-blue-400/30',
      hex: '#60a5fa',
    },
    {
      border: 'border-emerald-400/50',
      bg: 'bg-emerald-500/10',
      text: 'text-emerald-300',
      dot: 'bg-emerald-400',
      label: 'text-emerald-300',
      ring: 'ring-emerald-400/30',
      hex: '#34d399',
    },
    {
      border: 'border-amber-400/50',
      bg: 'bg-amber-500/10',
      text: 'text-amber-300',
      dot: 'bg-amber-400',
      label: 'text-amber-300',
      ring: 'ring-amber-400/30',
      hex: '#fbbf24',
    },
    {
      border: 'border-pink-400/50',
      bg: 'bg-pink-500/10',
      text: 'text-pink-300',
      dot: 'bg-pink-400',
      label: 'text-pink-300',
      ring: 'ring-pink-400/30',
      hex: '#f472b6',
    },
    {
      border: 'border-purple-400/50',
      bg: 'bg-purple-500/10',
      text: 'text-purple-300',
      dot: 'bg-purple-400',
      label: 'text-purple-300',
      ring: 'ring-purple-400/30',
      hex: '#a78bfa',
    },
    {
      border: 'border-cyan-400/50',
      bg: 'bg-cyan-500/10',
      text: 'text-cyan-300',
      dot: 'bg-cyan-400',
      label: 'text-cyan-300',
      ring: 'ring-cyan-400/30',
      hex: '#22d3ee',
    },
  ] as const
  const safeIdx =
    results.length > 0 ? Math.min(Math.max(resultActiveIdx, 0), results.length - 1) : 0
  const activeSlot =
    generationSlots.find(slot => slot.id === activeSlotId) || generationSlots[0] || null
  const focusResults = activeSlot?.results ?? results
  const focusSafeIdx =
    focusResults.length > 0 ? Math.min(Math.max(resultActiveIdx, 0), focusResults.length - 1) : 0

  // ── 右键菜单 ──
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; img: GeneratedImage } | null>(null)
  const [ctxPos, setCtxPos] = useState<{ x: number; y: number } | null>(null)
  const ctxRef = useRef<HTMLDivElement>(null)

  const clampMenuPosition = useCallback((x: number, y: number, width = 176, height = 130) => {
    const margin = 8
    return {
      x: Math.min(Math.max(margin, x), Math.max(margin, window.innerWidth - width - margin)),
      y: Math.min(Math.max(margin, y), Math.max(margin, window.innerHeight - height - margin)),
    }
  }, [])

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, img: GeneratedImage) => {
      e.preventDefault()
      e.stopPropagation()
      const pos = { x: e.clientX, y: e.clientY }
      setCtxMenu({ x: pos.x, y: pos.y, img })
      setCtxPos(clampMenuPosition(pos.x, pos.y))
    },
    [clampMenuPosition],
  )

  useEffect(() => {
    if (!ctxMenu || !ctxRef.current) return
    const rect = ctxRef.current.getBoundingClientRect()
    const pos = clampMenuPosition(ctxMenu.x, ctxMenu.y, rect.width, rect.height)
    setCtxPos(prev => (prev && prev.x === pos.x && prev.y === pos.y ? prev : pos))
  }, [ctxMenu, clampMenuPosition])

  // 点击外部关闭
  useEffect(() => {
    if (!ctxMenu) return
    const close = (e: MouseEvent) => {
      if (ctxRef.current && !ctxRef.current.contains(e.target as Node)) setCtxMenu(null)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [ctxMenu])

  const handleCopyImage = async (url: string) => {
    setCtxMenu(null)
    try {
      const res = await fetch(url)
      const blob = await res.blob()
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
      setCopyFeedback('已复制到剪贴板')
      setTimeout(() => setCopyFeedback(null), 2000)
    } catch {
      // 回退：尝试 png
      try {
        const res = await fetch(url)
        const blob = await res.blob()
        const pngBlob =
          blob.type === 'image/png'
            ? blob
            : new Blob([await blob.arrayBuffer()], { type: 'image/png' })
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })])
        setCopyFeedback('已复制到剪贴板')
        setTimeout(() => setCopyFeedback(null), 2000)
      } catch {
        // 最终回退：复制图片链接
        try {
          await navigator.clipboard.writeText(url)
          setCopyFeedback('图片复制失败，已复制链接')
          setTimeout(() => setCopyFeedback(null), 3000)
        } catch {
          setCopyFeedback('复制失败，请手动保存')
          setTimeout(() => setCopyFeedback(null), 3000)
        }
      }
    }
  }

  const handleSaveAs = async (url: string) => {
    setCtxMenu(null)
    await downloadImage(url)
  }

  const handleOpenInpaint = (img: GeneratedImage) => {
    setCtxMenu(null)
    onOpenInpaint?.(img)
  }

  const getOriginalUrl = (img: GeneratedImage) =>
    (img as GeneratedImage & { originalUrl?: string }).originalUrl || img.url

  const selectSlot = (slot: GenerationSlotView) => {
    setActiveSlotId?.(slot.id)
    onSelectSlot?.(slot)
  }

  const handleSendToEagle = async (url: string) => {
    setCtxMenu(null)
    try {
      // Eagle API: POST http://localhost:41595/api/item/addFromURL
      const body = {
        url,
        name: `Liang007_${new Date().toISOString().replace(/[:.]/g, '-')}`,
        website: 'Liang007 Studio',
      }
      const res = await fetch('http://localhost:41595/api/item/addFromURL', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(`Eagle API: ${res.status}`)
    } catch (err) {
      console.error('发送到 Eagle 失败:', err)
      // 如果 Eagle 未运行，尝试用 base64
      try {
        const imgRes = await fetch(url)
        const blob = await imgRes.blob()
        const reader = new FileReader()
        const base64 = await new Promise<string>(resolve => {
          reader.onloadend = () => resolve((reader.result as string).split(',')[1])
          reader.readAsDataURL(blob)
        })
        await fetch('http://localhost:41595/api/item/addFromBase64', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            base64,
            name: `Liang007_${new Date().toISOString().replace(/[:.]/g, '-')}`,
            ext: 'png',
          }),
        })
      } catch (e2) {
        console.error('Eagle base64 回退也失败:', e2)
      }
    }
  }

  useEffect(() => {
    if (maximizedViewportIndex !== null && maximizedViewportIndex >= viewportCount) {
      setMaximizedViewportIndex(null)
    }
  }, [maximizedViewportIndex, viewportCount])

  useEffect(() => {
    if (maximizedViewportIndex === null) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMaximizedViewportIndex(null)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [maximizedViewportIndex])

  // 视口网格 class
  const gridClass =
    viewportCount <= 1
      ? ''
      : viewportCount <= 2
        ? 'grid grid-cols-2 grid-rows-1 gap-1'
        : viewportCount <= 4
          ? 'grid grid-cols-2 grid-rows-2 gap-1'
          : 'grid grid-cols-3 grid-rows-2 gap-1'

  // 将 slots 映射到视口：取最近的 viewportCount 个 slot（不足则填 null）
  const viewportSlots: (GenerationSlotView | null)[] = []
  for (let i = 0; i < viewportCount; i++) {
    viewportSlots.push(generationSlots[i] ?? null)
  }
  const visibleViewportSlots = viewportSlots
  const maximizedSlot =
    maximizedViewportIndex !== null ? (viewportSlots[maximizedViewportIndex] ?? null) : null
  const viewportStageClass = `min-h-[560px] flex-1 overflow-hidden p-1 ${gridClass}`

  // 渲染单个视口
  const renderViewportCell = (slot: GenerationSlotView | null, vpIndex: number) => {
    const isActive = slot ? slot.id === activeSlotId : false
    const firstImg = slot?.results?.[0]
    const imgUrl = firstImg ? getOriginalUrl(firstImg) : null

    return (
      <div
        key={slot?.id ?? `empty-${vpIndex}`}
        className={`group relative flex min-h-0 flex-1 flex-col overflow-hidden border transition ${viewportCount <= 1 ? '' : 'rounded-lg'} ${maximizedViewportIndex === vpIndex ? 'h-full w-full rounded-xl' : ''}`}
        style={{
          backgroundColor: isActive
            ? 'var(--viewport-bg-active, rgba(255,255,255,0.03))'
            : 'var(--viewport-bg, #07080d)',
          borderColor: isActive
            ? VIEWPORT_COLORS[vpIndex % 6].hex
            : `${VIEWPORT_COLORS[vpIndex % 6].hex}33`,
        }}
        onMouseEnter={e => {
          if (!isActive)
            (e.currentTarget as HTMLElement).style.borderColor =
              `${VIEWPORT_COLORS[vpIndex % 6].hex}80`
        }}
        onMouseLeave={e => {
          if (!isActive)
            (e.currentTarget as HTMLElement).style.borderColor =
              `${VIEWPORT_COLORS[vpIndex % 6].hex}33`
        }}
        onClick={() => {
          if (slot) {
            selectSlot(slot)
          }
        }}
      >
        {viewportCount >= 2 && (
          <div className="absolute right-1.5 top-1.5 z-20 flex gap-1 opacity-0 transition group-hover:opacity-100">
            <button
              type="button"
              className="flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-[10px] text-slate-300 transition hover:bg-primary-500/25 hover:text-primary-100"
              onClick={e => {
                e.stopPropagation()
                setMaximizedViewportIndex(maximizedViewportIndex === vpIndex ? null : vpIndex)
              }}
              title={maximizedViewportIndex === vpIndex ? '还原视口' : '最大化视口'}
            >
              {maximizedViewportIndex === vpIndex ? '↙' : '⛶'}
            </button>
            {slot && (
              <>
                {onRegenerateSlot && (
                  <button
                    type="button"
                    className="flex h-6 min-w-6 items-center justify-center rounded-full bg-black/55 px-1.5 text-[10px] text-slate-300 transition hover:bg-emerald-500/25 hover:text-emerald-100"
                    onClick={e => {
                      e.stopPropagation()
                      onRegenerateSlot(slot)
                    }}
                    title="重新生成此视口"
                  >
                    重
                  </button>
                )}
              </>
            )}
          </div>
        )}
        {(slot?.viewportName || viewportCount >= 2) && (
          <div
            className={`absolute left-1.5 top-1.5 z-20 rounded-full bg-black/70 px-2 py-0.5 text-[9px] font-bold backdrop-blur ${VIEWPORT_COLORS[vpIndex % 6].label}`}
            onDoubleClick={e => {
              e.stopPropagation()
              if (slot && onRenameSlot) {
                setEditingViewportId(slot.id)
                setEditingViewportName(slot.viewportName ?? '')
                setTimeout(() => editInputRef.current?.focus(), 0)
              }
            }}
            title={slot ? '双击重命名视口' : undefined}
          >
            {editingViewportId === slot?.id ? (
              <input
                ref={editInputRef}
                type="text"
                className="w-20 border-none bg-transparent text-[9px] font-bold outline-none placeholder:text-white/30"
                style={{ color: 'inherit' }}
                value={editingViewportName}
                placeholder="输入名称"
                onChange={e => setEditingViewportName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    if (slot) onRenameSlot?.(slot.id, editingViewportName.trim())
                    setEditingViewportId(null)
                  } else if (e.key === 'Escape') {
                    setEditingViewportId(null)
                  }
                }}
                onBlur={() => {
                  if (slot) onRenameSlot?.(slot.id, editingViewportName.trim())
                  setEditingViewportId(null)
                }}
                onClick={e => e.stopPropagation()}
                autoFocus
              />
            ) : (
              <>
                {slot?.viewportIndex ? `视口 ${slot.viewportIndex}` : `视口 ${vpIndex + 1}`}
                {slot?.viewportName ? ` · ${slot.viewportName}` : ''}
              </>
            )}
          </div>
        )}
        {/* 视口内：生成中 */}
        {slot?.status === 'running' ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {/* 上一次结果预览（如有） */}
            {slot.previousResults && slot.previousResults.length > 0 ? (
              (() => {
                const prevResults = slot.previousResults
                const prevActiveIdx =
                  viewportActiveImgIdx[`prev-${slot.id}`] ?? prevResults.length - 1
                const safePrevIdx = Math.min(Math.max(prevActiveIdx, 0), prevResults.length - 1)
                const prevImg = prevResults[safePrevIdx]
                const prevImgUrl = prevImg ? getOriginalUrl(prevImg) : null
                return (
                  <>
                    {/* 上一次主图（半透明叠加进度） */}
                    <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
                      {prevImgUrl && (
                        <img
                          src={safeUrl(prevImgUrl)}
                          alt=""
                          className="max-h-full max-w-full object-contain opacity-40 transition"
                          draggable={false}
                          onClick={e => {
                            e.stopPropagation()
                            setPreviewImage(prevImg)
                          }}
                          style={{ cursor: 'pointer' }}
                        />
                      )}
                      {/* 进度叠加层 */}
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/40">
                        <div className="h-7 w-7 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
                        <div className="w-full max-w-[180px] px-4">
                          <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-amber-400 to-primary-400 transition-all"
                              style={{ width: `${slot.progressPct}%` }}
                            />
                          </div>
                          <div className="mt-0.5 flex justify-between text-[9px] text-amber-200/90">
                            <span>
                              {Math.floor(slot.elapsedSeconds / 60) > 0
                                ? `${Math.floor(slot.elapsedSeconds / 60)}分${slot.elapsedSeconds % 60}秒`
                                : `${slot.elapsedSeconds}秒`}
                            </span>
                            <span>{slot.progressPct}%</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    {/* 上一次缩略图条 */}
                    {prevResults.length >= 1 && (
                      <div className="app-scrollbar flex flex-shrink-0 items-center gap-1 overflow-x-auto border-t border-white/[0.06] bg-black/30 px-1.5 py-1">
                        {prevResults.map((img, idx) => (
                          <button
                            key={img.id}
                            className={`h-8 w-8 flex-shrink-0 overflow-hidden rounded border-2 transition ${idx === safePrevIdx ? 'border-amber-400/70 ring-1 ring-amber-400/30' : 'border-transparent opacity-50 hover:opacity-80'}`}
                            onClick={e => {
                              e.stopPropagation()
                              setViewportActiveImgIdx(prev => ({
                                ...prev,
                                [`prev-${slot.id}`]: idx,
                              }))
                            }}
                          >
                            <img
                              src={safeUrl(img.url || getOriginalUrl(img))}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )
              })()
            ) : (
              /* 无上一次结果：纯进度条 */
              <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-6">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
                <div className="w-full max-w-[200px]">
                  <div className="h-2 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-amber-400 to-primary-400 transition-all"
                      style={{ width: `${slot.progressPct}%` }}
                    />
                  </div>
                  <div className="mt-1 flex justify-between text-[10px] text-amber-200">
                    <span>
                      {Math.floor(slot.elapsedSeconds / 60) > 0
                        ? `${Math.floor(slot.elapsedSeconds / 60)}分${slot.elapsedSeconds % 60}秒`
                        : `${slot.elapsedSeconds}秒`}
                    </span>
                    <span>{slot.progressPct}%</span>
                  </div>
                </div>
                {viewportCount > 1 && (
                  <p className="truncate text-[10px] text-slate-500">{slot.request.model}</p>
                )}
              </div>
            )}
          </div>
        ) : /* 视口内：失败 */
        slot?.status === 'error' ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
            <svg
              className="h-6 w-6 text-red-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <p className="line-clamp-2 text-[11px] text-red-200/80">{slot.error}</p>
            {onRetrySlot && (
              <button
                className="rounded-lg border border-red-400/20 bg-red-500/10 px-3 py-1 text-[11px] text-red-200 transition hover:bg-red-500/20"
                onClick={e => {
                  e.stopPropagation()
                  onRetrySlot(slot)
                }}
              >
                重试
              </button>
            )}
          </div>
        ) : /* 视口内：有结果 */
        slot && imgUrl ? (
          (() => {
            const activeIdx = viewportActiveImgIdx[slot.id] ?? slot.results.length - 1
            const safeActiveIdx = Math.min(Math.max(activeIdx, 0), slot.results.length - 1)
            const activeImg = slot.results[safeActiveIdx] ?? firstImg!
            const activeImgUrl = getOriginalUrl(activeImg)
            return (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <div
                  className="group relative flex min-h-0 flex-1 cursor-pointer items-center justify-center overflow-hidden"
                  onClick={e => {
                    e.stopPropagation()
                    setPreviewImage(activeImg)
                  }}
                  onContextMenu={e => handleContextMenu(e, activeImg)}
                >
                  <img
                    src={safeUrl(activeImgUrl)}
                    alt=""
                    className="max-h-full max-w-full object-contain transition-all duration-200 group-hover:scale-[1.01]"
                    draggable={false}
                  />
                </div>
                {slot.results.length > 1 && (
                  <div className="app-scrollbar flex flex-shrink-0 items-center gap-1 overflow-x-auto border-t border-white/[0.06] bg-black/30 px-1.5 py-1">
                    {slot.results.map((img, idx) => (
                      <button
                        key={img.id}
                        className={`h-8 w-8 flex-shrink-0 overflow-hidden rounded border-2 transition ${idx === safeActiveIdx ? 'border-primary-400 ring-1 ring-primary-400/30' : 'border-transparent opacity-60 hover:opacity-100'}`}
                        onClick={e => {
                          e.stopPropagation()
                          setViewportActiveImgIdx(prev => ({ ...prev, [slot.id]: idx }))
                        }}
                      >
                        <img
                          src={safeUrl(img.url || getOriginalUrl(img))}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })()
        ) : (
          /* 视口内：空占位 */
          <div
            className="flex flex-1 flex-col items-center justify-center gap-2"
            style={{ color: 'var(--viewport-empty-text, rgb(100,116,139))' }}
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.04]">
              <svg
                className="h-5 w-5 opacity-40"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
            </div>
            <span className="text-[10px]">视口 {vpIndex + 1}</span>
          </div>
        )}
      </div>
    )
  }

  return (
    <section
      className={`glass-card workspace-panel flex min-w-[200px] flex-1 flex-col overflow-hidden ${status === 'running' ? 'generating-pulse' : ''}`}
    >
      {/* 标题栏 */}
      <div className="panel-titlebar hud-line relative flex flex-shrink-0 items-center justify-between border-b border-white/[0.06] px-3 py-1.5">
        <div className="flex items-center gap-2 text-sm text-slate-200">
          <span className="font-semibold">生成结果</span>
          {results.length > 0 && <span className="badge-primary">{results.length} 张</span>}
          {results.length > 0 && lastDuration && (
            <span className="badge-primary/60 font-mono text-slate-500">用时 {lastDuration}</span>
          )}
          {generationSlots.length > 0 && parallelCount > 1 && (
            <span className="badge-primary/60 font-mono text-slate-400">
              并行 {parallelCount} · 运行{' '}
              {generationSlots.filter(slot => slot.status === 'running').length}
            </span>
          )}
          {storeStatus === 'running' &&
            (() => {
              const mins = Math.floor(elapsedSeconds / 60)
              const secs = elapsedSeconds % 60
              return (
                <span className="badge-warning flex items-center gap-1">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
                  生成中 {mins > 0 ? `(${mins}分${secs}秒)` : `(${secs}秒)`}
                </span>
              )
            })()}
          {selectedImageIds.size > 0 && (
            <span className="badge-success">已选 {selectedImageIds.size}</span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          {results.length > 0 && (
            <>
              <button
                onClick={toggleSelectAll}
                className="glass-button btn-hover-lift rounded-lg px-2.5 py-1 text-xs"
              >
                {selectedImageIds.size === results.length ? '取消全选' : '全选'}
              </button>
              <button
                onClick={handleBatchDownload}
                disabled={selectedImageIds.size === 0 || downloadStatus === 'downloading'}
                className="glass-button btn-hover-lift rounded-lg px-2.5 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-30"
              >
                {downloadStatus === 'downloading' ? '下载中...' : '批量下载'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* 内容区 */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* ── 多视口网格（viewportCount >= 2）── */}
        {viewportCount >= 2 ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className={viewportStageClass}>
              {visibleViewportSlots.map((slot, idx) =>
                renderViewportCell(slot, maximizedViewportIndex ?? idx),
              )}
            </div>
            {/* 底部视口切换栏 */}
            <div className="app-scrollbar flex h-11 flex-shrink-0 items-center justify-center gap-1.5 overflow-x-auto border-t border-white/[0.06] bg-black/20 px-2 py-1.5">
              {viewportSlots.map((slot, idx) => {
                const isActive = slot ? slot.id === activeSlotId : false
                const thumb = slot?.results?.[0]
                return (
                  <button
                    key={slot?.id ?? `vp-${idx}`}
                    className={`relative flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border transition ${
                      isActive
                        ? `${VIEWPORT_COLORS[idx % 6].bg} ring-1 ${VIEWPORT_COLORS[idx % 6].ring}`
                        : slot?.status === 'running'
                          ? 'border-amber-400/30 bg-amber-500/10'
                          : slot?.status === 'error'
                            ? 'border-red-400/30 bg-red-500/10'
                            : 'bg-white/[0.04]'
                    }`}
                    style={{
                      borderColor: isActive
                        ? VIEWPORT_COLORS[idx % 6].hex
                        : slot?.status === 'running'
                          ? undefined
                          : slot?.status === 'error'
                            ? undefined
                            : `${VIEWPORT_COLORS[idx % 6].hex}33`,
                    }}
                    onClick={() => {
                      if (slot) {
                        selectSlot(slot)
                      }
                      if (maximizedViewportIndex !== null) setMaximizedViewportIndex(idx)
                    }}
                    title={`视口 ${idx + 1}${slot?.status === 'running' ? ' · 生成中' : slot?.status === 'error' ? ' · 失败' : slot?.results?.length ? ` · ${slot.results.length}张` : ''}`}
                  >
                    {thumb ? (
                      <img
                        src={safeUrl(thumb.url || getOriginalUrl(thumb))}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : slot?.status === 'running' ? (
                      <div className="h-3 w-3 animate-spin rounded-full border border-amber-300 border-t-transparent" />
                    ) : slot?.status === 'error' ? (
                      <span className="text-[10px] font-bold text-red-300">!</span>
                    ) : (
                      <span className={`text-[8px] font-bold ${VIEWPORT_COLORS[idx % 6].label}`}>
                        {idx + 1}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        ) : /* ── 单视口模式（viewportCount=1） ── */
        generationSlots.length > 0 && generationSlots[0] ? (
          <div className="flex h-full w-full flex-col overflow-hidden bg-[#07080d]">
            {/* 活跃槽位信息 */}
            {activeSlot && (
              <div className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-white/[0.06] bg-white/[0.025] px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] ${activeSlot.status === 'running' ? 'bg-amber-500/15 text-amber-200' : activeSlot.status === 'error' ? 'bg-red-500/15 text-red-200' : 'bg-emerald-500/15 text-emerald-200'}`}
                    >
                      {activeSlot.status === 'running'
                        ? '生成中'
                        : activeSlot.status === 'error'
                          ? '生成失败'
                          : `已完成 ${activeSlot.results.length} 张`}
                    </span>
                    <span className="font-mono text-[11px] text-slate-500">
                      {activeSlot.request.width}×{activeSlot.request.height} · batch{' '}
                      {activeSlot.request.batchSize}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-[11px] leading-relaxed text-slate-400">
                    {activeSlot.request.prompt}
                  </p>
                </div>
                <div className="hidden max-w-[36%] truncate font-mono text-[10px] text-slate-500 lg:block">
                  {activeSlot.request.model}
                </div>
                {activeSlot.status !== 'running' && onRetrySlot && (
                  <button
                    className="flex-shrink-0 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[11px] text-slate-300 transition hover:bg-white/[0.08]"
                    onClick={() => onRetrySlot(activeSlot)}
                  >
                    重试
                  </button>
                )}
              </div>
            )}

            {/* 主图区 */}
            <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.055),transparent_55%)] px-4 py-4">
              {activeSlot?.status === 'running' ? (
                <div className="flex w-full max-w-md flex-col items-center gap-5 rounded-3xl border border-amber-400/20 bg-black/30 px-8 py-8 shadow-2xl backdrop-blur-md">
                  <div className="flex h-24 w-24 flex-col items-center justify-center rounded-3xl border border-amber-400/25 bg-amber-500/10 shadow-2xl">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
                    <span className="mt-3 font-mono text-xs font-semibold text-amber-100">
                      {Math.floor(activeSlot.elapsedSeconds / 60) > 0
                        ? `${Math.floor(activeSlot.elapsedSeconds / 60)}分${activeSlot.elapsedSeconds % 60}秒`
                        : `${activeSlot.elapsedSeconds}秒`}
                    </span>
                  </div>
                  <div className="w-full">
                    <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-amber-400 to-primary-400 transition-all"
                        style={{ width: `${activeSlot.progressPct}%` }}
                      />
                    </div>
                    <div className="mt-2 flex justify-between text-[11px] text-amber-100/90">
                      <span>生成中…</span>
                      <span>{activeSlot.progressPct}%</span>
                    </div>
                  </div>
                </div>
              ) : activeSlot?.status === 'error' ? (
                <div className="flex max-w-md flex-col items-center gap-3 px-6 text-center text-red-300">
                  <span className="text-sm font-semibold">生成失败</span>
                  <p className="text-xs leading-relaxed text-red-200/80">{activeSlot.error}</p>
                  {onRetrySlot && (
                    <button
                      className="rounded-lg border border-red-400/20 bg-red-500/10 px-3 py-1.5 text-xs text-red-200 transition hover:bg-red-500/20"
                      onClick={() => onRetrySlot(activeSlot)}
                    >
                      重试
                    </button>
                  )}
                </div>
              ) : focusResults.length > 0 ? (
                (() => {
                  const activeImg = focusResults[focusSafeIdx]
                  const activeImgUrl = getOriginalUrl(activeImg)
                  return (
                    <div
                      className="group relative flex h-full w-full cursor-pointer items-center justify-center"
                      onClick={() => setPreviewImage(activeImg)}
                      onContextMenu={e => handleContextMenu(e, activeImg)}
                    >
                      <img
                        key={`slot-focus-${activeSlot?.id}-${focusSafeIdx}`}
                        src={safeUrl(activeImgUrl)}
                        alt=""
                        className="max-h-full max-w-full rounded-2xl object-contain shadow-2xl transition-all duration-300"
                        draggable={false}
                      />
                      {focusResults.length > 1 && (
                        <div className="absolute bottom-3 left-1/2 flex max-w-[90%] -translate-x-1/2 gap-1.5 overflow-x-auto rounded-xl border border-white/[0.08] bg-black/55 px-2 py-1.5 backdrop-blur">
                          {focusResults.map((img, idx) => (
                            <button
                              key={img.id}
                              className={`h-10 w-10 flex-shrink-0 overflow-hidden rounded-lg border-2 transition ${idx === focusSafeIdx ? 'border-primary-400' : 'border-transparent opacity-70 hover:opacity-100'}`}
                              onClick={e => {
                                e.stopPropagation()
                                setResultActiveIdx(idx)
                              }}
                            >
                              <img
                                src={safeUrl(img.url || getOriginalUrl(img))}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })()
              ) : (
                <span className="text-xs text-slate-500">暂无图片</span>
              )}
            </div>
          </div>
        ) : status === 'running' && results.length === 0 ? (
          /* 骨架屏 */
          <div className="grid h-full w-full grid-cols-2 gap-4 p-4 md:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: batchSize }).map((_, i) => (
              <div key={i} className="overflow-hidden rounded-xl">
                <div className="skeleton h-40 w-full" />
                <div className="space-y-1.5 p-2">
                  <div className="skeleton h-2.5 w-3/4" />
                  <div className="skeleton h-2 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : results.length === 0 ? (
          /* 空状态 */
          <div className="flex h-full w-full flex-col items-center justify-center px-8 py-12 text-slate-500">
            <div className="empty-placeholder group mb-6 flex h-52 w-72 cursor-default flex-col items-center justify-center rounded-[30px]">
              <div className="mb-5 grid grid-cols-3 gap-2 opacity-50">
                {[
                  'bg-purple-500/30',
                  'bg-blue-500/30',
                  'bg-pink-500/30',
                  'bg-amber-500/30',
                  'bg-emerald-500/30',
                  'bg-cyan-500/30',
                ].map((c, i) => (
                  <div key={i} className={`h-8 w-8 rounded-lg ${c}`} />
                ))}
              </div>
              <p className="text-xs font-medium text-slate-500">你的作品将在这里展示</p>
            </div>
            <p className="mb-1 text-sm font-medium text-slate-400">暂无生成结果</p>
            <p className="max-w-[220px] text-center text-xs leading-relaxed text-slate-400">
              在右侧输入提示词，
              <br />
              选择模型后点击「开始生图」
            </p>
          </div>
        ) : (
          (() => {
            const activeImg = results[safeIdx]
            const extendedImg = activeImg as typeof activeImg & { originalUrl?: string }
            const activeImgUrl = extendedImg.originalUrl || activeImg.url
            return (
              <div className="flex h-full w-full flex-col">
                {/* 主图区 */}
                <div
                  className="group relative flex-1 cursor-pointer overflow-hidden"
                  onClick={() => {
                    if (status !== 'running') setPreviewImage(activeImg)
                  }}
                  onContextMenu={e => handleContextMenu(e, activeImg)}
                >
                  <img
                    key={`main-${safeIdx}`}
                    src={activeImgUrl}
                    alt=""
                    className={`h-full w-full object-contain ${status === 'running' ? 'scale-105 opacity-40' : ''} transition-all duration-300`}
                    draggable={false}
                    onError={e => {
                      e.currentTarget.style.display = 'none'
                      const sibling = e.currentTarget.nextElementSibling as HTMLElement
                      if (sibling) sibling.style.display = 'flex'
                    }}
                  />
                  <div className="hidden h-full w-full items-center justify-center text-slate-400">
                    图片加载失败
                  </div>

                  {status === 'running' && (
                    <div className="absolute right-3 top-3 z-30 rounded-xl border border-amber-400/25 bg-black/55 px-3 py-1.5 font-mono text-xs font-semibold text-amber-200 shadow-xl backdrop-blur-md">
                      生图时间{' '}
                      {Math.floor(elapsedSeconds / 60) > 0
                        ? `${Math.floor(elapsedSeconds / 60)}分${elapsedSeconds % 60}秒`
                        : `${elapsedSeconds}秒`}
                    </div>
                  )}

                  {/* 生成中遮罩 */}
                  {status === 'running' && (
                    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center">
                      <div className="overlay-dark absolute inset-0 backdrop-blur-sm" />
                      <div className="relative z-10 flex w-full max-w-xs flex-col items-center gap-3 px-6">
                        <div className="flex items-center gap-2 text-white">
                          <svg
                            className="h-5 w-5 animate-spin text-amber-400"
                            fill="none"
                            viewBox="0 0 24 24"
                          >
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                            />
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                            />
                          </svg>
                          <span className="text-sm font-medium">生成中…</span>
                          <span className="ml-1 font-mono text-xs text-amber-300">
                            {Math.floor(elapsedSeconds / 60) > 0
                              ? `${Math.floor(elapsedSeconds / 60)}分${elapsedSeconds % 60}秒`
                              : `${elapsedSeconds}秒`}
                          </span>
                        </div>
                        <div className="w-full">
                          <div className="h-2 w-full overflow-hidden rounded-full bg-white/20">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-500 transition-all duration-500"
                              style={{ width: `${progressPct}%` }}
                            />
                          </div>
                          <div className="mt-1 flex justify-between">
                            <span className="text-[10px] text-amber-200">正在生成新图…</span>
                            <span className="font-mono text-[10px] text-amber-200">
                              {progressPct}%
                            </span>
                          </div>
                        </div>
                        <p className="text-center text-[10px] text-white/60">
                          旧图已保留，新图完成后自动切换
                        </p>
                      </div>
                    </div>
                  )}

                  {/* 返回按钮 */}
                  <button
                    className="absolute left-2 top-2 z-30 flex h-8 w-8 items-center justify-center rounded-full bg-black/80 text-white opacity-0 transition hover:bg-slate-600 group-hover:opacity-100"
                    onClick={e => {
                      e.stopPropagation()
                      setResults([])
                      setResultActiveIdx(0)
                      setSelectedImageIds(new Set())
                    }}
                    title="返回默认界面"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M10 19l-7-7m0 0l7-7m-7 7h18"
                      />
                    </svg>
                  </button>

                  {/* 左右切换 */}
                  {results.length > 1 && (
                    <>
                      <button
                        className="absolute left-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-xl leading-none text-white opacity-0 transition hover:bg-black/60 group-hover:opacity-100"
                        onClick={e => {
                          e.stopPropagation()
                          setResultActiveIdx(i => (i - 1 + results.length) % results.length)
                        }}
                      >
                        ‹
                      </button>
                      <button
                        className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-xl leading-none text-white opacity-0 transition hover:bg-black/60 group-hover:opacity-100"
                        onClick={e => {
                          e.stopPropagation()
                          setResultActiveIdx(i => (i + 1) % results.length)
                        }}
                      >
                        ›
                      </button>
                      <div className="absolute right-2 top-2 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-medium text-white">
                        {safeIdx + 1} / {results.length}
                      </div>
                    </>
                  )}
                </div>

                {/* 缩略图横条 */}
                {results.length > 1 && (
                  <div className="app-scrollbar flex flex-shrink-0 gap-1.5 overflow-x-auto border-t border-white/[0.06] px-2 py-2">
                    {results.map((img, idx) => {
                      const extImg = img as typeof img & { originalUrl?: string }
                      const thumbUrl = img.url || extImg.originalUrl
                      return (
                        <div key={img.id} className="relative flex-shrink-0">
                          <button
                            onClick={() => setResultActiveIdx(idx)}
                            className={`h-12 w-12 overflow-hidden rounded-lg border-2 transition-all ${idx === safeIdx ? 'border-primary-400 ring-1 ring-primary-400/30' : 'border-transparent hover:border-white/20'}`}
                          >
                            <img
                              src={safeUrl(thumbUrl)}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })()
        )}
      </div>

      {/* ── 自定义右键菜单 ── */}
      {maximizedViewportIndex !== null &&
        createPortal(
          <div className="fixed inset-0 z-[9990] flex flex-col bg-[#03040a]">
            <div className="flex min-h-0 min-w-0 flex-1 p-2">
              {renderViewportCell(maximizedSlot, maximizedViewportIndex)}
            </div>
            <div className="app-scrollbar flex h-12 flex-shrink-0 items-center justify-center gap-2 overflow-x-auto border-t border-white/[0.08] bg-black/45 px-3 py-2 backdrop-blur-xl">
              {viewportSlots.map((slot, idx) => {
                const isActive = idx === maximizedViewportIndex
                const thumb = slot?.results?.[0]
                return (
                  <button
                    key={slot?.id ?? `max-vp-${idx}`}
                    className={`relative flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border transition ${
                      isActive
                        ? 'border-primary-400 bg-primary-500/15 ring-1 ring-primary-400/40'
                        : slot?.status === 'running'
                          ? 'border-amber-400/30 bg-amber-500/10'
                          : slot?.status === 'error'
                            ? 'border-red-400/30 bg-red-500/10'
                            : 'border-white/[0.08] bg-white/[0.04] hover:border-white/20'
                    }`}
                    onClick={() => {
                      if (slot) selectSlot(slot)
                      setMaximizedViewportIndex(idx)
                    }}
                    title={`视口 ${idx + 1}`}
                  >
                    {thumb ? (
                      <img
                        src={safeUrl(thumb.url || getOriginalUrl(thumb))}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : slot?.status === 'running' ? (
                      <div className="h-3 w-3 animate-spin rounded-full border border-amber-300 border-t-transparent" />
                    ) : slot?.status === 'error' ? (
                      <span className="text-[10px] font-bold text-red-300">!</span>
                    ) : (
                      <span className={`text-[8px] font-bold ${VIEWPORT_COLORS[idx % 6].label}`}>
                        {idx + 1}
                      </span>
                    )}
                  </button>
                )
              })}
              <button
                type="button"
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-sm text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
                onClick={() => setMaximizedViewportIndex(null)}
                title="退出最大化"
              >
                ↙
              </button>
            </div>
          </div>,
          document.body,
        )}

      {/* ── 自定义右键菜单 ── */}
      {ctxMenu &&
        createPortal(
          (() => {
            const url = getOriginalUrl(ctxMenu.img)
            return (
              <div
                ref={ctxRef}
                className="glass-popup fixed z-[10000] w-44 rounded-xl py-1.5 shadow-2xl"
                style={{ left: ctxPos?.x ?? ctxMenu.x, top: ctxPos?.y ?? ctxMenu.y }}
              >
                <button
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs text-slate-200 transition hover:bg-white/[0.06]"
                  onClick={() => handleCopyImage(url)}
                >
                  <svg
                    className="h-3.5 w-3.5 text-slate-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  </svg>
                  复制图片
                </button>
                <button
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs text-slate-200 transition hover:bg-white/[0.06]"
                  onClick={() => handleSaveAs(url)}
                >
                  <svg
                    className="h-3.5 w-3.5 text-slate-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    />
                  </svg>
                  另存为...
                </button>
                <button
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs text-slate-200 transition hover:bg-white/[0.06]"
                  onClick={() => handleOpenInpaint(ctxMenu.img)}
                >
                  <svg
                    className="h-3.5 w-3.5 text-primary-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15.232 5.232l3.536 3.536M4 20h4.586a1 1 0 00.707-.293l9.475-9.475a2.5 2.5 0 00-3.536-3.536L5.757 16.172a1 1 0 00-.293.707V20z"
                    />
                  </svg>
                  局部重绘
                </button>
                <div className="mx-2 my-1 h-px bg-white/[0.06]" />
                <button
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs text-slate-200 transition hover:bg-white/[0.06]"
                  onClick={() => handleSendToEagle(url)}
                >
                  <svg
                    className="h-3.5 w-3.5 text-emerald-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                    />
                  </svg>
                  发送到 Eagle
                </button>
              </div>
            )
          })(),
          document.body,
        )}
      {copyFeedback && (
        <div className="pointer-events-none fixed inset-x-0 bottom-8 z-[99999] flex justify-center">
          <div className="pointer-events-auto rounded-lg bg-slate-800/90 px-4 py-2 text-xs text-slate-100 shadow-lg backdrop-blur">
            {copyFeedback}
          </div>
        </div>
      )}
    </section>
  )
}

export default ResultPanel
