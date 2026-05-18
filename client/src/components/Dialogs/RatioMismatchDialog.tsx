import React from 'react'

interface RatioMismatchData {
  actualRatio: string
  expectedRatio: string
  onConfirm: () => void
}

interface RatioMismatchDialogProps {
  data: RatioMismatchData | null
  onDismiss: () => void
  onRegenerate: () => void
}

const RatioMismatchDialog: React.FC<RatioMismatchDialogProps> = ({
  data,
  onDismiss,
  onRegenerate,
}) => {
  if (!data) return null

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={onDismiss}
    >
      <div
        className="glass-popup popup-enter w-full max-w-md overflow-hidden rounded-2xl shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="flex h-12 items-center gap-2 bg-gradient-to-r from-amber-500 to-orange-500 px-4">
          <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <span className="text-sm font-semibold text-white">生成图片比例与设置不一致</span>
        </div>

        {/* 内容 */}
        <div className="space-y-3 p-5">
          <p className="text-sm text-slate-300">生成的图片比例与您的设置不匹配：</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-red-500/15 bg-red-500/10 p-3">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-red-500">
                实际比例
              </p>
              <p className="text-lg font-bold text-red-400">{data.actualRatio}</p>
            </div>
            <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/10 p-3">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
                设置比例
              </p>
              <p className="text-lg font-bold text-emerald-400">{data.expectedRatio}</p>
            </div>
          </div>
          <p className="text-xs text-slate-500">是否重新生成以获得正确比例的图片？</p>
        </div>

        {/* 操作 */}
        <div className="flex justify-end gap-2 px-5 pb-5">
          <button
            className="rounded-xl border border-white/[0.08] px-4 py-2 text-sm text-slate-400 transition hover:bg-white/[0.04]"
            onClick={onDismiss}
          >
            保留当前结果
          </button>
          <button
            className="rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-5 py-2 text-sm font-medium text-white transition hover:from-amber-600 hover:to-orange-600"
            onClick={onRegenerate}
          >
            重新生成
          </button>
        </div>
      </div>
    </div>
  )
}

export default React.memo(RatioMismatchDialog)
