/**
 * InfiniteCanvas — 原版无限画布入口
 *
 * 这里只替换"无限画布"内容区域，不改主软件外壳。
 * 直接加载原版 static/canvas.html，保留旧版无限画布的完整界面与交互。
 */
import React, { useCallback, useEffect, useImperativeHandle, useMemo, useRef, forwardRef } from 'react'
import type { InfiniteCanvasProps } from './types'

export interface InfiniteCanvasHandle {
  requestClose: () => void
}

const InfiniteCanvas = forwardRef<InfiniteCanvasHandle, InfiniteCanvasProps>(
  ({ onClose, generationParams }, ref) => {
    const iframeRef = useRef<HTMLIFrameElement>(null)
    const closingRef = useRef(false)
    const src = useMemo(() => {
      return '/static/canvas.html?v=' + Date.now()
    }, [])

    const syncGenerationParams = useCallback(() => {
      iframeRef.current?.contentWindow?.postMessage(
        { type: 'studio-generation-settings', settings: generationParams ?? null },
        '*',
      )
    }, [generationParams])

    /** Ask the iframe to save and then close */
    const requestClose = useCallback(() => {
      if (closingRef.current) return
      closingRef.current = true
      iframeRef.current?.contentWindow?.postMessage({ type: 'canvas-save-and-close' }, '*')
      // Safety: if iframe doesn't respond within 3s, close anyway
      setTimeout(() => {
        if (closingRef.current) {
          closingRef.current = false
          onClose?.()
        }
      }, 3000)
    }, [onClose])

    useImperativeHandle(ref, () => ({ requestClose }), [requestClose])

    useEffect(() => {
      const handler = (event: MessageEvent) => {
        if (event.data?.type === 'infinite-canvas:close') {
          closingRef.current = false
          onClose?.()
        }
      }
      window.addEventListener('message', handler)
      return () => window.removeEventListener('message', handler)
    }, [onClose])

    useEffect(() => {
      syncGenerationParams()
    }, [syncGenerationParams])

    return (
      <iframe
        ref={iframeRef}
        title="InfiniteCanvas"
        src={src}
        style={{ width: '100%', height: '100%', border: 0, display: 'block' }}
        onLoad={syncGenerationParams}
      />
    )
  },
)

InfiniteCanvas.displayName = 'InfiniteCanvas'

export default InfiniteCanvas

export type { CanvasGenerationParams, CanvasAdapter, InfiniteCanvasProps } from './types'
