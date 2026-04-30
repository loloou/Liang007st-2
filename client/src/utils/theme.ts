/**
 * 主题管理工具
 * 8 种精选渐变配色主题
 */

export type ThemeMode = "light" | "darkBlue" | "purple" | "sunset" | "ocean" | "auroraPink" | "auroraGreen" | "forest";

export interface ThemeConfig {
  id: ThemeMode;
  name: string;
  bgGradient: string;
  textColor: string;
  accentColor: string;
  cardBg: string;
  borderColor: string;
}

export const THEMES: ThemeConfig[] = [
  {
    id: "light",
    name: "🧊 简约白",
    bgGradient: "from-slate-50 via-slate-100 to-slate-200",
    textColor: "text-slate-800",
    accentColor: "#3b82f6",
    cardBg: "rgba(255, 255, 255, 0.8)",
    borderColor: "border-slate-200/60"
  },
  {
    id: "darkBlue",
    name: "🌙 暗夜蓝",
    bgGradient: "from-slate-950 via-blue-950 to-slate-900",
    textColor: "text-blue-100",
    accentColor: "#3b82f6",
    cardBg: "rgba(15, 23, 42, 0.85)",
    borderColor: "border-blue-800/50"
  },
  {
    id: "purple",
    name: "💜 梦幻紫",
    bgGradient: "from-violet-50 via-purple-50 to-fuchsia-50",
    textColor: "text-slate-800",
    accentColor: "#9333ea",
    cardBg: "rgba(255, 255, 255, 0.8)",
    borderColor: "border-purple-200/60"
  },
  {
    id: "sunset",
    name: "🌅 落日橘",
    bgGradient: "from-orange-50 via-amber-50 to-yellow-50",
    textColor: "text-slate-800",
    accentColor: "#f97316",
    cardBg: "rgba(255, 255, 255, 0.8)",
    borderColor: "border-orange-200/60"
  },
  {
    id: "ocean",
    name: "🌊 海洋蓝",
    bgGradient: "from-cyan-50 via-sky-50 to-blue-50",
    textColor: "text-slate-800",
    accentColor: "#06b6d4",
    cardBg: "rgba(255, 255, 255, 0.8)",
    borderColor: "border-cyan-200/60"
  },
  {
    id: "auroraPink",
    name: "🌸 极光粉",
    bgGradient: "from-pink-50 via-rose-50 to-fuchsia-50",
    textColor: "text-slate-800",
    accentColor: "#ec4899",
    cardBg: "rgba(255, 255, 255, 0.8)",
    borderColor: "border-pink-200/60"
  },
  {
    id: "auroraGreen",
    name: "🌿 极光绿",
    bgGradient: "from-emerald-50 via-green-50 to-teal-50",
    textColor: "text-slate-800",
    accentColor: "#10b981",
    cardBg: "rgba(255, 255, 255, 0.8)",
    borderColor: "border-emerald-200/60"
  },
  {
    id: "forest",
    name: "🌲 森林绿",
    bgGradient: "from-green-50 via-emerald-50 to-lime-50",
    textColor: "text-slate-800",
    accentColor: "#22c55e",
    cardBg: "rgba(255, 255, 255, 0.8)",
    borderColor: "border-green-200/60"
  }
];

const STORAGE_KEY = "liang007_theme";

export function getTheme(): ThemeMode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && THEMES.some(t => t.id === saved)) {
      return saved as ThemeMode;
    }
  } catch {
    // ignore
  }
  return "light";
}

export function setTheme(theme: ThemeMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // ignore
  }
}

export function getThemeConfig(theme: ThemeMode): ThemeConfig {
  return THEMES.find(t => t.id === theme) ?? THEMES[0];
}
