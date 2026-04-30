// ═══════════════════════════════════════════════════════════
// AI 图片编辑器 v2 — 全功能类型定义
// ═══════════════════════════════════════════════════════════

// ─── 工具枚举 ───────────────────────────────────────────────
export type EditorTool =
  | "brush"    // 🖌 画笔蒙版
  | "pin"      // 📍 标记点
  | "text"     // 🔤 文字
  | "erase"    // 🧹 智能擦除
  | "bg"       // 🖼 背景
  | "crop"     // ✂ 裁剪
  | "filter"   // 🎨 滤镜
  | "outpaint"; // ↔ 扩图

// ─── 蒙版层 ─────────────────────────────────────────────────
export interface MaskPath {
  id: string;
  points: Array<{ x: number; y: number }>;
  brushSize: number;
  color: string; // 预览色
  isErase: boolean; // true=擦除模式
  timestamp: number;
}

export interface MaskLayer {
  id: string;
  paths: MaskPath[];
  prompt: string;       // 重绘描述
  negativePrompt: string;
  visible: boolean;
  locked: boolean;
  opacity: number;       // 0-100
}

// ─── 标记点 ─────────────────────────────────────────────────
export type PinStyle = "dot" | "numbered" | "arrow" | "pin" | "custom";

export interface PinMarker {
  id: string;
  style: PinStyle;
  x: number;             // 像素坐标（相对于原图）
  y: number;
  xPercent: number;      // 百分比坐标（用于缩放）
  yPercent: number;
  color: string;
  size: number;
  label: string;         // 序号标签 "1" "2" "3"... / "A" "B"...
  note: string;          // 双击编辑的批注内容
  visible: boolean;
  locked: boolean;
  timestamp: number;
}

// ─── 文字 ───────────────────────────────────────────────────
export interface TextStyle {
  fontFamily: string;
  fontSize: number;
  color: string;
  fontWeight: string;
  letterSpacing: number;
  lineHeight: number;
  opacity: number;       // 0-100
  textAlign: "left" | "center" | "right" | "justify";
  direction: "horizontal" | "vertical";
  rotation: number;     // -180 ~ 180
  stroke?: { color: string; width: number };
  shadow?: { x: number; y: number; blur: number; color: string };
  bgColor?: string;
  bgRadius?: number;
  warpPreset?: string;
}

export interface TextAddition {
  id: string;
  x: number;
  y: number;
  xPercent: number;
  yPercent: number;
  content: string;
  style: TextStyle;
  width: number;
  height: number;
  visible: boolean;
  locked: boolean;
}

export interface TextReplacement {
  id: string;
  region: { x: number; y: number; width: number; height: number };
  originalTextHint?: string;
  newText: string;
  matchOriginalStyle: boolean;
  style?: TextStyle;
  visible: boolean;
  locked: boolean;
}

// ─── 擦除 ───────────────────────────────────────────────────
export interface EraseRegion {
  id: string;
  maskPaths: Array<{ x: number; y: number }[]>;
  fillMethod: "ai" | "solid" | "blur";
  fillColor?: string;
  visible: boolean;
  locked: boolean;
}

// ─── 背景 ───────────────────────────────────────────────────
export type BgAction = "remove" | "replace" | "blur" | "solid";

export interface BackgroundEdit {
  action: BgAction;
  blurStrength?: number;       // 0-100，模糊
  solidColor?: string;
  gradientFrom?: string;
  gradientTo?: string;
  replacePrompt?: string;
  replaceImageUrl?: string;    // 替换背景参考图
  featherAmount?: number;       // 0-20，边缘羽化
  foregroundOffset?: { x: number; y: number; scale: number }; // 前景位移
}

// ─── 裁剪 ───────────────────────────────────────────────────
export interface CropConfig {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;    // -45 ~ 45
  flipH: boolean;
  flipV: boolean;
  aspectPreset: string; // "free" | "1:1" | "4:3" | "16:9" | "9:16" | "3:4" | custom
  guidePreset: string;  // "none" | "rule" | "golden" | "grid" | "diagonal"
}

