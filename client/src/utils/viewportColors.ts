// ─────────────────────────────────────────────────────────────────────────────
//  viewportColors.ts — 视口/槽位颜色配置（App.tsx 和 ResultPanel.tsx 共享）
// ─────────────────────────────────────────────────────────────────────────────

export const VIEWPORT_COLORS = [
  {
    border: 'border-blue-400/30',
    bg: 'bg-blue-500/10',
    text: 'text-blue-300',
    dot: 'bg-blue-400',
    label: 'text-blue-300',
    ring: 'ring-blue-400/30',
    hex: '#60a5fa',
  },
  {
    border: 'border-emerald-400/30',
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-300',
    dot: 'bg-emerald-400',
    label: 'text-emerald-300',
    ring: 'ring-emerald-400/30',
    hex: '#34d399',
  },
  {
    border: 'border-amber-400/30',
    bg: 'bg-amber-500/10',
    text: 'text-amber-300',
    dot: 'bg-amber-400',
    label: 'text-amber-300',
    ring: 'ring-amber-400/30',
    hex: '#fbbf24',
  },
  {
    border: 'border-pink-400/30',
    bg: 'bg-pink-500/10',
    text: 'text-pink-300',
    dot: 'bg-pink-400',
    label: 'text-pink-300',
    ring: 'ring-pink-400/30',
    hex: '#f472b6',
  },
  {
    border: 'border-purple-400/30',
    bg: 'bg-purple-500/10',
    text: 'text-purple-300',
    dot: 'bg-purple-400',
    label: 'text-purple-300',
    ring: 'ring-purple-400/30',
    hex: '#a78bfa',
  },
  {
    border: 'border-cyan-400/30',
    bg: 'bg-cyan-500/10',
    text: 'text-cyan-300',
    dot: 'bg-cyan-400',
    label: 'text-cyan-300',
    ring: 'ring-cyan-400/30',
    hex: '#22d3ee',
  },
] as const

export type ViewportColor = (typeof VIEWPORT_COLORS)[number]

/** 按索引获取视口颜色（循环） */
export function getViewportColorByIndex(index: number): ViewportColor {
  return VIEWPORT_COLORS[index % VIEWPORT_COLORS.length]
}
