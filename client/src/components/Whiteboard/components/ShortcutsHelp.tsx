import React, { useCallback, useEffect } from 'react'

interface ShortcutsHelpProps {
  onClose: () => void
}

const SHORTCUTS = [
  { keys: ['Enter'], desc: '发送提示词生成图片' },
  { keys: ['Shift', 'Enter'], desc: '提示词换行' },
  { keys: ['Ctrl', 'Enter'], desc: '执行选中的 AI 生成节点' },
  { keys: ['Delete', 'Backspace'], desc: '删除选中节点' },
  { keys: ['Ctrl', 'Z'], desc: '撤销' },
  { keys: ['Ctrl', 'Y'], desc: '重做' },
  { keys: ['Ctrl', 'A'], desc: '全选节点' },
  { keys: ['Ctrl', 'L'], desc: '自动布局' },
  { keys: ['Ctrl', '0'], desc: '适应视图' },
  { keys: ['Escape'], desc: '取消选择 / 关闭面板' },
  { keys: ['双击空白区域'], desc: '添加节点菜单' },
  { keys: ['双击标签'], desc: '重命名节点' },
  { keys: ['拖拽节点角落'], desc: '调整节点大小' },
  { keys: ['右键节点'], desc: '节点操作菜单' },
  { keys: ['拖入图片文件'], desc: '创建图片节点' },
  { keys: ['端口拖出到空白'], desc: '快速连接菜单' },
]

const ShortcutsHelp: React.FC<ShortcutsHelpProps> = ({ onClose }) => {
  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    },
    [onClose],
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [handleKey])

  return (
    <div
      className="fixed inset-0 z-[10002] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-slate-900/98 max-h-[80vh] w-[420px] overflow-hidden rounded-2xl border border-white/[0.08] shadow-2xl backdrop-blur-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3">
          <div className="flex items-center gap-2">
            <svg
              className="h-4 w-4 text-indigo-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
              />
            </svg>
            <span className="text-sm font-bold text-slate-200">快捷键</span>
          </div>
          <button
            onClick={onClose}
            className="text-lg text-slate-500 transition hover:text-slate-300"
          >
            ✕
          </button>
        </div>
        <div className="max-h-[60vh] space-y-1.5 overflow-y-auto p-4">
          {SHORTCUTS.map((s, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-white/[0.03]"
            >
              <span className="text-xs text-slate-400">{s.desc}</span>
              <div className="flex items-center gap-1">
                {s.keys.map((k, j) => (
                  <React.Fragment key={j}>
                    <kbd className="rounded border border-white/[0.08] bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-slate-300">
                      {k}
                    </kbd>
                    {j < s.keys.length - 1 && <span className="text-[10px] text-slate-600">+</span>}
                  </React.Fragment>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="border-t border-white/[0.06] px-4 py-2 text-center">
          <span className="text-[10px] text-slate-600">按 ESC 关闭</span>
        </div>
      </div>
    </div>
  )
}

export default ShortcutsHelp
