import React, { useEffect, useRef } from 'react'
import { useCanvasStore, type NodeKind } from '../store/useCanvasStore'

interface QuickConnectMenuProps {
  x: number
  y: number
  flowX: number
  flowY: number
  sourceNodeId: string
  onClose: () => void
}

const MENU_ITEMS: Array<{
  kind: NodeKind
  label: string
  desc: string
  color: string
  icon: React.ReactNode
}> = [
  {
    kind: 'generate',
    label: 'AI 生成',
    desc: '连接并生成图片',
    color: 'text-purple-400 hover:bg-purple-500/10 border-purple-500/20',
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M13 10V3L4 14h7v7l9-11h-7z"
        />
      </svg>
    ),
  },
  {
    kind: 'image',
    label: '图片节点',
    desc: '接收生成结果',
    color: 'text-indigo-400 hover:bg-indigo-500/10 border-indigo-500/20',
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
        />
      </svg>
    ),
  },
  {
    kind: 'text',
    label: '提示词',
    desc: '添加文本提示',
    color: 'text-amber-400 hover:bg-amber-500/10 border-amber-500/20',
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
        />
      </svg>
    ),
  },
]

const QuickConnectMenu: React.FC<QuickConnectMenuProps> = ({
  x,
  y,
  flowX,
  flowY,
  sourceNodeId,
  onClose,
}) => {
  const { addNode, onConnect } = useCanvasStore()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const adjustedX = Math.min(x, window.innerWidth - 200)
  const adjustedY = Math.min(y, window.innerHeight - 200)

  const handleSelect = (kind: NodeKind) => {
    const newId = addNode(kind, { x: flowX, y: flowY })
    setTimeout(() => {
      onConnect({
        source: sourceNodeId,
        target: newId,
        sourceHandle: null,
        targetHandle: null,
      })
    }, 50)
    onClose()
  }

  return (
    <div
      ref={ref}
      className="bg-slate-900/98 fixed z-[10000] min-w-[180px] rounded-xl border border-white/[0.08] py-1.5 shadow-2xl backdrop-blur-xl"
      style={{ left: adjustedX, top: adjustedY }}
    >
      <div className="mb-1 border-b border-white/[0.06] px-3 py-1.5">
        <span className="text-[9px] font-bold uppercase tracking-widest text-slate-600">
          连接到...
        </span>
      </div>
      {MENU_ITEMS.map(item => (
        <button
          key={item.kind}
          onClick={() => handleSelect(item.kind)}
          className={`flex w-full items-center gap-2.5 border-l-2 border-transparent px-3 py-2 text-left transition ${item.color}`}
        >
          {item.icon}
          <div>
            <p className="text-xs font-medium">{item.label}</p>
            <p className="text-[9px] text-slate-600">{item.desc}</p>
          </div>
        </button>
      ))}
    </div>
  )
}

export default QuickConnectMenu
