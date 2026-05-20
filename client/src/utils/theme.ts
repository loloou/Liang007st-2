export type ThemeMode = 'dark' | 'aurora' | 'cyber' | 'dawn' | 'ember' | 'verdant'

const STELLAR_THEMES = {
  dark: {
    accent2: '#8d7dff',
    accent3: '#2de2e6',
    bgMid: '#06172c',
    grid: 'rgba(116, 202, 255, 0.07)',
    halo: 'rgba(141, 125, 255, 0.15)',
  },
  aurora: {
    accent2: '#ff6bbd',
    accent3: '#38bdf8',
    bgMid: '#1a0f34',
    grid: 'rgba(208, 108, 255, 0.07)',
    halo: 'rgba(255, 107, 189, 0.16)',
  },
  cyber: {
    accent2: '#ffe082',
    accent3: '#00e5ff',
    bgMid: '#12110d',
    grid: 'rgba(255, 184, 77, 0.07)',
    halo: 'rgba(255, 184, 77, 0.13)',
  },
  dawn: {
    accent2: '#22d3ee',
    accent3: '#a78bfa',
    bgMid: '#eaf3ff',
    grid: 'rgba(93, 140, 255, 0.08)',
    halo: 'rgba(34, 211, 238, 0.16)',
  },
  ember: {
    accent2: '#ffd166',
    accent3: '#fb7185',
    bgMid: '#2a1009',
    grid: 'rgba(255, 138, 61, 0.065)',
    halo: 'rgba(255, 209, 102, 0.12)',
  },
  verdant: {
    accent2: '#2dd4bf',
    accent3: '#bef264',
    bgMid: '#071a13',
    grid: 'rgba(100, 217, 125, 0.065)',
    halo: 'rgba(45, 212, 191, 0.13)',
  },
} satisfies Record<
  ThemeMode,
  {
    accent2: string
    accent3: string
    bgMid: string
    grid: string
    halo: string
  }
>

export interface ThemeConfig {
  id: ThemeMode
  name: string
  bgGradient: string
  textColor: string
  accentColor: string // hex，如 "#6366f1"
  accentRgb: string // rgb 分量，如 "99, 102, 241"
  isDark: boolean
  surface: string // --surface 值
  surfaceHover: string // --surface-hover 值
  border: string // --border 值
  borderHover: string // --border-hover 值
  textPrimary: string // --text-primary 值
  textSecondary: string // --text-secondary 值
  textTertiary: string // --text-tertiary 值
  bgBase: string // --bg-base 值
  bgRaised: string // --bg-raised 值
  bgOverlay: string // --bg-overlay 值
  cardBg: string
  borderColor: string
  style: 'glass' | 'flat'
  fontStyle: 'sans' | 'serif'
  description: string
  tag: string
}

