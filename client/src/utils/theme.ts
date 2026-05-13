export type ThemeMode =
  | "dark"
  | "aurora"
  | "cyber"
  | "dawn"
  | "ember"
  | "verdant";

export interface ThemeConfig {
  id: ThemeMode;
  name: string;
  bgGradient: string;
  textColor: string;
  accentColor: string;
  dotGradient: string;
  isDark: boolean;
  cardBg: string;
  borderColor: string;
  style: "glass" | "flat";
  fontStyle: "sans" | "serif";
  description: string;
}

export const THEMES: ThemeConfig[] = [
  {
    id: "dark",
    name: "墨石",
    description: "纯黑极简，专注高效",
    bgGradient: "from-[#0a0a0f] via-[#0a0a0f] to-[#0a0a0f]",
    textColor: "text-slate-100",
    accentColor: "#6366f1",
    dotGradient: "linear-gradient(135deg, #0a0a0f, #6366f1)",
    isDark: true,
    cardBg: "rgba(255, 255, 255, 0.05)",
    borderColor: "border-white/[0.08]",
    style: "glass",
    fontStyle: "sans",
  },
  {
    id: "aurora",
    name: "极光",
    description: "紫粉交织，暗夜流光",
    bgGradient: "from-[#0f0a1a] via-[#0a0f1a] to-[#0a1a15]",
    textColor: "text-slate-100",
    accentColor: "#8b5cf6",
    dotGradient: "linear-gradient(135deg, #7c3aed, #ec4899)",
    isDark: true,
    cardBg: "rgba(15, 10, 26, 0.6)",
    borderColor: "border-violet-500/[0.15]",
    style: "glass",
    fontStyle: "sans",
  },
  {
    id: "cyber",
    name: "赛博朋克",
    description: "霓虹渐变，毛玻璃光影",
    bgGradient: "from-[#07060e] via-[#07060e] to-[#07060e]",
    textColor: "text-cyan-50",
    accentColor: "#00f0ff",
    dotGradient: "linear-gradient(135deg, #00f0ff, #ff2d78)",
    isDark: true,
    cardBg: "rgba(7, 6, 14, 0.65)",
    borderColor: "border-cyan-400/[0.12]",
    style: "glass",
    fontStyle: "sans",
  },
  {
    id: "dawn",
    name: "晨曦",
    description: "简约浅白，清爽干净",
    bgGradient: "from-[#f8f9fa] via-[#f8f9fa] to-[#f1f3f5]",
    textColor: "text-gray-800",
    accentColor: "#6366f1",
    dotGradient: "linear-gradient(135deg, #f8f9fa, #6366f1)",
    isDark: false,
    cardBg: "rgba(255, 255, 255, 0.9)",
    borderColor: "border-gray-200",
    style: "glass",
    fontStyle: "sans",
  },
  {
    id: "ember",
    name: "炽焰",
    description: "暖红暗调，火焰点缀",
    bgGradient: "from-[#0f0a0a] via-[#1a0f0a] to-[#0f0a0a]",
    textColor: "text-red-50",
    accentColor: "#dc2626",
    dotGradient: "linear-gradient(135deg, #dc2626, #ea580c)",
    isDark: true,
    cardBg: "rgba(15, 10, 10, 0.6)",
    borderColor: "border-red-500/[0.12]",
    style: "glass",
    fontStyle: "sans",
  },
  {
    id: "verdant",
    name: "翡翠",
    description: "深林幽绿，自然光泽",
    bgGradient: "from-[#050f0a] via-[#0a1510] to-[#050f0a]",
    textColor: "text-emerald-50",
    accentColor: "#059669",
    dotGradient: "linear-gradient(135deg, #059669, #10b981)",
    isDark: true,
    cardBg: "rgba(5, 15, 10, 0.6)",
    borderColor: "border-emerald-500/[0.12]",
    style: "glass",
    fontStyle: "sans",
  },
];

const STORAGE_KEY = "liang007_theme";

export function getTheme(): ThemeMode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && THEMES.some((t) => t.id === saved)) {
      return saved as ThemeMode;
    }
  } catch {
    // ignore
  }
  return "dark";
}

export function setTheme(theme: ThemeMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // ignore
  }
}

export function getThemeConfig(theme: ThemeMode): ThemeConfig {
  return THEMES.find((t) => t.id === theme) ?? THEMES[0];
}
