import React, { useState, useRef, useEffect } from 'react'
import { GeneratedImage } from '../api/imageClient'
import { downloadImage } from '../utils/download'

// 扩展类型，支持 originalUrl（原图 URL）
interface ExtendedImage extends GeneratedImage {
  originalUrl?: string
}

interface ImagePreviewModalProps {
  image: GeneratedImage | null
  onClose: () => void
}

export default function ImagePreviewModal({ image, onClose }: ImagePreviewModalProps) {
  // 所有 hooks 必须放在 early return 之前，顺序固定
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [downloadStatus, setDownloadStatus] = useState<'idle' | 'downloading'>('idle')
  const [isHdLoading, setIsHdLoading] = useState(false) // 原图加载中
  // 拖拽时强制重渲染的计数器（必须在 useState 第3位，不能乱动）
  const [, forceUpdate] = useState(0)
  // 图片 URL：用 ref 缓存初始值，state 管理当前显示（支持降级）
  const imgInitUrl = useRef<string>('')
  const [imageUrl, setImageUrl] = useState<string>('')
  // 拖拽全程用 ref，结束时才写 state
  const dragRef = useRef<{
    startX: number
    startY: number
    baseOffsetX: number
    baseOffsetY: number
  } | null>(null)
  const hasDragged = useRef(false)
  const visualTranslate = useRef({ x: 0, y: 0 })
  // 中键平移状态（放大/未放大都可）
  const midDragRef = useRef<{
    startX: number
    startY: number
    baseOffsetX: number
    baseOffsetY: number
  } | null>(null)
  const midDragged = useRef(false)

  // ESC 关闭
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // early return 必须在所有 hooks 之后
  if (!image) return null

  // 初始化图片 URL（只在 image 切换时更新）
  const extendedImage = image as ExtendedImage
  const originalUrl = extendedImage.originalUrl
  // 优先用缩略图（快速显示），背景懒加载原图
  const primaryUrl = originalUrl || image.url
  const hasFallback = !!image.url
  if (imgInitUrl.current !== primaryUrl) {
    imgInitUrl.current = primaryUrl
    if (imageUrl !== primaryUrl) setImageUrl(primaryUrl)
    // 如果有原图且不是 data URI，背景懒加载
    if (originalUrl && !originalUrl.startsWith('data:')) {
      setIsHdLoading(true)
      const hdImg = new Image()
      hdImg.onload = () => {
        setImageUrl(originalUrl)
        setIsHdLoading(false)
      }
      hdImg.onerror = () => {
        // 原图加载失败，保持缩略图
        setIsHdLoading(false)
      }
      hdImg.src = originalUrl
    }
  }

  const isEnlarged = zoom > 1

  const handleDownload = async () => {
    try {
      setDownloadStatus('downloading')
      // 下载优先用原图 URL，备用当前显示的图
      const downloadUrl = extendedImage.originalUrl || image.url
      await downloadImage(downloadUrl, `generated_${image.id}.png`)
    } catch (e) {
      console.error('下载失败:', e)
    } finally {
      setDownloadStatus('idle')
    }
  }

  // 单击图片：已放大则还原，未放大则放大（拖拽过则忽略 click）
  const handleImageClick = () => {
    if (hasDragged.current) {
      hasDragged.current = false
      return
    }
    if (isEnlarged) {
      setZoom(1)
      setOffset({ x: 0, y: 0 })
    } else {
      setZoom(2)
    }
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    // 中键拖动（任何缩放级别都可）
    if (e.button === 1) {
      e.preventDefault()
      midDragged.current = false
      midDragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        baseOffsetX: offset.x,
        baseOffsetY: offset.y,
      }
      visualTranslate.current = { x: offset.x, y: offset.y }
      return
    }
    // 左键拖动（仅放大后可拖）
    if (e.button !== 0) return
    if (!isEnlarged) return
    e.preventDefault()
    hasDragged.current = false
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      baseOffsetX: offset.x,
      baseOffsetY: offset.y,
    }
    visualTranslate.current = { x: offset.x, y: offset.y }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    // 中键平移
    if (midDragRef.current) {
      const { startX, startY, baseOffsetX, baseOffsetY } = midDragRef.current
      const dx = e.clientX - startX
      const dy = e.clientY - startY
      if (!midDragged.current && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
        midDragged.current = true
      }
      visualTranslate.current = {
        x: baseOffsetX + dx,
        y: baseOffsetY + dy,
      }
      forceUpdate(v => v + 1)
      return
    }
    // 左键拖动
    if (!dragRef.current) return
    const { startX, startY, baseOffsetX, baseOffsetY } = dragRef.current
    const dx = e.clientX - startX
    const dy = e.clientY - startY
    if (!hasDragged.current && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
      hasDragged.current = true
    }
    visualTranslate.current = {
      x: baseOffsetX + dx,
      y: baseOffsetY + dy,
    }
    // 强制重渲染（拖拽频率不高，可接受）
    forceUpdate(v => v + 1)
  }

  const handleMouseUp = () => {
    // 中键平移结束
    if (midDragRef.current) {
      if (midDragged.current) {
        setOffset({ x: visualTranslate.current.x, y: visualTranslate.current.y })
      }
      midDragRef.current = null
      return
    }
    // 左键拖动结束
    if (!dragRef.current) return
    if (hasDragged.current) {
      setOffset({ x: visualTranslate.current.x, y: visualTranslate.current.y })
    }
    dragRef.current = null
  }

  const isDragging = !!dragRef.current || !!midDragRef.current
  const curTranslate = visualTranslate.current

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.97)', userSelect: isDragging ? 'none' : 'auto' }}
      onClick={onClose}
      onWheel={e => {
        e.preventDefault()
        const factor = e.deltaY < 0 ? 1.12 : 0.88
        setZoom(prev => Math.min(5, Math.max(0.1, parseFloat((prev * factor).toFixed(3)))))
      }}
    >
      {/* 图片可操作区域 */}
      <div
        className="absolute inset-0 flex items-center justify-center"
        onClick={e => {
          // 点击的是图片本身 → 不关闭（交给 img 的 handleImageClick）
          // 点击的是图片周围空白区域 → 关闭预览
          if (e.target === e.currentTarget) {
            onClose()
          }
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ cursor: isDragging ? 'grabbing' : isEnlarged ? 'grab' : 'default' }}
      >
        <img
          src={imageUrl}
          alt=""
          draggable={false}
          style={{
            maxWidth: zoom <= 1 ? '100vw' : 'none',
            maxHeight: zoom <= 1 ? '100vh' : 'none',
            objectFit: 'contain',
            transform: `scale(${zoom}) translate(${curTranslate.x}px, ${curTranslate.y}px)`,
            transformOrigin: 'center center',
            transition: isDragging ? 'none' : 'transform 0.15s ease',
            borderRadius: zoom <= 1 ? 0 : 6,
            cursor: isEnlarged ? 'grab' : 'zoom-in',
          }}
          onError={() => {
            if (hasFallback && !isHdLoading) {
              setImageUrl(image.url)
            } else if (!isHdLoading) {
              // eslint-disable-next-line no-alert
              alert('图片加载失败，可能 URL 已过期')
              onClose()
            }
          }}
          onClick={e => {
            e.stopPropagation()
            handleImageClick()
          }}
        />
      </div>

      {/* 顶部控制栏 */}
      <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex items-center justify-between px-4 py-3">
        <div
          className="pointer-events-auto flex items-center gap-1.5 rounded-xl px-3 py-1.5"
          style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(12px)' }}
        >
          <button
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/15 text-base font-bold leading-none text-white transition hover:bg-white/30"
            onClick={e => {
              e.stopPropagation()
              setZoom(z => Math.min(5, parseFloat((z * 1.2).toFixed(3))))
            }}
            title="放大 (+20%)"
          >
            +
          </button>
          <span className="w-12 select-none text-center font-mono text-xs text-white">
            {Math.round(zoom * 100)}%
          </span>
          <button
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/15 text-base font-bold leading-none text-white transition hover:bg-white/30"
            onClick={e => {
              e.stopPropagation()
              setZoom(z => Math.max(0.1, parseFloat((z * 0.8).toFixed(3))))
            }}
            title="缩小 (-20%)"
          >
            −
          </button>
          <div className="mx-0.5 h-4 w-px bg-white/25" />
          <button
            className="rounded-lg bg-white/15 px-2 py-1 text-[11px] text-white transition hover:bg-white/30"
            onClick={e => {
              e.stopPropagation()
              setZoom(1)
              setOffset({ x: 0, y: 0 })
            }}
            title="重置 (1:1)"
          >
            重置
          </button>
          <button
            className="rounded-lg bg-white/15 px-2 py-1 text-[11px] text-white transition hover:bg-white/30"
            onClick={e => {
              e.stopPropagation()
              if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen?.().catch(() => {})
              } else {
                document.exitFullscreen?.().catch(() => {})
              }
            }}
            title="浏览器全屏"
          >
            {document.fullscreenElement ? '退出全屏' : '全屏'}
          </button>
          {isEnlarged || !!midDragRef.current ? (
            <span className="ml-1 text-[10px] font-medium text-blue-300">· 可拖动 / 中键平移</span>
          ) : (
            <span className="ml-1 text-[10px] font-medium text-white/40">· 中键可平移</span>
          )}
          {isHdLoading && (
            <span className="ml-1 animate-pulse text-[10px] font-medium text-amber-300">
              · 正在加载原图…
            </span>
          )}
        </div>
        <div className="pointer-events-auto flex items-center gap-2">
          <button
            className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium text-white transition hover:bg-white/20"
            style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)' }}
            onClick={e => {
              e.stopPropagation()
              handleDownload()
            }}
            disabled={downloadStatus === 'downloading'}
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
            {downloadStatus === 'downloading' ? '保存中…' : '保存图片'}
          </button>
          <button
            className="flex h-9 w-9 items-center justify-center rounded-xl text-2xl leading-none text-white/70 transition hover:text-white"
            style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)' }}
            onClick={onClose}
            title="关闭 (Esc)"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  )
}
