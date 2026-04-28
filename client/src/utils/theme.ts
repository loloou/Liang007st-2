/**
 * 主题管理工具
 */

export type ThemeMode = "light" | "dark" | "darkBlue" | "darkPurple" | "blue" | "purple" | "green" | "sunset" | "ocean" | "forest";

export interface ThemeConfig {
  id: ThemeMode;
  name: string;
  bgGradient: string;
  cardBg: string;
  buttonPrimary: string;
  textColor: string;
  borderColor: string;
}

export const THEMES: ThemeConfig[] = [
  {
    id: "light",
    name: "简约白",
    bgGradient: "from-slate-50 via-slate-100 to-slate-200",
    cardBg: "rgba(255, 255, 255, 0.7)",
    buttonPrimary: "from-primary-500 to-primary-600",
    textColor: "text-slate-900",
    borderColor: "border-slate-200"
  },
  {
    id: "dark",
    name: "深空黑",
    bgGradient: "from-slate-900 via-slate-800 to-slate-900",
    cardBg: "rgba(30, 41, 59, 0.8)",
    buttonPrimary: "from-slate-600 to-slate-700",
    textColor: "text-white",
    borderColor: "border-slate-700"
  },
  {
    id: "darkBlue",
    name: "暗夜蓝",
    bgGradient: "from-slate-900 via-blue-950 to-slate-900",
    cardBg: "rgba(15, 23, 42, 0.85)",
    buttonPrimary: "from-blue-600 to-indigo-700",
    textColor: "text-blue-100",
    borderColor: "border-blue-800"
  },
  {
    id: "darkPurple",
    name: "暗夜紫",
    bgGradient: "from-slate-900 via-purple-950 to-slate-900",
    cardBg: "rgba(20, 20, 35, 0.85)",
    buttonPrimary: "from-purple-600 to-violet-700",
    textColor: "text-purple-100",
    borderColor: "border-purple-800"
  },
  {
    id: "blue",
    name: "科技蓝",
    bgGradient: "from-blue-50 via-indigo-50 to-blue-100",
    cardBg: "rgba(255, 255, 255, 0.7)",
    buttonPrimary: "from-blue-500 to-indigo-600",
    textColor: "text-slate-900",
    borderColor: "border-slate-200"
  },
  {
    id: "purple",
    name: "梦幻紫",
    bgGradient: "from-violet-50 via-purple-50 to-fuchsia-50",
    cardBg: "rgba(255, 255, 255, 0.7)",
    buttonPrimary: "from-violet-500 to-purple-600",
    textColor: "text-slate-900",
    borderColor: "border-slate-200"
  },
  {
    id: "green",
    name: "自然绿",
    bgGradient: "from-emerald-50 via-teal-50 to-cyan-50",
    cardBg: "rgba(255, 255, 255, 0.7)",
    buttonPrimary: "from-emerald-500 to-teal-600",
    textColor: "text-slate-900",
    borderColor: "border-slate-200"
  },
  {
    id: "sunset",
    name: "落日橘",
    bgGradient: "from-orange-50 via-amber-50 to-yellow-50",
    cardBg: "rgba(255, 255, 255, 0.7)",
    buttonPrimary: "from-orange-500 to-amber-600",
    textColor: "text-slate-900",
    borderColor: "border-slate-200"
  },
  {
    id: "ocean",
    name: "海洋蓝",
    bgGradient: "from-cyan-50 via-sky-50 to-blue-50",
    cardBg: "rgba(255, 255, 255, 0.7)",
    buttonPrimary: "from-cyan-500 to-sky-600",
    textColor: "text-slate-900",
    borderColor: "border-slate-200"
  },
  {
    id: "forest",
    name: "森林绿",
    bgGradient: "from-green-50 via-emerald-50 to-teal-50",
    cardBg: "rgba(255, 255, 255, 0.7)",
    buttonPrimary: "from-green-500 to-emerald-600",
    textColor: "text-slate-900",
    borderColor: "border-slate-200"
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
