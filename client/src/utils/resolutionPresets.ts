/** 分辨率预设：原比例以参考图为准，其余为固定比例 */

export type ResolutionPresetId =
  | "original"
  | "1:1"
  | "4:3"
  | "16:9"
  | "3:4"
  | "9:16"
  | "2:3"
  | "3:2"
  | "5:4"
  | "4:5"
  | "21:9"
  | "9:21";

export const RESOLUTION_PRESETS: { id: ResolutionPresetId; label: string; ratio: number }[] = [
  { id: "original", label: "原比例", ratio: 0 },
  { id: "1:1",  label: "1:1",  ratio: 1 },
  { id: "16:9", label: "16:9", ratio: 16 / 9 },
  { id: "9:16", label: "9:16", ratio: 9 / 16 },
  { id: "4:3",  label: "4:3",  ratio: 4 / 3 },
  { id: "3:4",  label: "3:4",  ratio: 3 / 4 },
  { id: "3:2",  label: "3:2",  ratio: 3 / 2 },
  { id: "2:3",  label: "2:3",  ratio: 2 / 3 },
  { id: "5:4",  label: "5:4",  ratio: 5 / 4 },
  { id: "4:5",  label: "4:5",  ratio: 4 / 5 },
  { id: "21:9", label: "21:9", ratio: 21 / 9 },
  { id: "9:21", label: "9:21", ratio: 9 / 21 }
];

/** 尺寸档位：1K / 2K / 4K，默认 2K */
export const SIZE_TIERS = [
  { id: "1K", label: "1K", maxSide: 1024 },
  { id: "2K", label: "2K", maxSide: 1920 },
  { id: "4K", label: "4K", maxSide: 3840 }
] as const;

export type SizeTierId = (typeof SIZE_TIERS)[number]["id"];

/** 国家标准分辨率：按 1K / 2K / 4K 与比例预设（宽×高） */
export const STANDARD_RESOLUTIONS: Record<
  SizeTierId,
  Partial<Record<ResolutionPresetId, { width: number; height: number }>>
> = {
  "1K": {
    "1:1":  { width: 1024, height: 1024 },
    "4:3":  { width: 1200, height: 896  },
    "16:9": { width: 1376, height: 768  },
    "3:4":  { width: 896,  height: 1200 },
    "9:16": { width: 768,  height: 1376 },
    "3:2":  { width: 1248, height: 832  },
    "2:3":  { width: 832,  height: 1248 },
    "5:4":  { width: 1152, height: 896  },
    "4:5":  { width: 896,  height: 1152 },
    "21:9": { width: 1584, height: 672  },
    "9:21": { width: 672,  height: 1584 }
  },
  "2K": {
    "1:1":  { width: 2048, height: 2048 },
    "4:3":  { width: 2400, height: 1792 },
    "16:9": { width: 2752, height: 1536 },
    "3:4":  { width: 1792, height: 2400 },
    "9:16": { width: 1536, height: 2752 },
    "3:2":  { width: 2496, height: 1664 },
    "2:3":  { width: 1664, height: 2496 },
    "5:4":  { width: 2304, height: 1792 },
    "4:5":  { width: 1792, height: 2304 },
    "21:9": { width: 3168, height: 1344 },
    "9:21": { width: 1344, height: 3168 }
  },
  "4K": {
    "1:1":  { width: 4096,  height: 4096  },
    "16:9": { width: 5504,  height: 3072  },
    "9:16": { width: 3072,  height: 5504  },
    "4:3":  { width: 4800,  height: 3584  },
    "3:4":  { width: 3584,  height: 4800  },
    "3:2":  { width: 4992,  height: 3328  },
    "2:3":  { width: 3328,  height: 4992  },
    "5:4":  { width: 4608,  height: 3584  },
    "4:5":  { width: 3584,  height: 4608  },
    "21:9": { width: 6336,  height: 2688  },
    "9:21": { width: 2688,  height: 6336  }
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