// ─── 滤镜 ───────────────────────────────────────────────────
export type FilterPreset =
  | "original" | "cinematic" | "vintage" | "bw" | "cyberpunk"
  | "japanese" | "morandi" | "warm" | "cool" | "hdr"
  | "comic" | "oil" | "watercolor" | "noir" | "fade"
  | "sunset" | "forest" | "neon" | "portrait" | "landscape"
  | "vivid" | "muted" | "golden" | "moonlight";

export interface FilterAdjustments {
  brightness: number;    // -100 ~ 100
  contrast: number;
  saturation: number;
  warmth: number;         // -100 ~ 100，冷←→暖
  tint: number;           // -100 ~ 100，绿←→品红
  highlights: number;
  shadows: number;
  clarity: number;
  grain: number;          // 0 ~ 100
  vignette: number;       // 0 ~ 100
  fade: number;           // 0 ~ 100
}

export interface FilterState {
  preset: FilterPreset;
  presetStrength: number;  // 0 ~ 100
  adjustments: FilterAdjustments;
}

// ─── 扩图 ───────────────────────────────────────────────────
export type OutpaintDirection = "top" | "bottom" | "left" | "right";

export interface OutpaintConfig {
  directions: OutpaintDirection[];
  top: number;
  bottom: number;
  left: number;
  right: number;
  scale: number;          // 1.25 | 1.5 | 2 | custom
  prompt: string;
  targetWidth?: number;
  targetHeight?: number;
}

// ─── 参考图 ────────────────────────────────────────────────
export type ReferenceType = "style" | "composition" | "color" | "character";

export interface ReferenceImage {
  url: string;
  base64?: string;
  type: ReferenceType;
  strength: number;       // 0 ~ 100
  note: string;
}

// ─── 图层系统 ───────────────────────────────────────────────
export type LayerType = "mask" | "pin" | "text" | "erase" | "bg" | "crop" | "filter" | "outpaint";

export interface EditorLayer {
  id: string;
  type: LayerType;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  timestamp: number;
}

// ─── 历史快照 ───────────────────────────────────────────────
export interface EditorSnapshot {
  maskLayers: MaskLayer[];
  pins: PinMarker[];
  textAdditions: TextAddition[];
  textReplacements: TextReplacement[];
  eraseRegions: EraseRegion[];
  bgEdit: BackgroundEdit | null;
  crop: CropConfig | null;
  filter: FilterState;
  outpaint: OutpaintConfig | null;
  timestamp: number;
}

// ─── API Payload ────────────────────────────────────────────
export interface EditorPayload {
  mode: "img2img_inpaint";
  original_image: string;        // base64 或 url
  mask_image?: string;          // 黑白蒙版 base64
  prompt: string;
  negative_prompt: string;
  reference_images: ReferenceImage[];
  parameters: {
    strength: number;
    guidance_scale: number;
    steps: number;
    seed: number;
    output_size: { width: number; height: number };
    model?: string;
  };
  edit_instructions: {
    inpaint_mask?: string;       // base64
    inpaint_prompt?: string;
    markers?: Array<{ id: number; style: PinStyle; position: { x: number; y: number; xPercent: number; yPercent: number }; color: string; note: string }>;
    text_additions?: TextAddition[];
    text_replacements?: TextReplacement[];
    object_removal_mask?: string;
    background?: BackgroundEdit;
    crop?: CropConfig;
    filters?: FilterState;
    outpaint?: OutpaintConfig;
  };
  compositePrompt?: string;      // 自动拼装的综合提示词
}

// ─── 快捷键映射 ─────────────────────────────────────────────
export interface ShortcutMap {
  [key: string]: EditorTool | "undo" | "redo" | "reset" | "close" | "submit" | "fit" | "zoom1" | "pan" | "delete";
}