export const THEMES: ThemeConfig[] = [
  {
    id: 'dark',
    name: '星域-01 深空',
    description: '蓝紫星云，深空指挥舱',
    bgGradient: 'from-[#020613] via-[#06172c] to-[#0a1f3a]',
    textColor: 'text-slate-100',
    accentColor: '#56b8ff',
    accentRgb: '86, 184, 255',
    isDark: true,
    surface: 'rgba(7, 19, 39, 0.78)',
    surfaceHover: 'rgba(12, 31, 61, 0.92)',
    border: 'rgba(116, 202, 255, 0.18)',
    borderHover: 'rgba(155, 221, 255, 0.45)',
    textPrimary: '#f8fbff',
    textSecondary: '#c9e6ff',
    textTertiary: '#86a6c9',
    bgBase: '#020613',
    bgRaised: '#091a32',
    bgOverlay: 'rgba(2, 8, 18, 0.9)',
    cardBg: 'rgba(7, 19, 39, 0.72)',
    borderColor: 'border-sky-300/[0.14]',
    style: 'glass',
    fontStyle: 'sans',
    tag: 'ORBIT',
  },
  {
    id: 'aurora',
    name: '星域-02 极光',
    description: '紫玫脉冲，极光回路',
    bgGradient: 'from-[#090816] via-[#180d2e] to-[#1e0e24]',
    textColor: 'text-slate-100',
    accentColor: '#d06cff',
    accentRgb: '208, 108, 255',
    isDark: true,
    surface: 'rgba(30, 16, 50, 0.82)',
    surfaceHover: 'rgba(42, 20, 72, 0.95)',
    border: 'rgba(208, 108, 255, 0.18)',
    borderHover: 'rgba(255, 122, 204, 0.36)',
    textPrimary: '#f0f2f5',
    textSecondary: '#f3d9ff',
    textTertiary: '#e09bff',
    bgBase: '#090816',
    bgRaised: '#120b26',
    bgOverlay: 'rgba(7, 4, 18, 0.92)',
    cardBg: 'rgba(30, 16, 50, 0.76)',
    borderColor: 'border-violet-500/[0.15]',
    style: 'glass',
    fontStyle: 'sans',
    tag: 'AURA',
  },
  {
    id: 'cyber',
    name: '星域-03 矩阵',
    description: '琥珀矩阵，脉冲终端',
    bgGradient: 'from-[#04060a] via-[#121515] to-[#100c0a]',
    textColor: 'text-cyan-50',
    accentColor: '#ffb84d',
    accentRgb: '255, 184, 77',
    isDark: true,
    surface: 'rgba(16, 14, 12, 0.88)',
    surfaceHover: 'rgba(28, 23, 18, 0.98)',
    border: 'rgba(255, 184, 77, 0.18)',
    borderHover: 'rgba(255, 214, 120, 0.38)',
    textPrimary: '#edfbff',
    textSecondary: '#ffe7b7',
    textTertiary: '#ffd78d',
    bgBase: '#04060a',
    bgRaised: '#111311',
    bgOverlay: 'rgba(3, 4, 7, 0.92)',
    cardBg: 'rgba(16, 14, 12, 0.76)',
    borderColor: 'border-cyan-400/[0.12]',
    style: 'glass',
    fontStyle: 'sans',
    tag: 'MATRIX',
  },
  {
    id: 'dawn',
    name: '星域-04 晨辉',
    description: '冰蓝晨曦，浅光面板',
    bgGradient: 'from-[#f4f8ff] via-[#eef4ff] to-[#f7fbff]',
    textColor: 'text-slate-900',
    accentColor: '#5d8cff',
    accentRgb: '93, 140, 255',
    isDark: false,
    surface: 'rgba(255, 255, 255, 0.92)',
    surfaceHover: 'rgba(242, 246, 255, 0.98)',
    border: 'rgba(93, 140, 255, 0.12)',
    borderHover: 'rgba(93, 140, 255, 0.3)',
    textPrimary: '#0f172a',
    textSecondary: '#4f5f77',
    textTertiary: '#8191aa',
    bgBase: '#f4f8ff',
    bgRaised: '#ffffff',
    bgOverlay: 'rgba(244, 248, 255, 0.97)',
    cardBg: 'rgba(255, 255, 255, 0.94)',
    borderColor: 'border-slate-200',
    style: 'glass',
    fontStyle: 'sans',
    tag: 'DAWN',
  },
  {
    id: 'ember',
    name: '星域-05 赤焰',
    description: '铜焰警戒，热浪回路',
    bgGradient: 'from-[#120603] via-[#26100a] to-[#130805]',
    textColor: 'text-red-50',
    accentColor: '#ff8a3d',
    accentRgb: '255, 138, 61',
    isDark: true,
    surface: 'rgba(44, 16, 10, 0.84)',
    surfaceHover: 'rgba(64, 22, 14, 0.96)',
    border: 'rgba(255, 138, 61, 0.16)',
    borderHover: 'rgba(255, 168, 105, 0.36)',
    textPrimary: '#fff7f7',
    textSecondary: '#ffd7c0',
    textTertiary: '#ffbc8a',
    bgBase: '#120603',
    bgRaised: '#240d08',
    bgOverlay: 'rgba(10, 4, 4, 0.92)',
    cardBg: 'rgba(44, 16, 10, 0.76)',
    borderColor: 'border-red-500/[0.12]',
    style: 'glass',
    fontStyle: 'sans',
    tag: 'BURN',
  },
  {
    id: 'verdant',
    name: '星域-06 翡影',
    description: '苔绿脉冲，生态终端',
    bgGradient: 'from-[#020d08] via-[#071512] to-[#03100b]',
    textColor: 'text-emerald-50',
    accentColor: '#64d97d',
    accentRgb: '100, 217, 125',
    isDark: true,
    surface: 'rgba(6, 28, 18, 0.84)',
    surfaceHover: 'rgba(11, 44, 26, 0.96)',
    border: 'rgba(100, 217, 125, 0.16)',
    borderHover: 'rgba(140, 245, 170, 0.34)',
    textPrimary: '#f2fef8',
    textSecondary: '#d3ffe0',
    textTertiary: '#86edab',
    bgBase: '#020d08',
    bgRaised: '#071812',
    bgOverlay: 'rgba(3, 10, 6, 0.92)',
    cardBg: 'rgba(6, 28, 18, 0.76)',
    borderColor: 'border-emerald-500/[0.12]',
    style: 'glass',
    fontStyle: 'sans',
    tag: 'GROW',
  },
]

const STORAGE_KEY = 'liang007_theme'

export function getTheme(): ThemeMode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved && THEMES.some(t => t.id === saved)) {
      return saved as ThemeMode
    }
  } catch {
    // ignore
  }
  return 'dark'
}

export function setTheme(theme: ThemeMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // ignore
  }
}

export function getThemeConfig(theme: ThemeMode): ThemeConfig {
  return THEMES.find(t => t.id === theme) ?? THEMES[0]
}

/**
 * 将 ThemeConfig 中的字段注入为 CSS 变量（document.documentElement）
 * 供 App.tsx 在主题切换时调用
 */
export function injectThemeVars(config: ThemeConfig): void {
  const root = document.documentElement
  const stellar = STELLAR_THEMES[config.id]
  root.style.setProperty('--accent', config.accentColor)
  root.style.setProperty('--accent-rgb', config.accentRgb)
  root.style.setProperty('--accent-2', stellar.accent2)
  root.style.setProperty('--accent-3', stellar.accent3)
  root.style.setProperty('--bg-mid', stellar.bgMid)
  root.style.setProperty('--grid-color', stellar.grid)
  root.style.setProperty('--halo-color', stellar.halo)
  root.style.setProperty('--is-dark', config.isDark ? '1' : '0')
  root.style.setProperty('--surface', config.surface)
  root.style.setProperty('--surface-hover', config.surfaceHover)
  root.style.setProperty('--border', config.border)
  root.style.setProperty('--border-hover', config.borderHover)
  root.style.setProperty('--text-primary', config.textPrimary)
  root.style.setProperty('--text-secondary', config.textSecondary)
  root.style.setProperty('--text-tertiary', config.textTertiary)
  root.style.setProperty('--bg-base', config.bgBase)
  root.style.setProperty('--bg-raised', config.bgRaised)
  root.style.setProperty('--bg-overlay', config.bgOverlay)
}
