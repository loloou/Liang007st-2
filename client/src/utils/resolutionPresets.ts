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

/** 比例形状类型 */
export type ShapeType = "square" | "landscape" | "portrait" | "ultrawide" | "ultratall";

export const RESOLUTION_PRESETS: {
  id: ResolutionPresetId;
  label: string;
  ratio: number;
  shape: ShapeType;
}[] = [
  { id: "original", label: "原比例", ratio: 0, shape: "square" },
  { id: "1:1",  label: "1:1",  ratio: 1,     shape: "square"   },
  { id: "16:9", label: "16:9", ratio: 16 / 9, shape: "landscape" },
  { id: "9:16", label: "9:16", ratio: 9 / 16, shape: "portrait"  },
  { id: "4:3",  label: "4:3",  ratio: 4 / 3,  shape: "landscape" },
  { id: "3:4",  label: "3:4",  ratio: 3 / 4,  shape: "portrait"  },
  { id: "3:2",  label: "3:2",  ratio: 3 / 2,  shape: "landscape" },
  { id: "2:3",  label: "2:3",  ratio: 2 / 3,  shape: "portrait"  },
  { id: "5:4",  label: "5:4",  ratio: 5 / 4,  shape: "landscape" },
  { id: "4:5",  label: "4:5",  ratio: 4 / 5,  shape: "portrait"  },
  { id: "21:9", label: "21:9", ratio: 21 / 9, shape: "ultrawide"  },
  { id: "9:21", label: "9:21", ratio: 9 / 21, shape: "ultratall"  }
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

/** 标准分辨率：与 Google Gemini API 标准完全对齐
 * 高度基准：1K=768px, 2K=1536px, 4K=3072px
 * 宽边按比例精确换算（比例不变 × 高度基准）
 * 参考：https://docs.laozhang.ai/api-capabilities/nano-banana-pro-image
 */
export const STANDARD_RESOLUTIONS: Record<
  SizeTierId,
  Partial<Record<ResolutionPresetId, { width: number; height: number }>>
> = {
  "1K": {
    "1:1":  { width: 1024, height: 1024 },
    "4:3":  { width: 1024, height: 768  },
    "16:9": { width: 1376, height: 768  },
    "3:4":  { width: 768,  height: 1024 },
    "9:16": { width: 768,  height: 1376 },
    "3:2":  { width: 1152, height: 768  },
    "2:3":  { width: 768,  height: 1152 },
    "5:4":  { width: 960,  height: 768  },
    "4:5":  { width: 768,  height: 960  },
    "21:9": { width: 1584, height: 672  },
    "9:21": { width: 672,  height: 1584 }
  },
  "2K": {
    "1:1":  { width: 2048, height: 2048 },
    "4:3":  { width: 2048, height: 1536 },
    "16:9": { width: 2752, height: 1536 },
    "3:4":  { width: 1536, height: 2048 },
    "9:16": { width: 1536, height: 2752 },
    "3:2":  { width: 2304, height: 1536 },
    "2:3":  { width: 1536, height: 2304 },
    "5:4":  { width: 1920, height: 1536 },
    "4:5":  { width: 1536, height: 1920 },
    "21:9": { width: 3168, height: 1344 },
    "9:21": { width: 1344, height: 3168 }
  },
  "4K": {
    "1:1":  { width: 4096,  height: 4096  },
    "4:3":  { width: 4096,  height: 3072  },
    "16:9": { width: 5504,  height: 3072  },
    "3:4":  { width: 3072,  height: 4096  },
    "9:16": { width: 3072,  height: 5504  },
    "3:2":  { width: 4608,  height: 3072  },
    "2:3":  { width: 3072,  height: 4608  },
    "5:4":  { width: 3840,  height: 3072  },
    "4:5":  { width: 3072,  height: 3840  },
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
