/** 分辨率预设：对齐标准比例表
 * 参考：分辨率比例表（图片）
 */

export type ResolutionPresetId =
  | "original"
  | "1:1"
  | "16:9"
  | "9:16"
  | "4:3"
  | "3:4"
  | "21:9"
  | "3:2"
  | "2:3"
  | "5:4"
  | "4:5";

/** 比例形状类型 */
export type ShapeType = "square" | "landscape" | "portrait";

export const RESOLUTION_PRESETS: {
  id: ResolutionPresetId;
  label: string;
  ratio: number;
  shape: ShapeType;
}[] = [
  { id: "original", label: "原比例",   ratio: 0,     shape: "square"    },
  { id: "1:1",     label: "1:1",     ratio: 1,      shape: "square"    },
  { id: "16:9",   label: "16:9",    ratio: 16/9,  shape: "landscape" },
  { id: "9:16",   label: "9:16",    ratio: 9/16,  shape: "portrait"  },
  { id: "4:3",    label: "4:3",     ratio: 4/3,   shape: "landscape" },
  { id: "3:4",    label: "3:4",     ratio: 3/4,   shape: "portrait"  },
  { id: "21:9",   label: "21:9",    ratio: 21/9,  shape: "landscape" },
  { id: "3:2",    label: "3:2",     ratio: 3/2,   shape: "landscape" },
  { id: "2:3",    label: "2:3",     ratio: 2/3,   shape: "portrait"  },
  { id: "5:4",    label: "5:4",     ratio: 5/4,   shape: "landscape" },
  { id: "4:5",    label: "4:5",     ratio: 4/5,   shape: "portrait"  },
];

/** 尺寸档位：1K / 2K / 4K，默认 2K
 * 与 Google Gemini API 标准对齐（高度基准：768/1536/3072）
 */
export const SIZE_TIERS = [
  { id: "1K", label: "1K", maxSide: 1024 },
  { id: "2K", label: "2K", maxSide: 1920 },
  { id: "4K", label: "4K", maxSide: 3840 }
] as const;

export type SizeTierId = (typeof SIZE_TIERS)[number]["id"];

/** 标准分辨率：按图片表精确对齐
 * 1K / 2K / 4K 三档
 */
export const STANDARD_RESOLUTIONS: Record<
  SizeTierId,
  Partial<Record<ResolutionPresetId, { width: number; height: number }>>
> = {
  "1K": {
    "1:1":  { width: 1024, height: 1024 },
    "16:9": { width: 1376, height: 768  },
    "9:16": { width: 768,  height: 1376 },
    "4:3":  { width: 1200, height: 896  },
    "3:4":  { width: 896,  height: 1200 },
    "21:9": { width: 1584, height: 672  },
    "3:2":  { width: 1248, height: 832  },
    "2:3":  { width: 832,  height: 1248 },
    "5:4":  { width: 1152, height: 896  },
    "4:5":  { width: 896,  height: 1152 },
  },
  "2K": {
    "1:1":  { width: 2048, height: 2048 },
    "16:9": { width: 2752, height: 1536 },
    "9:16": { width: 1536, height: 2752 },
    "4:3":  { width: 2400, height: 1792 },
    "3:4":  { width: 1792, height: 2400 },
    "21:9": { width: 3168, height: 1344 },
    "3:2":  { width: 2496, height: 1664 },
    "2:3":  { width: 1664, height: 2496 },
    "5:4":  { width: 2304, height: 1792 },
    "4:5":  { width: 1792, height: 2304 },
  },
  "4K": {
    "1:1":  { width: 4096,  height: 4096  },
    "16:9": { width: 5504,  height: 3072  },
    "9:16": { width: 3072,  height: 5504  },
    "4:3":  { width: 4800,  height: 3584  },
    "3:4":  { width: 3584,  height: 4800  },
    "21:9": { width: 6336,  height: 2688  },
    "3:2":  { width: 4992,  height: 3328  },
    "2:3":  { width: 3328,  height: 4992  },
    "5:4":  { width: 4608,  height: 3584  },
    "4:5":  { width: 3584,  height: 4608  },
  }
};

const CLAMP = { min: 256, max: 8192 };

function clamp(n: number): number {
  return Math.round(Math.max(CLAMP.min, Math.min(CLAMP.max, n)));
}

/**
 * 根据预设与参考图尺寸计算宽高。
 * 原比例：有参考图用参考图尺寸按档位缩放，否则用 1:1 标准。
 * 其他预设：使用国家标准分辨率表（1K/2K/4K）。
 */
export function getResolution(
  presetId: ResolutionPresetId,
  sizeTierId: SizeTierId,
  referenceSize: { width: number; height: number } | null
): { width: number; height: number } {
  if (presetId === "original" && referenceSize) {
    const { width, height } = referenceSize;
    const maxSide = Math.max(width, height);
    const tier = SIZE_TIERS.find((t) => t.id === sizeTierId);
    const base = tier?.maxSide ?? 1920;
    if (maxSide <= 0) return { width: base, height: base };
    const scale = base / maxSide;
    return { width: clamp(width * scale), height: clamp(height * scale) };
  }

  if (presetId === "original") {
    const std = STANDARD_RESOLUTIONS[sizeTierId]?.["1:1"];
    return std ?? { width: 1920, height: 1920 };
  }

  const std = STANDARD_RESOLUTIONS[sizeTierId]?.[presetId];
  if (std) return std;

  const preset = RESOLUTION_PRESETS.find((p) => p.id === presetId);
  const ratio = preset?.ratio ?? 1;
  const base = SIZE_TIERS.find((t) => t.id === sizeTierId)?.maxSide ?? 1920;
  let w: number, h: number;
  if (ratio >= 1) {
    w = base;
    h = clamp(base / ratio);
  } else {
    h = base;
    w = clamp(base * ratio);
  }
  return { width: w, height: h };
}

/** 从 File 读取图片尺寸 */
export function loadImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("无法读取图片尺寸"));
    };
    img.src = url;
  });
}
