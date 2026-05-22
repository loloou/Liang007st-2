import React, { useEffect, useRef } from 'react'
import { useCanvasStore } from '../store/useCanvasStore'

interface ContextMenuProps {
  x: number
  y: number
  nodeId: string
  onClose: () => void
}

const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, nodeId, onClose }) => {
  const { removeNode, duplicateNode, runGenerate, nodes } = useCanvasStore()
  const ref = useRef<HTMLDivElement>(null)
  const node = nodes.find(n => n.id === nodeId)
  const kind = node?.data?.kind as string | undefined
  const selectedNodes = nodes.filter(n => n.selected)
  const isMultiSelect = selectedNodes.length > 1

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const deleteSelected = () => {
    const ids = isMultiSelect ? selectedNodes.map(n => n.id) : [nodeId]
    ids.forEach(id => removeNode(id))
    onClose()
  }

  const items = [
    ...(kind === 'generate' && !isMultiSelect
      ? [
          {
            label: '▶ 执行生成',
            color: 'text-purple-400',
            action: () => {
              runGenerate(nodeId)
              onClose()
            },
          },
        ]
      : []),
    ...(!isMultiSelect
      ? [
          {
            label: '📋 复制节点',
            color: 'text-slate-300',
            action: () => {
              duplicateNode(nodeId)
              onClose()
            },
          },
        ]
      : []),
    {
      label: isMultiSelect ? `🗑 删除 ${selectedNodes.length} 个节点` : '🗑 删除节点',
      color: 'text-red-400',
      action: deleteSelected,
    },
  ]

  return (
    <div
      ref={ref}
      className="bg-slate-900/98 fixed z-[10000] min-w-[160px] rounded-xl border border-white/[0.08] py-1.5 shadow-2xl backdrop-blur-xl"
      style={{ left: x, top: y }}
    >
      <div className="mb-1 border-b border-white/[0.06] px-3 py-1">
        <span className="text-[9px] font-bold uppercase tracking-widest text-slate-600">
          {isMultiSelect ? `已选 ${selectedNodes.length} 个节点` : kind || '节点'}
        </span>
      </div>
      {items.map((item, i) => (
        <button
          key={i}
          onClick={item.action}
          className={`w-full px-3 py-2 text-left text-xs ${item.color} transition hover:bg-white/[0.04]`}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}

export default ContextMenu
