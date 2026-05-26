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
import { VIEWPORT_COLORS } from '../utils/viewportColors'
import {
  getFavorites,
  getFavoriteId,
  isFavorited,
  toggleFavorite,
  removeFavorite,
  addTagToFavorite,
  removeTagFromFavorite,
  setFavoriteGroup,
  getAllTags,
  getAllGroups,
  type FavoriteImage,
} from '../utils/favorites'

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
  /** 当前全屏预览的图片（用于 Esc 优先级判断） */
  previewImage?: GeneratedImage | null
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
  /** 画廊数据：历史视口组条目，非空时显示画廊标签 */
  galleryEntries?: GalleryEntry[] | null
  /** 关闭画廊 */
  onGalleryClose?: () => void
}

/** 画廊条目 — 历史视口组中的一个视口 */
export type GalleryEntry = {
  id: string
  viewportIndex?: number
  viewportName?: string
  prompt: string
  model: string
  width: number
  height: number
  batchSize: number
  results: GeneratedImage[]
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
  previewImage,
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
  galleryEntries,
  onGalleryClose,
}) => {
  const viewportCount = Math.max(1, Math.min(6, rawViewportCount))
  const [maximizedViewportIndex, setMaximizedViewportIndex] = useState<number | null>(null)
  const [selectedViewportIdx, setSelectedViewportIdx] = useState<number | null>(null)
  // 标签页：'results' | 'gallery'
  const [activeTab, setActiveTab] = useState<'results' | 'gallery'>('results')
  // 画廊内选中的视口索引
  const [galleryActiveIdx, setGalleryActiveIdx] = useState(0)
  // 画廊内每个视口当前查看的图片索引
  const [galleryImageIdx, setGalleryImageIdx] = useState<Record<number, number>>({})
  // 收藏列表版本号（用于触发重新渲染）
  const [, setFavVersion] = useState(0)
  const favorites = getFavorites()
  // 画廊子标签：'current' | 'favorites'
  const [gallerySubTab, setGallerySubTab] = useState<'current' | 'favorites'>('current')
  // 收藏列表中选中的图片索引
  const [favActiveIdx, setFavActiveIdx] = useState(0)
  // 收藏筛选：标签 / 分组
  const [favFilterTag, setFavFilterTag] = useState<string | null>(null)
  const [favFilterGroup, setFavFilterGroup] = useState<string | null>(null)
  // 收藏显示方式 — 默认网格（Eagle风格）
  const [favViewMode, setFavViewMode] = useState<'single' | 'grid' | 'list'>('grid')
  // 标签输入
  const [tagInput, setTagInput] = useState('')
  const [tagEditImgId, setTagEditImgId] = useState<string | null>(null)
  // 分组输入
  const [groupInput, setGroupInput] = useState('')
  const [groupEditImgId, setGroupEditImgId] = useState<string | null>(null)
  // 网格悬浮预览
  const [hoverPreview, setHoverPreview] = useState<{
    fav: FavoriteImage
    x: number
    y: number
  } | null>(null)
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null)
  const copyFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showCopyFeedback = useCallback((msg: string, duration = 2000) => {
    if (copyFeedbackTimerRef.current) clearTimeout(copyFeedbackTimerRef.current)
    setCopyFeedback(msg)
    copyFeedbackTimerRef.current = setTimeout(() => setCopyFeedback(null), duration)
  }, [])
  useEffect(() => {
    return () => {
      if (copyFeedbackTimerRef.current) clearTimeout(copyFeedbackTimerRef.current)
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
    }
  }, [])
  const [viewportActiveImgIdx, setViewportActiveImgIdx] = useState<Record<string, number>>({})
  // 内联编辑视口名称
  const [editingViewportId, setEditingViewportId] = useState<string | null>(null)
  const [editingViewportName, setEditingViewportName] = useState('')
  const editInputRef = useRef<HTMLInputElement>(null)
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
      showCopyFeedback('已复制到剪贴板')
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
        showCopyFeedback('已复制到剪贴板')
      } catch {
        // 最终回退：复制图片链接
        try {
          await navigator.clipboard.writeText(url)
          showCopyFeedback('图片复制失败，已复制链接', 3000)
        } catch {
          showCopyFeedback('复制失败，请手动保存', 3000)
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

  // 收藏/取消收藏
  const handleToggleFavorite = useCallback(
    (
      img: GeneratedImage,
      meta?: { prompt?: string; model?: string; width?: number; height?: number },
    ) => {
      const extImg = img as typeof img & { originalUrl?: string }
      toggleFavorite({ id: img.id, url: img.url, originalUrl: extImg.originalUrl }, meta)
      setFavVersion(v => v + 1)
    },
    [],
  )

  // 收藏心形图标渲染（每次渲染时都重新检查收藏状态）
  const renderFavHeart = useCallback(
    (
      img: GeneratedImage,
      meta?: { prompt?: string; model?: string; width?: number; height?: number },
      size = 20,
    ) => {
      const extImg = img as typeof img & { originalUrl?: string }
      const faved = isFavorited(
        getFavoriteId({ id: img.id, url: img.url, originalUrl: extImg.originalUrl }),
      )
      return (
        <button
          className={`flex items-center justify-center rounded-full transition ${
            faved
              ? 'bg-red-500/30 text-red-400 hover:bg-red-500/50'
              : 'bg-black/50 text-white/40 hover:bg-black/70 hover:text-white/70'
          }`}
          style={{ width: size + 8, height: size + 8 }}
          onClick={e => {
            e.stopPropagation()
            handleToggleFavorite(img, meta)
          }}
          title={faved ? '取消收藏' : '收藏'}
        >
          <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill={faved ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
            />
          </svg>
        </button>
      )
    },
    [handleToggleFavorite],
  )

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

  // 画廊数据传入时自动切换到画廊标签 + 当前子标签
  useEffect(() => {
    if (galleryEntries && galleryEntries.length > 0) {
      setActiveTab('gallery')
      setGallerySubTab('current')
      setGalleryActiveIdx(0)
      setGalleryImageIdx({})
    }
  }, [galleryEntries])

  // Esc 优先级：浮层 > 全屏预览 > 画廊
  useEffect(() => {
    if (activeTab !== 'gallery') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // 1. 标签/分组编辑浮层打开时先关浮层
        if (tagEditImgId || groupEditImgId) {
          setTagEditImgId(null)
          setGroupEditImgId(null)
          return
        }
        // 2. 全屏预览打开时不处理（让预览组件自己处理）
        if (previewImage) return
        // 3. 关闭画廊
        onGalleryClose?.()
        setActiveTab('results')
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [activeTab, onGalleryClose, previewImage, tagEditImgId, groupEditImgId])

  useEffect(() => {
    if (maximizedViewportIndex === null) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMaximizedViewportIndex(null)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [maximizedViewportIndex])

  // 将 slots 映射到视口：取最近的 viewportCount 个 slot（不足则填 null）
  const viewportSlots: (GenerationSlotView | null)[] = []
  for (let i = 0; i < viewportCount; i++) {
    viewportSlots.push(generationSlots[i] ?? null)
  }

  // activeSlotId 从外部变化时同步选中索引
  useEffect(() => {
    if (!activeSlotId) return
    const idx = generationSlots.findIndex(s => s?.id === activeSlotId)
    if (idx >= 0 && idx < viewportCount) setSelectedViewportIdx(idx)
  }, [activeSlotId, generationSlots, viewportCount])

  // 视口网格 class
  const gridClass =
    viewportCount <= 1
      ? ''
      : viewportCount <= 2
        ? 'grid grid-cols-2 grid-rows-1 gap-1'
        : viewportCount <= 4
          ? 'grid grid-cols-2 grid-rows-2 gap-1'
          : 'grid grid-cols-3 grid-rows-2 gap-1'

  const visibleViewportSlots = viewportSlots
  const maximizedSlot =
    maximizedViewportIndex !== null ? (viewportSlots[maximizedViewportIndex] ?? null) : null
  const viewportStageClass = `min-h-[560px] flex-1 overflow-hidden p-1 ${gridClass}`

  // 渲染单个视口
  const renderViewportCell = (slot: GenerationSlotView | null, vpIndex: number) => {
    const isActive = slot ? slot.id === activeSlotId : false
    const isSelected = selectedViewportIdx === vpIndex
    const isHighlighted = isActive || isSelected
    const firstImg = slot?.results?.[0]
    const imgUrl = firstImg ? getOriginalUrl(firstImg) : null

    return (
      <div
        key={slot?.id ?? `empty-${vpIndex}`}
        className={`group relative flex min-h-0 flex-1 flex-col overflow-hidden border-2 transition ${viewportCount <= 1 ? '' : 'rounded-lg'} ${maximizedViewportIndex === vpIndex ? 'h-full w-full rounded-xl' : ''}`}
        style={{
          backgroundColor: isHighlighted
            ? 'var(--viewport-bg-active, rgba(255,255,255,0.03))'
            : 'var(--viewport-bg, #07080d)',
          borderColor: isHighlighted
            ? VIEWPORT_COLORS[vpIndex % 6].hex
            : `${VIEWPORT_COLORS[vpIndex % 6].hex}33`,
        }}
        onMouseEnter={e => {
          if (!isHighlighted)
            (e.currentTarget as HTMLElement).style.borderColor =
              `${VIEWPORT_COLORS[vpIndex % 6].hex}80`
        }}
        onMouseLeave={e => {
          if (!isHighlighted)
            (e.currentTarget as HTMLElement).style.borderColor =
              `${VIEWPORT_COLORS[vpIndex % 6].hex}33`
        }}
        onClick={() => {
          setSelectedViewportIdx(vpIndex)
          if (slot) {
            selectSlot(slot)
          }
        }}
        onDoubleClick={e => {
          e.stopPropagation()
          if (viewportCount >= 2) {
            setMaximizedViewportIndex(maximizedViewportIndex === vpIndex ? null : vpIndex)
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
          {/* 标签切换 */}
          <button
            className={`rounded-md px-2 py-0.5 text-[12px] font-semibold transition ${
              activeTab === 'results'
                ? 'bg-primary-500/20 text-primary-300'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            onClick={() => setActiveTab('results')}
          >
            生成结果
          </button>
          <button
            className={`relative rounded-md px-2 py-0.5 text-[12px] font-semibold transition ${
              activeTab === 'gallery'
                ? 'bg-amber-500/20 text-amber-300'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            onClick={() => setActiveTab('gallery')}
          >
            画廊
            {galleryEntries && galleryEntries.length > 0 && activeTab !== 'gallery' && (
              <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-amber-400" />
            )}
          </button>
          <span className="mx-1 h-3 w-px bg-white/[0.08]" />
          {activeTab === 'results' && (
            <>
              {results.length > 0 && <span className="badge-primary">{results.length} 张</span>}
              {results.length > 0 && lastDuration && (
                <span className="badge-primary/60 font-mono text-slate-500">
                  用时 {lastDuration}
                </span>
              )}
              {generationSlots.length > 0 && parallelCount > 1 && (
                <span className="badge-primary/60 font-mono text-slate-400">
                  并行 {parallelCount} · 运行{' '}
                  {generationSlots.filter(slot => slot.status === 'running').length}
                </span>
              )}
            </>
          )}
          {activeTab === 'gallery' && galleryEntries && galleryEntries.length > 0 && (
            <span className="badge-primary/60 font-mono text-amber-400/80">
              {galleryEntries.length} 个视口
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
      {activeTab === 'results' ? (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* ── 多视口网格（viewportCount >= 2）── */}
          {viewportCount >= 2 ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className={viewportStageClass}>
                {visibleViewportSlots.map((slot, idx) => renderViewportCell(slot, idx))}
              </div>
              {/* 底部视口切换栏 */}
              <div className="app-scrollbar flex h-11 flex-shrink-0 items-center justify-center gap-1.5 overflow-x-auto border-t border-white/[0.06] bg-black/20 px-2 py-1.5">
                {viewportSlots.map((slot, idx) => {
                  const isSlotActive = slot ? slot.id === activeSlotId : false
                  const isSelected = selectedViewportIdx === idx
                  const isHighlighted = isSlotActive || isSelected
                  const thumb = slot?.results?.[0]
                  return (
                    <button
                      key={slot?.id ?? `vp-${idx}`}
                      className={`relative flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border-2 transition ${
                        isHighlighted
                          ? `${VIEWPORT_COLORS[idx % 6].bg} ring-2 ${VIEWPORT_COLORS[idx % 6].ring}`
                          : slot?.status === 'running'
                            ? 'border-amber-400/30 bg-amber-500/10'
                            : slot?.status === 'error'
                              ? 'border-red-400/30 bg-red-500/10'
                              : 'border-white/[0.08] bg-white/[0.04]'
                      }`}
                      style={{
                        borderColor: isHighlighted
                          ? VIEWPORT_COLORS[idx % 6].hex
                          : slot?.status === 'running'
                            ? undefined
                            : slot?.status === 'error'
                              ? undefined
                              : `${VIEWPORT_COLORS[idx % 6].hex}33`,
                      }}
                      onClick={() => {
                        // 单击：选中该视口，标记数字高亮
                        setSelectedViewportIdx(idx)
                        if (slot) {
                          selectSlot(slot)
                        }
                        // 最大化状态下单击切换到该视口
                        if (maximizedViewportIndex !== null) setMaximizedViewportIndex(idx)
                      }}
                      onDoubleClick={e => {
                        // 双击：放大/还原该视口
                        e.stopPropagation()
                        setMaximizedViewportIndex(maximizedViewportIndex === idx ? null : idx)
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
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
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
      ) : (
        /* ── 画廊模式 ── */
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {/* 画廊子标签栏 */}
          <div className="flex flex-shrink-0 items-center justify-between border-b border-white/[0.06] bg-white/[0.02] px-3 py-1">
            <div className="flex items-center gap-1.5">
              <button
                className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition ${
                  gallerySubTab === 'current'
                    ? 'bg-amber-500/20 text-amber-300'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
                onClick={() => setGallerySubTab('current')}
              >
                当前
              </button>
              <button
                className={`relative rounded-md px-2 py-0.5 text-[11px] font-medium transition ${
                  gallerySubTab === 'favorites'
                    ? 'bg-red-500/20 text-red-300'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
                onClick={() => {
                  setGallerySubTab('favorites')
                  setFavActiveIdx(0)
                }}
              >
                收藏
                {favorites.length > 0 && (
                  <span className="ml-1 text-[9px] opacity-60">{favorites.length}</span>
                )}
              </button>
            </div>
            <button
              onClick={() => {
                onGalleryClose?.()
                setActiveTab('results')
              }}
              className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-[10px] text-slate-400 transition hover:bg-white/[0.08] hover:text-white"
            >
              关闭
            </button>
          </div>

          {/* ── 画廊子标签：当前 ── */}
          {gallerySubTab === 'current' && galleryEntries && galleryEntries.length > 0 ? (
            (() => {
              const ge = galleryEntries[galleryActiveIdx] ?? galleryEntries[0]
              const vpColor = VIEWPORT_COLORS[galleryActiveIdx % 6]
              const gImgIdx = galleryImageIdx[galleryActiveIdx] ?? 0
              const gSafeIdx = Math.min(Math.max(gImgIdx, 0), Math.max(ge.results.length - 1, 0))
              const gActiveImg = ge.results[gSafeIdx]
              const gActiveImgUrl = gActiveImg
                ? safeUrl(
                    (gActiveImg as typeof gActiveImg & { originalUrl?: string }).originalUrl ??
                      gActiveImg.url,
                  )
                : ''
              return (
                <>
                  {/* 视口信息栏 */}
                  <div className="flex flex-shrink-0 items-center gap-3 border-b border-white/[0.06] bg-white/[0.025] px-4 py-1.5">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${vpColor.border} ${vpColor.label}`}
                    >
                      视口 {ge.viewportIndex ?? galleryActiveIdx + 1}
                      {ge.viewportName ? ` · ${ge.viewportName}` : ''}
                    </span>
                    <span className="font-mono text-[11px] text-slate-500">
                      {ge.width}x{ge.height} · {ge.results.length} 张 · {ge.model}
                    </span>
                  </div>
                  {/* 主图区 — 和生成结果完全一致的布局 */}
                  {ge.results.length > 0 ? (
                    <div className="flex h-full w-full flex-col">
                      <div
                        className="group relative flex-1 cursor-pointer overflow-hidden"
                        onClick={() => {
                          if (gActiveImg) setPreviewImage(gActiveImg)
                        }}
                        onContextMenu={e => {
                          if (gActiveImg) handleContextMenu(e, gActiveImg)
                        }}
                      >
                        <img
                          key={`gallery-${galleryActiveIdx}-${gSafeIdx}`}
                          src={gActiveImgUrl}
                          alt=""
                          className="h-full w-full object-contain transition-all duration-300"
                          draggable={false}
                          onError={e => {
                            e.currentTarget.style.display = 'none'
                          }}
                        />

                        {/* 收藏图标 — 右上角 */}
                        {gActiveImg && (
                          <div className="absolute right-2 top-2 z-20 opacity-0 transition group-hover:opacity-100">
                            {renderFavHeart(gActiveImg, {
                              prompt: ge.prompt,
                              model: ge.model,
                              width: ge.width,
                              height: ge.height,
                            })}
                          </div>
                        )}

                        {/* 左右切换箭头 */}
                        {ge.results.length > 1 && (
                          <>
                            <button
                              className="absolute left-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-xl leading-none text-white opacity-0 transition hover:bg-black/60 group-hover:opacity-100"
                              onClick={e => {
                                e.stopPropagation()
                                const prev = (gSafeIdx - 1 + ge.results.length) % ge.results.length
                                setGalleryImageIdx(p => ({ ...p, [galleryActiveIdx]: prev }))
                              }}
                            >
                              ‹
                            </button>
                            <button
                              className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-xl leading-none text-white opacity-0 transition hover:bg-black/60 group-hover:opacity-100"
                              onClick={e => {
                                e.stopPropagation()
                                const next = (gSafeIdx + 1) % ge.results.length
                                setGalleryImageIdx(p => ({ ...p, [galleryActiveIdx]: next }))
                              }}
                            >
                              ›
                            </button>
                            <div className="absolute left-2 top-2 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-medium text-white">
                              {gSafeIdx + 1} / {ge.results.length}
                            </div>
                          </>
                        )}
                      </div>

                      {/* 缩略图横条 — 和生成结果完全一致 */}
                      {ge.results.length > 1 && (
                        <div className="app-scrollbar flex flex-shrink-0 gap-1.5 overflow-x-auto border-t border-white/[0.06] px-2 py-2">
                          {ge.results.map((img, idx) => {
                            const thumbUrl =
                              (img as typeof img & { originalUrl?: string }).originalUrl ?? img.url
                            return (
                              <div key={img.id ?? idx} className="relative flex-shrink-0">
                                <button
                                  onClick={() =>
                                    setGalleryImageIdx(p => ({ ...p, [galleryActiveIdx]: idx }))
                                  }
                                  className={`h-12 w-12 overflow-hidden rounded-lg border-2 transition-all ${idx === gSafeIdx ? 'border-primary-400 ring-1 ring-primary-400/30' : 'border-transparent hover:border-white/20'}`}
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
                  ) : (
                    <div className="flex flex-1 items-center justify-center text-xs text-slate-500">
                      无结果
                    </div>
                  )}

                  {/* 底部视口切换栏 */}
                  {galleryEntries.length > 1 && (
                    <div className="flex flex-shrink-0 items-center justify-center gap-1.5 border-t border-white/[0.06] bg-black/20 px-2 py-1.5">
                      {galleryEntries.map((ge2, idx) => {
                        const isActive = idx === galleryActiveIdx
                        const vc = VIEWPORT_COLORS[idx % 6]
                        const thumb = ge2.results[0]
                        return (
                          <button
                            key={ge2.id}
                            className={`relative flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border-2 transition ${
                              isActive
                                ? `${vc.bg} ring-2 ${vc.ring}`
                                : 'border-white/[0.08] bg-white/[0.04] hover:border-white/20'
                            }`}
                            style={{ borderColor: isActive ? vc.hex : undefined }}
                            onClick={() => setGalleryActiveIdx(idx)}
                          >
                            {thumb ? (
                              <img
                                src={safeUrl(thumb.originalUrl ?? thumb.url)}
                                alt=""
                                className="h-full w-full object-cover"
                                draggable={false}
                              />
                            ) : (
                              <span className={`text-[8px] font-bold ${vc.label}`}>{idx + 1}</span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </>
              )
            })()
          ) : gallerySubTab === 'favorites' ? (
            /* ── 收藏子标签 ── */
            (() => {
              const allTags = getAllTags()
              const allGroups = getAllGroups()
              const filtered = favorites.filter(f => {
                if (favFilterTag && (!f.tags || !f.tags.includes(favFilterTag))) return false
                if (favFilterGroup && f.group !== favFilterGroup) return false
                return true
              })
              const favSafeIdx = Math.min(
                Math.max(favActiveIdx, 0),
                Math.max(filtered.length - 1, 0),
              )
              const favImg = filtered[favSafeIdx]
              const favImgUrl = favImg ? safeUrl(favImg.originalUrl ?? favImg.url) : ''
              return filtered.length > 0 ? (
                <div className="flex h-full w-full flex-col">
                  {/* 筛选栏：标签 + 分组 + 视图切换 */}
                  <div className="app-scrollbar flex flex-shrink-0 items-center gap-1.5 overflow-x-auto border-b border-white/[0.06] bg-white/[0.02] px-3 py-1">
                    {/* 分组筛选 */}
                    <button
                      className={`rounded-md px-1.5 py-0.5 text-[9px] transition ${!favFilterGroup ? 'bg-white/[0.1] text-white' : 'text-slate-500 hover:text-slate-300'}`}
                      onClick={() => {
                        setFavFilterGroup(null)
                        setFavActiveIdx(0)
                      }}
                    >
                      全部
                    </button>
                    {allGroups.map(g => (
                      <button
                        key={g}
                        className={`rounded-md px-1.5 py-0.5 text-[9px] transition ${favFilterGroup === g ? 'bg-amber-500/20 text-amber-300' : 'text-slate-500 hover:text-slate-300'}`}
                        onClick={() => {
                          setFavFilterGroup(favFilterGroup === g ? null : g)
                          setFavActiveIdx(0)
                        }}
                      >
                        {g}
                      </button>
                    ))}
                    <span className="mx-0.5 h-3 w-px bg-white/[0.08]" />
                    {/* 标签筛选 */}
                    {allTags.map(t => (
                      <button
                        key={t}
                        className={`rounded-full px-1.5 py-0.5 text-[9px] transition ${favFilterTag === t ? 'bg-primary-500/20 text-primary-300' : 'text-slate-500 hover:text-slate-300'}`}
                        onClick={() => {
                          setFavFilterTag(favFilterTag === t ? null : t)
                          setFavActiveIdx(0)
                        }}
                      >
                        #{t}
                      </button>
                    ))}
                    <span className="flex-1" />
                    {/* 视图切换 */}
                    {(['single', 'grid', 'list'] as const).map(mode => (
                      <button
                        key={mode}
                        className={`rounded px-1 py-0.5 text-[9px] transition ${favViewMode === mode ? 'bg-white/[0.1] text-white' : 'text-slate-500 hover:text-slate-300'}`}
                        onClick={() => setFavViewMode(mode)}
                        title={mode === 'single' ? '单图' : mode === 'grid' ? '网格' : '列表'}
                      >
                        {mode === 'single' ? '▣' : mode === 'grid' ? '▦' : '☰'}
                      </button>
                    ))}
                  </div>

                  {/* ── 单图模式 ── */}
                  {favViewMode === 'single' ? (
                    <>
                      <div
                        className="group relative flex-1 cursor-pointer overflow-hidden"
                        onClick={() => {
                          if (favImg)
                            setPreviewImage({
                              id: favImg.id,
                              url: favImg.originalUrl ?? favImg.url,
                            })
                        }}
                      >
                        {favImg && (
                          <img
                            key={`fav-${favSafeIdx}`}
                            src={favImgUrl}
                            alt=""
                            className="h-full w-full object-contain"
                            draggable={false}
                          />
                        )}
                        {/* 收藏心+标签操作 — 右上角 */}
                        {favImg && (
                          <div className="absolute right-2 top-2 z-20 flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                            {/* 标签按钮 */}
                            <button
                              className="flex h-7 items-center gap-0.5 rounded-full bg-black/50 px-2 text-[9px] text-slate-300 transition hover:bg-black/70"
                              onClick={e => {
                                e.stopPropagation()
                                setTagEditImgId(tagEditImgId === favImg.id ? null : favImg.id)
                              }}
                              title="添加标签"
                            >
                              #
                            </button>
                            {/* 分组按钮 */}
                            <button
                              className="flex h-7 items-center gap-0.5 rounded-full bg-black/50 px-2 text-[9px] text-slate-300 transition hover:bg-black/70"
                              onClick={e => {
                                e.stopPropagation()
                                setGroupEditImgId(groupEditImgId === favImg.id ? null : favImg.id)
                              }}
                              title="设置分组"
                            >
                              📁
                            </button>
                            {/* 取消收藏 */}
                            <button
                              className="flex h-7 w-7 items-center justify-center rounded-full bg-red-500/30 text-red-400 transition hover:bg-red-500/50"
                              onClick={e => {
                                e.stopPropagation()
                                removeFavorite(favImg.id)
                                setFavVersion(v => v + 1)
                                if (favActiveIdx >= filtered.length - 1)
                                  setFavActiveIdx(Math.max(0, favActiveIdx - 1))
                              }}
                              title="取消收藏"
                            >
                              <svg
                                width={14}
                                height={14}
                                viewBox="0 0 24 24"
                                fill="currentColor"
                                stroke="currentColor"
                                strokeWidth={2}
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                                />
                              </svg>
                            </button>
                          </div>
                        )}
                        {/* 标签编辑浮层 */}
                        {tagEditImgId === favImg?.id && (
                          <div
                            className="absolute right-2 top-11 z-30 w-52 rounded-xl border border-white/[0.12] bg-[#0d0e14]/95 shadow-2xl backdrop-blur-md"
                            onClick={e => e.stopPropagation()}
                            onKeyDown={e => {
                              if (e.key === 'Escape') {
                                e.stopPropagation()
                                setTagEditImgId(null)
                              }
                            }}
                          >
                            <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-1.5">
                              <span className="text-[10px] font-bold text-slate-300">标签管理</span>
                              <button
                                className="text-[10px] text-slate-500 hover:text-white"
                                onClick={() => setTagEditImgId(null)}
                              >
                                ✕
                              </button>
                            </div>
                            <div className="px-3 py-2">
                              {allTags.length > 0 && (
                                <div className="mb-2 flex flex-wrap gap-1">
                                  {allTags.map(t => {
                                    const has = favImg.tags?.includes(t)
                                    return (
                                      <button
                                        key={t}
                                        className={`rounded-full px-2 py-0.5 text-[10px] transition ${has ? 'bg-primary-500/30 text-primary-200 ring-1 ring-primary-400/30' : 'bg-white/[0.06] text-slate-400 hover:bg-white/[0.1] hover:text-slate-200'}`}
                                        onClick={() => {
                                          if (has) {
                                            removeTagFromFavorite(favImg.id, t)
                                          } else {
                                            addTagToFavorite(favImg.id, t)
                                          }
                                          setFavVersion(v => v + 1)
                                        }}
                                      >
                                        #{t}
                                      </button>
                                    )
                                  })}
                                </div>
                              )}
                              <form
                                className="flex gap-1"
                                onSubmit={e => {
                                  e.preventDefault()
                                  if (tagInput.trim()) {
                                    addTagToFavorite(favImg.id, tagInput.trim())
                                    setTagInput('')
                                    setFavVersion(v => v + 1)
                                  }
                                }}
                              >
                                <input
                                  autoFocus
                                  className="flex-1 rounded-lg bg-white/[0.06] px-2 py-1 text-[11px] text-white outline-none ring-1 ring-white/[0.08] focus:ring-primary-400/40"
                                  placeholder="输入新标签后回车…"
                                  value={tagInput}
                                  onChange={e => setTagInput(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === 'Escape') {
                                      e.stopPropagation()
                                      setTagEditImgId(null)
                                    }
                                  }}
                                />
                                <button
                                  type="submit"
                                  className="rounded-lg bg-primary-500/20 px-2 py-1 text-[10px] font-medium text-primary-300 transition hover:bg-primary-500/30"
                                >
                                  添加
                                </button>
                              </form>
                            </div>
                          </div>
                        )}
                        {/* 分组编辑浮层 */}
                        {groupEditImgId === favImg?.id && (
                          <div
                            className="absolute right-2 top-11 z-30 w-48 rounded-xl border border-white/[0.12] bg-[#0d0e14]/95 shadow-2xl backdrop-blur-md"
                            onClick={e => e.stopPropagation()}
                            onKeyDown={e => {
                              if (e.key === 'Escape') {
                                e.stopPropagation()
                                setGroupEditImgId(null)
                              }
                            }}
                          >
                            <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-1.5">
                              <span className="text-[10px] font-bold text-slate-300">分组管理</span>
                              <button
                                className="text-[10px] text-slate-500 hover:text-white"
                                onClick={() => setGroupEditImgId(null)}
                              >
                                ✕
                              </button>
                            </div>
                            <div className="px-3 py-2">
                              <div className="mb-2 flex flex-wrap gap-1">
                                <button
                                  className={`rounded-lg px-2 py-0.5 text-[10px] transition ${!favImg.group ? 'bg-white/[0.12] text-white ring-1 ring-white/20' : 'bg-white/[0.04] text-slate-500 hover:bg-white/[0.08] hover:text-slate-300'}`}
                                  onClick={() => {
                                    setFavoriteGroup(favImg.id, undefined)
                                    setFavVersion(v => v + 1)
                                    setGroupEditImgId(null)
                                  }}
                                >
                                  无分组
                                </button>
                                {allGroups.map(g => (
                                  <button
                                    key={g}
                                    className={`rounded-lg px-2 py-0.5 text-[10px] transition ${favImg.group === g ? 'bg-amber-500/25 text-amber-200 ring-1 ring-amber-400/30' : 'bg-white/[0.04] text-slate-500 hover:bg-white/[0.08] hover:text-slate-300'}`}
                                    onClick={() => {
                                      setFavoriteGroup(favImg.id, g)
                                      setFavVersion(v => v + 1)
                                      setGroupEditImgId(null)
                                    }}
                                  >
                                    {g}
                                  </button>
                                ))}
                              </div>
                              <form
                                className="flex gap-1"
                                onSubmit={e => {
                                  e.preventDefault()
                                  if (groupInput.trim()) {
                                    setFavoriteGroup(favImg.id, groupInput.trim())
                                    setGroupInput('')
                                    setFavVersion(v => v + 1)
                                    setGroupEditImgId(null)
                                  }
                                }}
                              >
                                <input
                                  autoFocus
                                  className="flex-1 rounded-lg bg-white/[0.06] px-2 py-1 text-[11px] text-white outline-none ring-1 ring-white/[0.08] focus:ring-amber-400/40"
                                  placeholder="输入新分组后回车…"
                                  value={groupInput}
                                  onChange={e => setGroupInput(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === 'Escape') {
                                      e.stopPropagation()
                                      setGroupEditImgId(null)
                                    }
                                  }}
                                />
                                <button
                                  type="submit"
                                  className="rounded-lg bg-amber-500/20 px-2 py-1 text-[10px] font-medium text-amber-300 transition hover:bg-amber-500/30"
                                >
                                  添加
                                </button>
                              </form>
                            </div>
                          </div>
                        )}
                        {/* 左右切换 */}
                        {filtered.length > 1 && (
                          <>
                            <button
                              className="absolute left-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-xl leading-none text-white opacity-0 transition hover:bg-black/60 group-hover:opacity-100"
                              onClick={e => {
                                e.stopPropagation()
                                setFavActiveIdx(i => (i - 1 + filtered.length) % filtered.length)
                              }}
                            >
                              ‹
                            </button>
                            <button
                              className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-xl leading-none text-white opacity-0 transition hover:bg-black/60 group-hover:opacity-100"
                              onClick={e => {
                                e.stopPropagation()
                                setFavActiveIdx(i => (i + 1) % filtered.length)
                              }}
                            >
                              ›
                            </button>
                            <div className="absolute left-2 top-2 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-medium text-white">
                              {favSafeIdx + 1} / {filtered.length}
                            </div>
                          </>
                        )}
                        {/* 当前图片的标签+分组 */}
                        {favImg && (favImg.tags?.length || favImg.group) && (
                          <div className="absolute bottom-2 left-2 z-10 flex flex-wrap gap-1">
                            {favImg.group && (
                              <span className="rounded-md bg-amber-500/20 px-1.5 py-0.5 text-[8px] font-bold text-amber-300">
                                {favImg.group}
                              </span>
                            )}
                            {favImg.tags?.map(t => (
                              <span
                                key={t}
                                className="rounded-full bg-primary-500/15 px-1.5 py-0.5 text-[8px] text-primary-300"
                              >
                                #{t}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      {/* 缩略图横条 */}
                      {filtered.length > 1 && (
                        <div className="app-scrollbar flex flex-shrink-0 gap-1.5 overflow-x-auto border-t border-white/[0.06] px-2 py-2">
                          {filtered.map((fav, idx) => (
                            <div key={fav.id} className="relative flex-shrink-0">
                              <button
                                onClick={() => setFavActiveIdx(idx)}
                                className={`h-12 w-12 overflow-hidden rounded-lg border-2 transition-all ${idx === favSafeIdx ? 'border-red-400 ring-1 ring-red-400/30' : 'border-transparent hover:border-white/20'}`}
                              >
                                <img
                                  src={safeUrl(fav.originalUrl ?? fav.url)}
                                  alt=""
                                  className="h-full w-full object-cover"
                                />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  ) : favViewMode === 'grid' ? (
                    /* ── 网格模式 (Eagle风格) ── */
                    <div className="app-scrollbar relative grid flex-1 grid-cols-3 gap-1.5 overflow-y-auto p-1.5 sm:grid-cols-4 lg:grid-cols-5">
                      {filtered.map((fav, idx) => {
                        const isSelected = idx === favSafeIdx
                        return (
                          <div
                            key={fav.id}
                            className={`group/card relative cursor-pointer overflow-hidden rounded-lg border-2 transition-all duration-150 ${
                              isSelected
                                ? 'scale-[1.02] border-primary-400 ring-2 ring-primary-400/30'
                                : 'border-transparent hover:border-white/20 hover:shadow-lg hover:shadow-black/30'
                            }`}
                            onClick={() => setFavActiveIdx(idx)}
                            onDoubleClick={() => {
                              setFavActiveIdx(idx)
                              setFavViewMode('single')
                            }}
                            onMouseEnter={e => {
                              const rect = e.currentTarget.getBoundingClientRect()
                              if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
                              hoverTimerRef.current = setTimeout(() => {
                                setHoverPreview({ fav, x: rect.right + 8, y: rect.top })
                              }, 400)
                            }}
                            onMouseLeave={() => {
                              if (hoverTimerRef.current) {
                                clearTimeout(hoverTimerRef.current)
                                hoverTimerRef.current = null
                              }
                              setHoverPreview(null)
                            }}
                          >
                            <img
                              src={safeUrl(fav.originalUrl ?? fav.url)}
                              alt=""
                              className="aspect-square w-full object-cover transition-transform duration-200 group-hover/card:scale-105"
                              draggable={false}
                            />
                            {/* 右上角操作栏 */}
                            <div className="absolute right-1 top-1 flex gap-0.5 opacity-0 transition group-hover/card:opacity-100">
                              <button
                                className="flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-[9px] text-slate-300 hover:bg-primary-500/40 hover:text-white"
                                onClick={e => {
                                  e.stopPropagation()
                                  setFavActiveIdx(idx)
                                  setFavViewMode('single')
                                  setTagEditImgId(fav.id)
                                }}
                                title="标签"
                              >
                                #
                              </button>
                              <button
                                className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500/40 text-red-300 hover:bg-red-500/60"
                                onClick={e => {
                                  e.stopPropagation()
                                  removeFavorite(fav.id)
                                  setFavVersion(v => v + 1)
                                }}
                                title="取消收藏"
                              >
                                <svg width={10} height={10} viewBox="0 0 24 24" fill="currentColor">
                                  <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                                </svg>
                              </button>
                            </div>
                            {/* 底部信息叠加层 */}
                            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-1.5 pb-1 pt-4 opacity-0 transition group-hover/card:opacity-100">
                              <p className="truncate text-[8px] text-white/90">
                                {fav.prompt ?? ''}
                              </p>
                              <div className="mt-0.5 flex flex-wrap gap-0.5">
                                {fav.group && (
                                  <span className="rounded bg-amber-500/30 px-1 text-[7px] text-amber-200">
                                    {fav.group}
                                  </span>
                                )}
                                {fav.tags?.map(t => (
                                  <span
                                    key={t}
                                    className="rounded bg-white/15 px-1 text-[7px] text-slate-200"
                                  >
                                    #{t}
                                  </span>
                                ))}
                                {fav.width && (
                                  <span className="text-[7px] text-white/50">
                                    {fav.width}x{fav.height}
                                  </span>
                                )}
                              </div>
                            </div>
                            {/* 选中指示器 */}
                            {isSelected && (
                              <div className="absolute left-1 top-1">
                                <div className="flex h-4 w-4 items-center justify-center rounded-full bg-primary-500 text-[8px] text-white shadow">
                                  ✓
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                      {/* 悬浮预览浮层 */}
                      {hoverPreview &&
                        createPortal(
                          <div
                            className="pointer-events-none fixed z-[9999] max-h-[400px] max-w-[360px] overflow-hidden rounded-xl border border-white/[0.1] bg-[#0a0b10] shadow-2xl"
                            style={{
                              left: Math.min(hoverPreview.x, window.innerWidth - 370),
                              top: Math.max(8, Math.min(hoverPreview.y, window.innerHeight - 420)),
                            }}
                          >
                            <img
                              src={safeUrl(hoverPreview.fav.originalUrl ?? hoverPreview.fav.url)}
                              alt=""
                              className="max-h-[320px] w-full object-contain"
                            />
                            <div className="border-t border-white/[0.06] px-3 py-2">
                              <p className="truncate text-[10px] text-slate-300">
                                {hoverPreview.fav.prompt ?? ''}
                              </p>
                              <div className="mt-0.5 flex items-center gap-1.5">
                                <span className="text-[9px] text-slate-500">
                                  {hoverPreview.fav.width}x{hoverPreview.fav.height}
                                </span>
                                <span className="text-[9px] text-slate-500">
                                  {hoverPreview.fav.model}
                                </span>
                                {hoverPreview.fav.group && (
                                  <span className="rounded bg-amber-500/20 px-1 text-[8px] text-amber-300">
                                    {hoverPreview.fav.group}
                                  </span>
                                )}
                                {hoverPreview.fav.tags?.map(t => (
                                  <span key={t} className="text-[8px] text-primary-300">
                                    #{t}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>,
                          document.body,
                        )}
                    </div>
                  ) : (
                    /* ── 列表模式 ── */
                    <div className="app-scrollbar flex flex-1 flex-col gap-1 overflow-y-auto p-1">
                      {filtered.map((fav, idx) => (
                        <div
                          key={fav.id}
                          className={`group/row flex cursor-pointer items-center gap-2 rounded-lg border px-2 py-1.5 transition ${idx === favSafeIdx ? 'border-red-400/40 bg-red-500/5' : 'border-white/[0.04] hover:bg-white/[0.03]'}`}
                          onClick={() => {
                            setFavActiveIdx(idx)
                            setFavViewMode('single')
                          }}
                        >
                          <img
                            src={safeUrl(fav.originalUrl ?? fav.url)}
                            alt=""
                            className="h-12 w-12 flex-shrink-0 rounded-lg object-cover"
                            draggable={false}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[10px] text-slate-300">
                              {fav.prompt ?? '无提示词'}
                            </p>
                            <div className="mt-0.5 flex items-center gap-1">
                              {fav.group && (
                                <span className="rounded bg-amber-500/20 px-1 py-0.5 text-[7px] text-amber-300">
                                  {fav.group}
                                </span>
                              )}
                              {fav.tags?.map(t => (
                                <span
                                  key={t}
                                  className="rounded-full bg-white/[0.06] px-1 py-0.5 text-[7px] text-slate-400"
                                >
                                  #{t}
                                </span>
                              ))}
                              <span className="text-[8px] text-slate-500">
                                {fav.width}x{fav.height}
                              </span>
                            </div>
                          </div>
                          <button
                            className="flex-shrink-0 opacity-0 transition group-hover/row:opacity-100"
                            onClick={e => {
                              e.stopPropagation()
                              removeFavorite(fav.id)
                              setFavVersion(v => v + 1)
                            }}
                          >
                            <svg
                              width={14}
                              height={14}
                              viewBox="0 0 24 24"
                              fill="currentColor"
                              className="text-red-400"
                            >
                              <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex h-full flex-col items-center justify-center text-slate-500">
                  <svg
                    width={32}
                    height={32}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    className="mb-2 opacity-30"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                    />
                  </svg>
                  <p className="text-xs">
                    {favFilterTag || favFilterGroup ? '该筛选条件下暂无收藏' : '暂无收藏'}
                  </p>
                  <p className="mt-1 text-[10px]">在图片上点击心形图标即可收藏</p>
                  {(favFilterTag || favFilterGroup) && (
                    <button
                      className="mt-2 rounded-lg bg-white/[0.06] px-3 py-1 text-[10px] text-slate-400 hover:text-white"
                      onClick={() => {
                        setFavFilterTag(null)
                        setFavFilterGroup(null)
                      }}
                    >
                      清除筛选
                    </button>
                  )}
                </div>
              )
            })()
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-slate-500">
              <p className="text-xs">画廊为空</p>
              <p className="mt-1 text-[10px]">双击历史记录中的视口组可在此查看</p>
            </div>
          )}
        </div>
      )}

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

export default React.memo(ResultPanel)
