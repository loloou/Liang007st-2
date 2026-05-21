export type ThemeMode = 'dragon' | 'dark' | 'aurora' | 'cyber' | 'dawn' | 'ember' | 'verdant'

const STELLAR_THEMES = {
  dragon: {
    accent2: '#e8b94a',
    accent3: '#ff6b2b',
    bgMid: '#1a0e08',
    grid: 'rgba(232, 185, 74, 0.06)',
    halo: 'rgba(255, 107, 43, 0.14)',
  },
  dark: {
    accent2: '#7b68ee',
    accent3: '#00ffff',
    bgMid: '#080c1e',
    grid: 'rgba(0, 255, 255, 0.05)',
    halo: 'rgba(123, 104, 238, 0.14)',
  },
  aurora: {
    accent2: '#ff2d95',
    accent3: '#00f0ff',
    bgMid: '#14081e',
    grid: 'rgba(255, 45, 149, 0.05)',
    halo: 'rgba(191, 0, 255, 0.14)',
  },
  cyber: {
    accent2: '#39ff14',
    accent3: '#ff003c',
    bgMid: '#0a0c08',
    grid: 'rgba(57, 255, 20, 0.04)',
    halo: 'rgba(57, 255, 20, 0.10)',
  },
  dawn: {
    accent2: '#00d4ff',
    accent3: '#c084fc',
    bgMid: '#e8eef8',
    grid: 'rgba(0, 212, 255, 0.06)',
    halo: 'rgba(0, 212, 255, 0.10)',
  },
  ember: {
    accent2: '#ff4500',
    accent3: '#ffd700',
    bgMid: '#1c0804',
    grid: 'rgba(255, 69, 0, 0.05)',
    halo: 'rgba(255, 69, 0, 0.12)',
  },
  verdant: {
    accent2: '#00ffaa',
    accent3: '#00bfff',
    bgMid: '#060e0a',
    grid: 'rgba(0, 255, 170, 0.04)',
    halo: 'rgba(0, 255, 170, 0.10)',
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
    id: 'dragon',
    name: '龙鳞帝铸',
    description: '古铜烙印覆于墨玉基底，金纹沿龙脊蜿蜒如活物',
    bgGradient: 'from-[#050304] via-[#110a06] to-[#180e08]',
    textColor: 'text-amber-50',
    accentColor: '#f0c040',
    accentRgb: '240, 192, 64',
    isDark: true,
    surface: 'rgba(18, 10, 6, 0.90)',
    surfaceHover: 'rgba(30, 18, 10, 0.96)',
    border: 'rgba(240, 192, 64, 0.16)',
    borderHover: 'rgba(255, 180, 60, 0.40)',
    textPrimary: '#fff4d6',
    textSecondary: '#e8c88a',
    textTertiary: '#b8924e',
    bgBase: '#050304',
    bgRaised: '#160c06',
    bgOverlay: 'rgba(5, 3, 4, 0.95)',
    cardBg: 'rgba(18, 10, 6, 0.84)',
    borderColor: 'border-amber-300/[0.14]',
    style: 'glass',
    fontStyle: 'serif',
    tag: '帝铸',
  },
  {
    id: 'dark',
    name: '深渊折跃',
    description: '星际引擎冷光穿透虚空，电弧在超导管壁上跳弧',
    bgGradient: 'from-[#020308] via-[#060a1c] to-[#080e28]',
    textColor: 'text-slate-100',
    accentColor: '#4d9eff',
    accentRgb: '77, 158, 255',
    isDark: true,
    surface: 'rgba(6, 12, 30, 0.82)',
    surfaceHover: 'rgba(10, 18, 48, 0.94)',
    border: 'rgba(77, 158, 255, 0.16)',
    borderHover: 'rgba(123, 104, 238, 0.38)',
    textPrimary: '#e8f0ff',
    textSecondary: '#a0c4ff',
    textTertiary: '#6888b8',
    bgBase: '#020308',
    bgRaised: '#070c1e',
    bgOverlay: 'rgba(2, 3, 8, 0.92)',
    cardBg: 'rgba(6, 12, 30, 0.78)',
    borderColor: 'border-blue-400/[0.12]',
    style: 'glass',
    fontStyle: 'sans',
    tag: '折跃',
  },
  {
    id: 'aurora',
    name: '霓虹狂潮',
    description: '午夜都市霓虹倒映湿漉路面，品红与靛蓝交替闪烁',
    bgGradient: 'from-[#06030e] via-[#120620] to-[#18081a]',
    textColor: 'text-slate-100',
    accentColor: '#bf00ff',
    accentRgb: '191, 0, 255',
    isDark: true,
    surface: 'rgba(22, 8, 38, 0.84)',
    surfaceHover: 'rgba(34, 12, 58, 0.96)',
    border: 'rgba(191, 0, 255, 0.16)',
    borderHover: 'rgba(255, 45, 149, 0.34)',
    textPrimary: '#f0e6ff',
    textSecondary: '#d8a8ff',
    textTertiary: '#a060d8',
    bgBase: '#06030e',
    bgRaised: '#0e0618',
    bgOverlay: 'rgba(6, 3, 14, 0.93)',
    cardBg: 'rgba(22, 8, 38, 0.78)',
    borderColor: 'border-purple-400/[0.14]',
    style: 'glass',
    fontStyle: 'sans',
    tag: '狂潮',
  },
  {
    id: 'cyber',
    name: '暗网渗透',
    description: '黑屏上荧绿字符瀑布倾泻，防火墙在红色警报中碎裂',
    bgGradient: 'from-[#020402] via-[#080c08] to-[#0a0e06]',
    textColor: 'text-green-50',
    accentColor: '#39ff14',
    accentRgb: '57, 255, 20',
    isDark: true,
    surface: 'rgba(8, 14, 8, 0.88)',
    surfaceHover: 'rgba(14, 24, 14, 0.96)',
    border: 'rgba(57, 255, 20, 0.14)',
    borderHover: 'rgba(57, 255, 20, 0.35)',
    textPrimary: '#e0ffe0',
    textSecondary: '#a0ff80',
    textTertiary: '#60c840',
    bgBase: '#020402',
    bgRaised: '#060a06',
    bgOverlay: 'rgba(2, 4, 2, 0.93)',
    cardBg: 'rgba(8, 14, 8, 0.80)',
    borderColor: 'border-green-400/[0.12]',
    style: 'glass',
    fontStyle: 'sans',
    tag: '渗透',
  },
  {
    id: 'dawn',
    name: '冰晶穹顶',
    description: '极地科考站的全息投影洒下冰蓝微光，窗外是永昼的雪原',
    bgGradient: 'from-[#f0f4fa] via-[#e6eef8] to-[#f2f6fc]',
    textColor: 'text-slate-900',
    accentColor: '#0099dd',
    accentRgb: '0, 153, 221',
    isDark: false,
    surface: 'rgba(255, 255, 255, 0.93)',
    surfaceHover: 'rgba(240, 246, 255, 0.98)',
    border: 'rgba(0, 153, 221, 0.10)',
    borderHover: 'rgba(0, 153, 221, 0.28)',
    textPrimary: '#0c1424',
    textSecondary: '#3d5068',
    textTertiary: '#7088a8',
    bgBase: '#f0f4fa',
    bgRaised: '#ffffff',
    bgOverlay: 'rgba(240, 244, 250, 0.97)',
    cardBg: 'rgba(255, 255, 255, 0.95)',
    borderColor: 'border-sky-300/[0.12]',
    style: 'glass',
    fontStyle: 'sans',
    tag: '穹顶',
  },
  {
    id: 'ember',
    name: '铸炉熔核',
    description: '地下锻造厂铁水迸溅，每一锤落下都让合金骨架通红',
    bgGradient: 'from-[#0a0202] via-[#1c0806] to-[#100402]',
    textColor: 'text-red-50',
    accentColor: '#ff4500',
    accentRgb: '255, 69, 0',
    isDark: true,
    surface: 'rgba(34, 10, 6, 0.86)',
    surfaceHover: 'rgba(52, 16, 8, 0.96)',
    border: 'rgba(255, 69, 0, 0.14)',
    borderHover: 'rgba(255, 120, 40, 0.34)',
    textPrimary: '#fff0e8',
    textSecondary: '#ffb090',
    textTertiary: '#e07848',
    bgBase: '#0a0202',
    bgRaised: '#180604',
    bgOverlay: 'rgba(10, 2, 2, 0.93)',
    cardBg: 'rgba(34, 10, 6, 0.80)',
    borderColor: 'border-orange-500/[0.12]',
    style: 'glass',
    fontStyle: 'sans',
    tag: '熔核',
  },
  {
    id: 'verdant',
    name: '蚀刻丛林',
    description: '废墟之上藤蔓吞噬钢铁，生物芯片在腐蚀液中觉醒',
    bgGradient: 'from-[#010804] via-[#041208] to-[#020e06]',
    textColor: 'text-emerald-50',
    accentColor: '#00ff88',
    accentRgb: '0, 255, 136',
    isDark: true,
    surface: 'rgba(4, 22, 12, 0.86)',
    surfaceHover: 'rgba(8, 36, 20, 0.96)',
    border: 'rgba(0, 255, 136, 0.14)',
    borderHover: 'rgba(0, 255, 170, 0.32)',
    textPrimary: '#e0fff0',
    textSecondary: '#80ffc0',
    textTertiary: '#40c880',
    bgBase: '#010804',
    bgRaised: '#041408',
    bgOverlay: 'rgba(1, 8, 4, 0.93)',
    cardBg: 'rgba(4, 22, 12, 0.78)',
    borderColor: 'border-emerald-400/[0.12]',
    style: 'glass',
    fontStyle: 'sans',
    tag: '蚀刻',
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
  return 'dragon'
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
