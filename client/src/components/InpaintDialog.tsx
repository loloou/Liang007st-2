import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { GeneratedImage } from '../api/imageClient'
import { getInpaintCapability, inpaintImage } from '../api/inpaintClient'
import { safeUrl } from '../utils/safeUrl'

type InpaintDialogProps = {
  open: boolean
  image: GeneratedImage | null
  model: string
  onClose: () => void
  onComplete: (
    images: GeneratedImage[],
    meta: {
      prompt: string
      endpoint?: string
      responseSummary?: string
      requestBodyJson?: string
      httpStatus?: number
      modelId?: string
      sourceWidth: number
      sourceHeight: number
    },
  ) => void
}

type ToolMode = 'brush' | 'eraser'

const MAX_CANVAS_SIDE = 1400

const InpaintDialog: React.FC<InpaintDialogProps> = ({
  open,
  image,
  model,
  onClose,
  onComplete,
}) => {
  const imageCanvasRef = useRef<HTMLCanvasElement>(null)
  const maskCanvasRef = useRef<HTMLCanvasElement>(null)
  const drawingRef = useRef(false)
  const lastPointRef = useRef<{ x: number; y: number } | null>(null)
  const [tool, setTool] = useState<ToolMode>('brush')
  const [brushSize, setBrushSize] = useState(44)
  const [maskOpacity, setMaskOpacity] = useState(0.46)
  const [prompt, setPrompt] = useState('')
  const [count, setCount] = useState(1)
  const [status, setStatus] = useState<'idle' | 'running'>('idle')
  const [imageStatus, setImageStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [error, setError] = useState('')
  const [hasMask, setHasMask] = useState(false)
  const [workingSize, setWorkingSize] = useState<{ width: number; height: number } | null>(null)

  const sourceUrl = image?.originalUrl || image?.url || ''
  const capability = getInpaintCapability(model)
  const isBusy = status === 'running' || imageStatus === 'loading'
  const canEdit = imageStatus === 'ready' && status !== 'running'

  const updateHasMask = useCallback(() => {
    const canvas = maskCanvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) {
      setHasMask(false)
      return
    }
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 0) {
        setHasMask(true)
        return
      }
    }
    setHasMask(false)
  }, [])

  useEffect(() => {
    if (!open || !sourceUrl) {
      setImageStatus('idle')
      setWorkingSize(null)
      return
    }
    setError('')
    setStatus('idle')
    setImageStatus('loading')
    setHasMask(false)
    setWorkingSize(null)
    const imageCanvas = imageCanvasRef.current
    const maskCanvas = maskCanvasRef.current
    imageCanvas?.getContext('2d')?.clearRect(0, 0, imageCanvas.width, imageCanvas.height)
    maskCanvas?.getContext('2d')?.clearRect(0, 0, maskCanvas.width, maskCanvas.height)
    let cancelled = false
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      if (cancelled) return
      const imageCanvas = imageCanvasRef.current
      const maskCanvas = maskCanvasRef.current
      const imageCtx = imageCanvas?.getContext('2d')
      const maskCtx = maskCanvas?.getContext('2d')
      if (!imageCanvas || !maskCanvas || !imageCtx || !maskCtx) return
      const scale = Math.min(1, MAX_CANVAS_SIDE / Math.max(img.naturalWidth, img.naturalHeight))
      const canvasWidth = Math.max(1, Math.round(img.naturalWidth * scale))
      const canvasHeight = Math.max(1, Math.round(img.naturalHeight * scale))
      imageCanvas.width = canvasWidth
      imageCanvas.height = canvasHeight
      maskCanvas.width = canvasWidth
      maskCanvas.height = canvasHeight
      imageCtx.clearRect(0, 0, canvasWidth, canvasHeight)
      imageCtx.drawImage(img, 0, 0, canvasWidth, canvasHeight)
      maskCtx.clearRect(0, 0, canvasWidth, canvasHeight)
      setWorkingSize({ width: canvasWidth, height: canvasHeight })
      setImageStatus('ready')
    }
    img.onerror = () => {
      if (cancelled) return
      setImageStatus('error')
      setWorkingSize(null)
      setError('原图加载失败，无法进入局部重绘。')
    }
    img.src = safeUrl(sourceUrl)
    return () => {
      cancelled = true
      img.onload = null
      img.onerror = null
      img.removeAttribute('src')
    }
  }, [open, sourceUrl])

  if (!open || !image) return null

  const getPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = maskCanvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    }
  }

  const drawTo = (point: { x: number; y: number }) => {
    const canvas = maskCanvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || !canEdit) return
    const last = lastPointRef.current ?? point
    ctx.save()
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = brushSize
    ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over'
    ctx.strokeStyle = 'rgba(255,255,255,1)'
    ctx.beginPath()
    ctx.moveTo(last.x, last.y)
    ctx.lineTo(point.x, point.y)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(point.x, point.y, brushSize / 2, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255,255,255,1)'
    ctx.fill()
    ctx.restore()
    lastPointRef.current = point
    if (tool === 'brush') setHasMask(true)
  }

  const clearMask = () => {
    const canvas = maskCanvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || !canEdit) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasMask(false)
  }

  const fillMask = () => {
    const canvas = maskCanvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || !canEdit) return
    ctx.save()
    ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.restore()
    setHasMask(true)
  }

  const invertMask = () => {
    const canvas = maskCanvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || !canEdit) return
    const src = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const out = ctx.createImageData(canvas.width, canvas.height)
    for (let i = 0; i < src.data.length; i += 4) {
      const alpha = src.data[i + 3]
      const next = alpha > 0 ? 0 : 255
      out.data[i] = 255
      out.data[i + 1] = 255
      out.data[i + 2] = 255
      out.data[i + 3] = next
    }
    ctx.putImageData(out, 0, 0)
    updateHasMask()
  }

  const exportMaskDataUrl = () => {
    const canvas = maskCanvasRef.current
    if (!canvas) return ''
    const exportCanvas = document.createElement('canvas')
    exportCanvas.width = canvas.width
    exportCanvas.height = canvas.height
    const ctx = exportCanvas.getContext('2d')
    if (!ctx) return ''
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height)
    ctx.drawImage(canvas, 0, 0)
    return exportCanvas.toDataURL('image/png')
  }

  const exportImageDataUrl = () => {
    const canvas = imageCanvasRef.current
    if (!canvas) return ''
    return canvas.toDataURL('image/png')
  }

  const handleGenerate = async () => {
    if (imageStatus !== 'ready' || !workingSize) {
      setError(
        imageStatus === 'loading' ? '原图仍在加载，请稍后再试。' : '原图未准备好，无法局部重绘。',
      )
      return
    }
    if (!capability.ok) {
      setError(capability.message ?? '当前模型不可用。')
      return
    }
    if (!prompt.trim()) {
      setError('请输入局部重绘提示词。')
      return
    }
    if (!hasMask) {
      setError('请先涂抹需要重绘的区域。')
      return
    }
    setStatus('running')
    setError('')
    try {
      const result = await inpaintImage({
        imageUrl: sourceUrl,
        imageDataUrl: exportImageDataUrl(),
        maskDataUrl: exportMaskDataUrl(),
        prompt: prompt.trim(),
        model,
        width: workingSize.width,
        height: workingSize.height,
        n: count,
      })
      if (result.error) {
        setError(
          `${result.error}\n\n请求地址：${result.endpoint || '未知'}\n模型：${capability.modelId || model}`,
        )
        return
      }
      onComplete(result.images, {
        prompt: prompt.trim(),
        endpoint: result.endpoint,
        responseSummary: result.responseSummary,
        requestBodyJson: result.requestBodyJson,
        httpStatus: result.httpStatus,
        modelId: capability.modelId || model,
        sourceWidth: workingSize.width,
        sourceHeight: workingSize.height,
      })
    } catch (err) {
      setError(`局部重绘失败：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setStatus('idle')
    }
  }

  return (
    <div className="overlay-dark fixed inset-0 z-[10020] flex items-center justify-center p-4">
      <div className="glass-popup popup-enter flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl">
        <div className="flex flex-shrink-0 items-center justify-between border-b border-white/[0.06] px-5 py-3">
          <div>
            <h2 className="text-sm font-bold text-slate-100">局部重绘</h2>
            <p className="mt-0.5 font-mono text-[10px] text-slate-500">
              {capability.modelId || model || '未选择模型'}
              {capability.autoSelected ? '（自动局部重绘模型）' : ''} ·{' '}
              {workingSize ? `${workingSize.width}×${workingSize.height}` : '加载尺寸中'}
            </p>
          </div>
          <button
            className="rounded-lg px-2 py-1 text-xl leading-none text-slate-500 transition hover:bg-white/[0.06] hover:text-slate-200"
            onClick={status === 'running' ? undefined : onClose}
            disabled={status === 'running'}
          >
            ×
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden p-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="flex min-h-[360px] items-center justify-center overflow-hidden rounded-2xl border border-white/[0.08] bg-black/35 p-3">
            <div className="relative max-h-full max-w-full touch-none overflow-hidden rounded-xl shadow-2xl">
              {imageStatus === 'loading' && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 text-xs text-slate-300">
                  原图加载中...
                </div>
              )}
              <canvas ref={imageCanvasRef} className="block max-h-[72vh] max-w-full" />
              <canvas
                ref={maskCanvasRef}
                className="absolute inset-0 block max-h-[72vh] max-w-full cursor-crosshair"
                style={{ opacity: maskOpacity }}
                onPointerDown={event => {
                  if (!canEdit) return
                  event.currentTarget.setPointerCapture(event.pointerId)
                  drawingRef.current = true
                  lastPointRef.current = getPoint(event)
                  if (lastPointRef.current) drawTo(lastPointRef.current)
                  if (tool === 'eraser') updateHasMask()
                }}
                onPointerMove={event => {
                  if (!drawingRef.current || !canEdit) return
                  const point = getPoint(event)
                  if (!point) return
                  drawTo(point)
                }}
                onPointerUp={event => {
                  drawingRef.current = false
                  lastPointRef.current = null
                  event.currentTarget.releasePointerCapture(event.pointerId)
                  if (tool === 'eraser') updateHasMask()
                }}
                onPointerCancel={() => {
                  drawingRef.current = false
                  lastPointRef.current = null
                  updateHasMask()
                }}
              />
            </div>
          </div>

          <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto rounded-2xl border border-white/[0.08] bg-white/[0.035] p-3">
            <div className="grid grid-cols-2 gap-2">
              <button
                className={`rounded-lg px-3 py-2 text-xs transition ${tool === 'brush' ? 'bg-primary-500/20 text-primary-200' : 'bg-white/[0.04] text-slate-400 hover:bg-white/[0.08]'}`}
                onClick={() => setTool('brush')}
                disabled={isBusy}
              >
                画笔
              </button>
              <button
                className={`rounded-lg px-3 py-2 text-xs transition ${tool === 'eraser' ? 'bg-primary-500/20 text-primary-200' : 'bg-white/[0.04] text-slate-400 hover:bg-white/[0.08]'}`}
                onClick={() => setTool('eraser')}
                disabled={isBusy}
              >
                橡皮
              </button>
            </div>

            <label className="space-y-1 text-[11px] text-slate-400">
              <div className="flex justify-between">
                <span>画笔大小</span>
                <span>{brushSize}px</span>
              </div>
              <input
                className="w-full"
                type="range"
                min={8}
                max={160}
                value={brushSize}
                onChange={e => setBrushSize(Number(e.target.value))}
                disabled={isBusy}
              />
            </label>
            <label className="space-y-1 text-[11px] text-slate-400">
              <div className="flex justify-between">
                <span>蒙版透明度</span>
                <span>{Math.round(maskOpacity * 100)}%</span>
              </div>
              <input
                className="w-full"
                type="range"
                min={15}
                max={85}
                value={Math.round(maskOpacity * 100)}
                onChange={e => setMaskOpacity(Number(e.target.value) / 100)}
                disabled={status === 'running'}
              />
            </label>

            <div className="grid grid-cols-3 gap-2">
              <button
                className="rounded-lg bg-white/[0.04] px-2 py-1.5 text-[11px] text-slate-400 transition hover:bg-white/[0.08]"
                onClick={clearMask}
                disabled={isBusy}
              >
                清空
              </button>
              <button
                className="rounded-lg bg-white/[0.04] px-2 py-1.5 text-[11px] text-slate-400 transition hover:bg-white/[0.08]"
                onClick={invertMask}
                disabled={isBusy}
              >
                反选
              </button>
              <button
                className="rounded-lg bg-white/[0.04] px-2 py-1.5 text-[11px] text-slate-400 transition hover:bg-white/[0.08]"
                onClick={fillMask}
                disabled={isBusy}
              >
                填满
              </button>
            </div>

            <label className="space-y-1 text-[11px] text-slate-400">
              <span>重绘提示词</span>
              <textarea
                className="h-28 w-full resize-none rounded-lg border border-white/[0.08] bg-white/[0.06] px-3 py-2 text-xs text-slate-200 outline-none focus:border-primary-400/60"
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder="描述白色蒙版区域要变成什么..."
                disabled={status === 'running'}
              />
            </label>

            <label className="space-y-1 text-[11px] text-slate-400">
              <span>生成数量</span>
              <select
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.06] px-3 py-2 text-xs text-slate-300 outline-none"
                value={count}
                onChange={e => setCount(Number(e.target.value))}
                disabled={isBusy}
              >
                <option value={1}>1 张</option>
                <option value={2}>2 张</option>
                <option value={4}>4 张</option>
              </select>
            </label>

            <div className="rounded-lg border border-amber-400/15 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-100/85">
              白色区域会被重绘，黑色区域会保留。请求会使用当前工作画布尺寸，确保原图和蒙版尺寸一致。
            </div>
            {capability.autoSelected && (
              <div className="rounded-lg border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-[11px] leading-relaxed text-emerald-100">
                当前主模型 {capability.requestedModelId}
                {' 不适合严格蒙版局部重绘，已自动使用 '}
                {capability.modelId}。
              </div>
            )}
            {!capability.ok && (
              <div className="whitespace-pre-wrap rounded-lg border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-100">
                {capability.message}
              </div>
            )}
            {error && (
              <div className="whitespace-pre-wrap rounded-lg border border-red-500/15 bg-red-500/10 px-3 py-2 text-[11px] leading-relaxed text-red-300">
                {error}
              </div>
            )}
            <button
              className="mt-auto rounded-xl bg-primary-500/20 px-4 py-2.5 text-sm font-semibold text-primary-100 transition hover:bg-primary-500/30 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={status === 'running' || imageStatus !== 'ready' || !capability.ok}
              onClick={handleGenerate}
            >
              {status === 'running'
                ? '局部重绘中...'
                : imageStatus === 'loading'
                  ? '原图加载中...'
                  : '开始局部重绘'}
            </button>
          </aside>
        </div>
      </div>
    </div>
  )
}

export default InpaintDialog
