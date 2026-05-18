import React from 'react'
import { useUiStore } from '../../store/uiStore'

const FEATURES = ['提示词优化', '批量生成', '参考图', '多模型', '多渠道', '生图历史', '性能监控']

const AboutDialog: React.FC = () => {
  const showAbout = useUiStore(s => s.showAbout)
  const setShowAbout = useUiStore(s => s.setShowAbout)

  if (!showAbout) return null

  return (
    <div
      className="overlay-dark fixed inset-0 z-50 flex items-center justify-center"
      onClick={() => setShowAbout(false)}
    >
      <div
        className="glass-popup popup-enter w-full max-w-md overflow-hidden rounded-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* 头部渐变 */}
        <div className="relative flex h-28 flex-col items-center justify-center overflow-hidden bg-gradient-to-r from-primary-500/100 via-purple-500 to-pink-500">
          <div
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage:
                'radial-gradient(circle at 20% 50%, white 0%, transparent 50%), radial-gradient(circle at 80% 20%, white 0%, transparent 40%)',
            }}
          />
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/25 shadow-lg backdrop-blur">
            <svg
              className="h-10 w-10 text-white"
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
        </div>

        {/* 内容 */}
        <div className="p-6 text-center">
          <h2 className="mb-0.5 text-xl font-bold text-slate-100">Liang007 生图</h2>
          <p className="mb-4 text-sm text-slate-400">Version 5.5.0</p>
          <p className="mb-4 text-sm leading-relaxed text-slate-400">
            基于 React + Vite + TypeScript + Tailwind CSS 开发的 AI 生图工作台，支持多种生图 API
            与模型。
          </p>

          {/* 版权声明 */}
          <div className="mb-5 rounded-xl border border-red-500/15 bg-red-500/10 px-4 py-2.5">
            <p className="text-xs font-semibold text-red-400">🔒 内部专用 · 所有权归 Liang007</p>
            <p className="mt-0.5 text-[10px] text-red-400">
              Liang007 Studio © 2026 · 未经授权禁止使用
            </p>
          </div>

          {/* 功能标签 */}
          <div className="mb-6 flex flex-col gap-2 text-xs text-slate-500">
            <div className="flex flex-wrap justify-center gap-1.5">
              {FEATURES.map(f => (
                <span
                  key={f}
                  className="rounded-lg border border-white/[0.06] bg-white/[0.06] px-2 py-1 text-[11px] text-slate-400"
                >
                  {f}
                </span>
              ))}
            </div>
          </div>

          <button
            onClick={() => setShowAbout(false)}
            className="btn-hover-lift rounded-full bg-gradient-to-r from-primary-500/100 to-purple-500/100 px-8 py-2.5 text-sm font-medium text-white shadow-lg shadow-primary-500/25"
          >
            知道了
          </button>
        </div>
      </div>
    </div>
  )
}

export default React.memo(AboutDialog)
