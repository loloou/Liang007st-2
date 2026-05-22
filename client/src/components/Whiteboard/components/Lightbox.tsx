import React, { useCallback, useEffect } from 'react'
import { useCanvasStore } from '../store/useCanvasStore'
import { safeUrl } from '../../../utils/safeUrl'

const Lightbox: React.FC = () => {
  const url = useCanvasStore(s => s.lightboxUrl)
  const setUrl = useCanvasStore(s => s.setLightboxUrl)

  const close = useCallback(() => setUrl(null), [setUrl])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && url) close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [url, close])

  if (!url) return null

  return (
    <div
      className="fixed inset-0 z-[10001] flex cursor-zoom-out items-center justify-center bg-black/95 p-8 backdrop-blur-md"
      onClick={close}
    >
      <div className="relative max-h-[90vh] max-w-[90vw]" onClick={e => e.stopPropagation()}>
        <img
          src={safeUrl(url)}
          alt=""
          className="max-h-[85vh] max-w-full rounded-xl object-contain shadow-2xl"
          draggable={false}
        />
        <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-2">
          <a
            href={url}
            download={`canvas_${Date.now()}.png`}
            className="rounded-xl bg-white/10 px-4 py-2 text-xs text-white backdrop-blur-sm transition hover:bg-white/20"
          >
            💾 下载
          </a>
          <button
            onClick={() => navigator.clipboard.writeText(url).catch(() => {})}
            className="rounded-xl bg-white/10 px-4 py-2 text-xs text-white backdrop-blur-sm transition hover:bg-white/20"
          >
            📋 复制 URL
          </button>
          <button
            onClick={close}
            className="rounded-xl bg-white/10 px-4 py-2 text-xs text-white backdrop-blur-sm transition hover:bg-white/20"
          >
            ✕ 关闭
          </button>
        </div>
      </div>
    </div>
  )
}

export default Lightbox
