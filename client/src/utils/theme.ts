export type ThemeMode = 'dark' | 'aurora' | 'cyber' | 'dawn' | 'ember' | 'verdant'

export interface ThemeConfig {
  id: ThemeMode
  name: string
  bgGradient: string
  textColor: string
  accentColor: string        // hex，如 "#6366f1"
  accentRgb: string         // rgb 分量，如 "99, 102, 241"
  isDark: boolean
  surface: string          // --surface 值
  surfaceHover: string     // --surface-hover 值
  border: string          // --border 值
  borderHover: string     // --border-hover 值
  textPrimary: string     // --text-primary 值
  textSecondary: string   // --text-secondary 值
  textTertiary: string    // --text-tertiary 值
  bgBase: string         // --bg-base 值
  bgRaised: string       // --bg-raised 值
  bgOverlay: string       // --bg-overlay 值
  cardBg: string
  borderColor: string
  style: 'glass' | 'flat'
  fontStyle: 'sans' | 'serif'
  description: string
}

export const THEMES: ThemeConfig[] = [
  {
    id: 'dark',
    name: '墨石',
    description: '纯黑极简，专注高效',
    bgGradient: 'from-[#0a0a0f] via-[#0a0a0f] to-[#0a0a0f]',
    textColor: 'text-slate-100',
    accentColor: '#6366f1',
    accentRgb: '99, 102, 241',
    isDark: true,
    surface: '#222230',
    surfaceHover: '#1c1c22',
    border: 'rgba(255, 255, 255, 0.08)',
    borderHover: 'rgba(255, 255, 255, 0.14)',
    textPrimary: '#ffffff',
    textSecondary: '#c8ced8',
    textTertiary: '#9aa3b2',
    bgBase: '#121218',
    bgRaised: '#12121a',
    bgOverlay: 'rgba(0, 0, 0, 0.7)',
    cardBg: 'rgba(255, 255, 255, 0.05)',
    borderColor: 'border-white/[0.08]',
    style: 'glass',
    fontStyle: 'sans',
  },
  {
    id: 'aurora',
    name: '极光',
    description: '紫粉交织，暗夜流光',
    bgGradient: 'from-[#0f0a1a] via-[#0a0f1a] to-[#0a1a15]',
    textColor: 'text-slate-100',
    accentColor: '#8b5cf6',
    accentRgb: '139, 92, 246',
    isDark: true,
    surface: '#201838',
    surfaceHover: '#2a2048',
    border: 'rgba(139, 92, 246, 0.12)',
    borderHover: 'rgba(139, 92, 246, 0.2)',
    textPrimary: '#f0f2f5',
    textSecondary: '#ddd6fe',
    textTertiary: '#a78bfa',
    bgBase: '#14101e',
    bgRaised: '#181228',
    bgOverlay: 'rgba(20, 16, 30, 0.7)',
    cardBg: 'rgba(15, 10, 26, 0.6)',
    borderColor: 'border-violet-500/[0.15]',
    style: 'glass',
    fontStyle: 'sans',
  },
  {
    id: 'cyber',
    name: '赛博朋克',
    description: '霓虹渐变，毛玻璃光影',
    bgGradient: 'from-[#07060e] via-[#07060e] to-[#07060e]',
    textColor: 'text-cyan-50',
    accentColor: '#00f0ff',
    accentRgb: '0, 240, 255',
    isDark: true,
    surface: '#2a2a44',
    surfaceHover: '#32325a',
    border: 'rgba(0, 240, 255, 0.12)',
    borderHover: 'rgba(0, 240, 255, 0.2)',
    textPrimary: '#edfbff',
    textSecondary: '#67e8ff',
    textTertiary: '#00bcd4',
    bgBase: '#0e0e18',
    bgRaised: '#141420',
    bgOverlay: 'rgba(6, 6, 12, 0.85)',
    cardBg: 'rgba(7, 6, 14, 0.65)',
    borderColor: 'border-cyan-400/[0.12]',
    style: 'glass',
    fontStyle: 'sans',
  },
  {
    id: 'dawn',
    name: '晨曦',
    description: '明亮清爽，如晨光照耀',
    bgGradient: 'from-[#f8fafc] via-[#f8fafc] to-[#f1f5f9]',
    textColor: 'text-slate-900',
    accentColor: '#4f6ef7',
    accentRgb: '79, 110, 247',
    isDark: false,
    surface: '#ffffff',
    surfaceHover: '#f1f5f9',
    border: 'rgba(0, 0, 0, 0.05)',
    borderHover: 'rgba(0, 0, 0, 0.1)',
    textPrimary: '#0f172a',
    textSecondary: '#475569',
    textTertiary: '#94a3b8',
    bgBase: '#f8fafc',
    bgRaised: '#ffffff',
    bgOverlay: 'rgba(248, 250, 252, 0.95)',
    cardBg: 'rgba(255, 255, 255, 0.95)',
    borderColor: 'border-slate-200',
    style: 'glass',
    fontStyle: 'sans',
  },
  {
    id: 'ember',
    name: '炽焰',
    description: '暖红暗调，火焰点缀',
    bgGradient: 'from-[#0f0a0a] via-[#1a0f0a] to-[#0f0a0a]',
    textColor: 'text-red-50',
    accentColor: '#dc2626',
    accentRgb: '220, 38, 38',
    isDark: true,
    surface: '#241a1a',
    surfaceHover: '#382828',
    border: 'rgba(239, 68, 68, 0.12)',
    borderHover: 'rgba(239, 68, 68, 0.2)',
    textPrimary: '#fff7f7',
    textSecondary: '#fecaca',
    textTertiary: '#fca5a5',
    bgBase: '#141010',
    bgRaised: '#1a1212',
    bgOverlay: 'rgba(12, 8, 8, 0.85)',
    cardBg: 'rgba(15, 10, 10, 0.6)',
    borderColor: 'border-red-500/[0.12]',
    style: 'glass',
    fontStyle: 'sans',
  },
  {
    id: 'verdant',
    name: '翡翠',
    description: '深林幽绿，自然光泽',
    bgGradient: 'from-[#050f0a] via-[#0a1510] to-[#050f0a]',
    textColor: 'text-emerald-50',
    accentColor: '#059669',
    accentRgb: '5, 150, 105',
    isDark: true,
    surface: '#1a261e',
    surfaceHover: '#2a3a2e',
    border: 'rgba(16, 185, 129, 0.12)',
    borderHover: 'rgba(16, 185, 129, 0.2)',
    textPrimary: '#f2fef8',
    textSecondary: '#a7f3d0',
    textTertiary: '#6ee7b7',
    bgBase: '#0e1410',
    bgRaised: '#121e14',
    bgOverlay: 'rgba(6, 12, 8, 0.85)',
    cardBg: 'rgba(5, 15, 10, 0.6)',
    borderColor: 'border-emerald-500/[0.12]',
    style: 'glass',
    fontStyle: 'sans',
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
  root.style.setProperty('--accent', config.accentColor)
  root.style.setProperty('--accent-rgb', config.accentRgb)
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
