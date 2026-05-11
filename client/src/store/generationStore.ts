// ─────────────────────────────────────────────────────────────────────────────
//  generationStore.ts — 生图参数、结果、历史记录的状态中心
//
//  职责：
//    - 生图参数（prompt / model / resolution / batch / referenceImages）
//    - 生图状态（running / idle / elapsed / progress）
//    - 生图结果（images / selectedIds / downloadStatus）
//    - 历史记录（generationHistory / promptHistory / promptTemplates）
// ─────────────────────────────────────────────────────────────────────────────

import { create } from "zustand";
import { type GeneratedImage } from "../api/imageClient";
import { getApiConfig } from "../api/settings";
import {
  getResolution,
  loadImageDimensions,
  type ResolutionPresetId,
  type SizeTierId,
} from "../utils/resolutionPresets";
import { downloadImage, downloadImages } from "../utils/download";

// ── 常量 ─────────────────────────────────────────────────────────────────────

export const DEFAULT_SIZE_TIER: SizeTierId = "2K";
export const DEFAULT_MODEL = "nano-banana-pro";
export const MAX_HISTORY = 30;
export const MAX_PROMPT_HISTORY = 50;

// localStorage key 集中管理，杜绝字符串散落各处
export const STORAGE_KEYS = {
  GENERATION_HISTORY:  "liang007_generation_history",
  CURRENT_GENERATION:  "liang007_current_generation",
  PROMPT_HISTORY:      "liang007_prompt_history",
  PROMPT_TEMPLATES:    "liang007_prompt_templates",
} as const;

// ── 类型 ─────────────────────────────────────────────────────────────────────

export type GenerationStatus = "idle" | "running";

export type HistoryEntry = {
  id: string;
  time: string;
  prompt: string;
  negativePrompt?: string;
  model: string;
  width: number;
  height: number;
  batchSize: number;
  results: GeneratedImage[];
  error?: string;
  duration?: string;
};

export type PromptTemplate = {
  name: string;
  prompt: string;
  negative?: string;
};

// ── localStorage 工具 ────────────────────────────────────────────────────────

/** 安全写入历史，自动截断 + 配额降级 */
function safeSaveHistory(history: HistoryEntry[]): void {
  try {
    const trimmed = history.slice(0, MAX_HISTORY);
    localStorage.setItem(STORAGE_KEYS.GENERATION_HISTORY, JSON.stringify(trimmed));
  } catch (e: unknown) {
    const err = e as { name?: string; message?: string };
    if (err?.name === "QuotaExceededError" || err?.message?.includes("quota")) {
      try {
        const minimal = history.slice(0, 10).map((h) => ({ ...h, results: [] }));
        localStorage.setItem(STORAGE_KEYS.GENERATION_HISTORY, JSON.stringify(minimal));
      } catch {
        // 仍失败：静默放弃，不影响应用正常运行
      }
    }
  }
}

// ── Store 接口 ────────────────────────────────────────────────────────────────

interface GenerationState {
  // 生图参数
  prompt: string;
  negativePrompt: string;
  batchSize: number;
  width: number;
  height: number;
  resolutionPreset: ResolutionPresetId;
  sizeTier: SizeTierId;
  model: string;
  modelList: string[];
  referenceSlots: (File | null)[];
  referencePreviewUrls: (string | null)[];
  referenceSize: { width: number; height: number } | null;

  // 生图状态
  status: GenerationStatus;
  elapsedSeconds: number;
  progressPct: number;
  lastDuration: string | null;
  error: string | null;

  // 生图结果
  results: GeneratedImage[];
  resultActiveIdx: number;
  selectedImageIds: Set<string>;
  downloadStatus: "idle" | "downloading";

  // 历史 & 模板
  generationHistory: HistoryEntry[];
  promptHistory: string[];
  promptTemplates: PromptTemplate[];

  // UI 细节（仅与生成流程强耦合的部分）
  ratioMismatchDialog: {
    actualRatio: string;
    expectedRatio: string;
    onConfirm: () => void;
  } | null;

  // ── actions ────────────────────────────────────────────────────────────────

  setPrompt: (v: string) => void;
  setNegativePrompt: (v: string) => void;
  setBatchSize: (v: number) => void;
  setResolutionPreset: (v: ResolutionPresetId) => void;
  setSizeTier: (v: SizeTierId) => void;
  setModel: (v: string) => void;
  setModelList: (v: string[]) => void;
  setReferenceSlot: (index: number, file: File | null) => void;
  clearReferenceSlots: () => void;
  syncReferencePreviewUrls: (urls: (string | null)[]) => void;
  setReferenceSize: (size: { width: number; height: number } | null) => void;
  syncResolution: () => void;

