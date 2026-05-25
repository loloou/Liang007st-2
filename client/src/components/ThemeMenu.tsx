/**
 * ThemeMenu — 主题选择下拉菜单
 *
 * 从 App.tsx 提取的独立组件，减少主组件体积。
 */
import React from 'react'
import { THEMES, type ThemeMode } from '../utils/theme'

type Props = {
  open: boolean
  theme: ThemeMode
  buttonRef: React.RefObject<HTMLButtonElement | null>
  onSelect: (theme: ThemeMode) => void
  onClose: () => void
}

const ThemeMenu: React.FC<Props> = ({ open, theme, buttonRef, onSelect, onClose }) => {
  if (!open || !buttonRef.current) return null

  return (
    <>
      <div className="fixed inset-0 z-[9998]" onClick={onClose} />
      <div
        className="glass-popup popup-enter fixed z-[9999] w-60 rounded-xl py-1.5"
        style={{
          left: buttonRef.current.getBoundingClientRect().left,
          top: buttonRef.current.getBoundingClientRect().bottom + 8,
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-1 border-b border-white/[0.06] px-3 pb-2">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                Theme
              </div>
              <div className="mt-0.5 text-[11px] font-medium text-amber-100">
                龙鳞帝铸 / Dragon Scale Console
              </div>
            </div>
            <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-[9px] uppercase tracking-[0.2em] text-slate-400">
              HUD
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-1.5 px-2.5 pb-2">
          {THEMES.map((t, index) => {
            const isActive = theme === t.id
            const code = String(index + 1).padStart(2, '0')
            const shortCode = t.id === 'dragon' ? t.name : t.name.replace(/^星域-\d+\s*/, '')
            return (
              <button
                key={t.id}
                className={`flex min-h-[56px] w-full items-stretch gap-2 overflow-hidden rounded-lg text-left text-xs transition-all ${
                  isActive
                    ? 'bg-white/[0.09] ring-1 ring-primary-400/20'
                    : 'hover:bg-white/[0.04] hover:ring-1 hover:ring-white/[0.04]'
                }`}
                onClick={() => onSelect(t.id)}
              >
                <div
                  className="w-1 flex-shrink-0"
                  style={{
                    background: t.accentColor,
                    boxShadow: `0 0 14px ${t.accentColor}55`,
                  }}
                />
                <div className="flex flex-shrink-0 flex-col items-center justify-center gap-0.5 py-0.5 pl-0.5">
                  <span
                    className="h-2.5 w-2.5 rounded-full ring-1 ring-white/10"
                    style={{
                      background: t.accentColor,
                      boxShadow: `0 0 10px ${t.accentColor}44`,
                    }}
                  />
                  <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-1 py-0.5 text-[7px] font-semibold tracking-[0.16em] text-slate-400">
                    {code}
                  </span>
                </div>
                <div className="min-w-0 flex-1 py-1.5 pr-2">
                  <div className="flex items-center gap-1">
                    <span
                      className={`text-[11px] ${isActive ? 'font-semibold text-amber-300' : 'text-slate-300'}`}
                    >
                      {shortCode}
                    </span>
                    <span className="rounded-full bg-white/[0.04] px-1 py-0.5 text-[7px] uppercase tracking-[0.16em] text-slate-500">
                      {t.id}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1">
                    <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-1 py-0.5 text-[7px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                      {t.tag}
                    </span>
                  </div>
                </div>
                {isActive && (
                  <svg
                    className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-300"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2.5}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </>
  )
}

export default React.memo(ThemeMenu)
