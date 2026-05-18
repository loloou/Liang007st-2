/**
 * useInfiniteCanvas — 画布适配器 Hook
 *
 * 将 useCanvasStore 的内部状态映射为 CanvasAdapter 接口。
 * 主界面通过此 hook 与画布交互，不直接依赖 useCanvasStore。
 *
 * 替换画布实现时，只需重写此 hook 的映射逻辑。
 */
import { useMemo } from 'react'
import { useCanvasStore } from '../Whiteboard/store/useCanvasStore'
import type { CanvasAdapter } from './types'
import type { CanvasNodeData } from '../Whiteboard/store/useCanvasStore'

export function useInfiniteCanvas(): CanvasAdapter {
  const nodes = useCanvasStore(s => s.nodes)
  const clearCompletedNodes = useCanvasStore(s => s.clearCompletedNodes)

  const isGenerating = useMemo(
    () => nodes.some(n => (n.data as CanvasNodeData)?.status === 'running'),
    [nodes],
  )

  const isIdle = useMemo(
    () =>
      !nodes.some(n => {
        const status = (n.data as CanvasNodeData)?.status
        return status === 'running' || status === 'queued'
      }),
    [nodes],
  )

  const imageUrls = useMemo(() => {
    const urls: string[] = []
    for (const node of nodes) {
      const data = node.data as CanvasNodeData
      if (data?.kind === 'image' && typeof data?.imageUrl === 'string') {
        urls.push(data.imageUrl)
      }
      if (Array.isArray(data?.imageResults)) {
        for (const r of data.imageResults) {
          if (r && typeof r?.url === 'string') urls.push(r.url)
        }
      }
    }
    return urls
  }, [nodes])

  return {
    isGenerating,
    isIdle,
    getAllImageUrls: () => imageUrls,
    clearCompleted: clearCompletedNodes,
  }
}