  setResults: (images: GeneratedImage[]) => void;
  setResultActiveIdx: (idx: number) => void;
  toggleImageSelection: (id: string) => void;
  toggleSelectAll: () => void;
  setRatioMismatchDialog: (
    dialog: { actualRatio: string; expectedRatio: string; onConfirm: () => void } | null
  ) => void;
  setError: (v: string | null) => void;

  handleDownloadSingle: (img: GeneratedImage) => Promise<void>;
  handleBatchDownload: () => Promise<void>;

  // 历史 & 模板 actions
  deleteHistory: (id: string) => void;
  deletePromptHistory: (index: number) => void;
  addPromptTemplate: (tpl: PromptTemplate) => void;
  updatePromptTemplate: (index: number, tpl: PromptTemplate) => void;
  deletePromptTemplate: (index: number) => void;
  applyTemplate: (tpl: PromptTemplate) => void;
  restoreFromHistory: (entry: HistoryEntry) => void;

  // 内部
  _elapsedTimerRef: ReturnType<typeof setInterval> | null;
}

// ── Store 实现 ────────────────────────────────────────────────────────────────

export const useGenerationStore = create<GenerationState>()((set, get) => {
  // 初始化 modelList
  function getInitialModelAndList() {
    try {
      const cfg = getApiConfig();
      const list = cfg.imageModels.map((m) => m.modelId).filter(Boolean);
      const model = list[0] ?? "";
      return { model, list };
    } catch {
      return { model: "", list: [] };
    }
  }

  const { model: initModel, list: initList } = getInitialModelAndList();

  return {
    // ── 初始值 ──────────────────────────────────────────────────────────────
    prompt: "",
    negativePrompt: "",
    batchSize: 1,
    width: 2752,
    height: 1536,
    resolutionPreset: "16:9",
    sizeTier: DEFAULT_SIZE_TIER,
    model: initModel,
    modelList: initList,
    referenceSlots: [null, null, null, null],
    referencePreviewUrls: [null, null, null, null],
    referenceSize: null,

    status: "idle",
    elapsedSeconds: 0,
    progressPct: 0,
    lastDuration: null,
    error: null,

    results: [],
    resultActiveIdx: 0,
    selectedImageIds: new Set(),
    downloadStatus: "idle",

    generationHistory: (() => {
      try {
        const raw = localStorage.getItem(STORAGE_KEYS.GENERATION_HISTORY);
        return raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
      } catch { return []; }
    })(),
    promptHistory: (() => {
      try {
        const raw = localStorage.getItem(STORAGE_KEYS.PROMPT_HISTORY);
        return raw ? (JSON.parse(raw) as string[]) : [];
      } catch { return []; }
    })(),
    promptTemplates: (() => {
      try {
        const raw = localStorage.getItem(STORAGE_KEYS.PROMPT_TEMPLATES);
        return raw ? (JSON.parse(raw) as PromptTemplate[]) : [];
      } catch { return []; }
    })(),

  ratioMismatchDialog: null,
  _elapsedTimerRef: null,

    // ── setters ─────────────────────────────────────────────────────────────
    setPrompt: (v) => set({ prompt: v }),
    setNegativePrompt: (v) => set({ negativePrompt: v }),
    setBatchSize: (v) => set({ batchSize: v }),
    setModel: (v) => set({ model: v }),
    setModelList: (v) => set({ modelList: v }),
    setReferenceSize: (size) => set({ referenceSize: size }),
    setResults: (images) => set({ results: images }),
    setResultActiveIdx: (idx) => set({ resultActiveIdx: idx }),
    setRatioMismatchDialog: (dialog) => set({ ratioMismatchDialog: dialog }),
    setError: (v: string | null) => set({ error: v }),
    syncReferencePreviewUrls: (urls) => set({ referencePreviewUrls: urls }),

    setResolutionPreset: (v) => {
      set({ resolutionPreset: v });
      // 同步宽高
      const { sizeTier, referenceSize } = get();
      const { width, height } = getResolution(v, sizeTier, referenceSize);
      set({ width, height });
    },

    setSizeTier: (v) => {
      set({ sizeTier: v });
      const { resolutionPreset, referenceSize } = get();
      const { width, height } = getResolution(resolutionPreset, v, referenceSize);
      set({ width, height });
    },

    syncResolution: () => {
      const { resolutionPreset, sizeTier, referenceSize } = get();
      const { width, height } = getResolution(resolutionPreset, sizeTier, referenceSize);
      set({ width, height });
    },

    setReferenceSlot: (index, file) => {
      const slots = [...get().referenceSlots];
      slots[index] = file;
      set({ referenceSlots: slots });

      // 同步参考图尺寸（取第一张非空）
      const first = slots.find(Boolean) as File | undefined;
      if (!first) {
        set({ referenceSize: null });
        get().syncResolution();
        return;
      }
      loadImageDimensions(first)
        .then((size) => {
          set({ referenceSize: size });
          get().syncResolution();
        })
        .catch(() => {
          set({ referenceSize: null });
          get().syncResolution();
        });
    },

    clearReferenceSlots: () => {
      set({
        referenceSlots: [null, null, null, null],
        referencePreviewUrls: [null, null, null, null],
        referenceSize: null,
      });
    },

    // ── 图片选中 ─────────────────────────────────────────────────────────────
    toggleImageSelection: (id) => {
      const next = new Set(get().selectedImageIds);
      if (next.has(id)) next.delete(id); else next.add(id);
      set({ selectedImageIds: next });
    },

    toggleSelectAll: () => {
      const { results, selectedImageIds } = get();
      if (selectedImageIds.size === results.length) {
        set({ selectedImageIds: new Set() });
      } else {
        set({ selectedImageIds: new Set(results.map((r) => r.id)) });
      }
    },

    // ── 下载 ─────────────────────────────────────────────────────────────────
    handleDownloadSingle: async (img) => {
      try {
        set({ downloadStatus: "downloading" });
        await downloadImage(img.url, `generated_${img.id}.png`);
      } catch (e) {
        set({ error: `下载失败: ${e instanceof Error ? e.message : String(e)}` });
      } finally {
        set({ downloadStatus: "idle" });
      }
    },

    handleBatchDownload: async () => {
      const { results, selectedImageIds } = get();
      const selected = results.filter((r) => selectedImageIds.has(r.id));
      if (selected.length === 0) { set({ error: "请先选择要下载的图片" }); return; }
      try {
        set({ downloadStatus: "downloading" });
        await downloadImages(selected, "generated");
      } catch (e) {
        set({ error: `批量下载失败: ${e instanceof Error ? e.message : String(e)}` });
      } finally {
        set({ downloadStatus: "idle" });
      }
    },

    // ── 历史 & 模板 ──────────────────────────────────────────────────────────
    deleteHistory: (id) => {
      const filtered = get().generationHistory.filter((h) => h.id !== id);
      set({ generationHistory: filtered });
      safeSaveHistory(filtered);
    },

    deletePromptHistory: (index) => {
      const next = get().promptHistory.filter((_, i) => i !== index);
      set({ promptHistory: next });
      try { localStorage.setItem(STORAGE_KEYS.PROMPT_HISTORY, JSON.stringify(next)); } catch { /* ignore */ }
    },

    addPromptTemplate: (tpl) => {
      const next = [...get().promptTemplates, tpl];
      set({ promptTemplates: next });
      try { localStorage.setItem(STORAGE_KEYS.PROMPT_TEMPLATES, JSON.stringify(next)); } catch { /* ignore */ }
    },

    updatePromptTemplate: (index, tpl) => {
      const next = get().promptTemplates.map((t, i) => (i === index ? tpl : t));
      set({ promptTemplates: next });
      try { localStorage.setItem(STORAGE_KEYS.PROMPT_TEMPLATES, JSON.stringify(next)); } catch { /* ignore */ }
    },

    deletePromptTemplate: (index) => {
      const next = get().promptTemplates.filter((_, i) => i !== index);
      set({ promptTemplates: next });
      try { localStorage.setItem(STORAGE_KEYS.PROMPT_TEMPLATES, JSON.stringify(next)); } catch { /* ignore */ }
    },

    applyTemplate: (tpl) => {
      set({ prompt: tpl.prompt, negativePrompt: tpl.negative || "" });
    },

    restoreFromHistory: (entry) => {
      const { modelList } = get();
      set({
        prompt: entry.prompt,
        negativePrompt: entry.negativePrompt || "",
        batchSize: entry.batchSize,
        ...(entry.model && modelList.includes(entry.model) ? { model: entry.model } : {}),
        ...(entry.width ? { width: entry.width } : {}),
        ...(entry.height ? { height: entry.height } : {}),
      });
    },
  };
});
