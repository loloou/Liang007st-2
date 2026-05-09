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
import { generateImages, type GeneratedImage } from "../api/imageClient";
import { getApiConfig, resolveApiSpec } from "../api/settings";
import {
  getResolution,
  loadImageDimensions,
  type ResolutionPresetId,
  type SizeTierId,
} from "../utils/resolutionPresets";
import { downloadImage, downloadImages } from "../utils/download";
import { createThumbnail } from "../utils/imageUtils";
import { putImage, clearOldImages } from "../utils/indexedDB";

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
  handleGenerate: () => Promise<void>;

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
    width: 2048,
    height: 2048,
    resolutionPreset: "original",
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

    // ── 核心生图 ──────────────────────────────────────────────────────────────
    handleGenerate: async () => {
      const state = get();
      const { prompt, negativePrompt, model, batchSize, resolutionPreset, sizeTier, referenceSize } = state;

      if (!prompt.trim()) {
        set({ error: "请输入提示词再开始生成。" });
        return;
      }
      if (!model.trim()) {
        set({ error: "请先在「设置 → Image」中添加模型，然后在右侧「已选模型」中勾选后再生图。" });
        return;
      }

      const cfg = getApiConfig();
      if (!cfg.globalBaseUrl.trim() && cfg.imageModels.every((m) => !m.baseUrl?.trim())) {
        set({ error: "请先在「设置 → Global Config」中填写 Base URL 后再生图。" });
        return;
      }

      // 确定最终宽高（从预设重算，保证与 UI 一致）
      const { width: finalWidth, height: finalHeight } = getResolution(resolutionPreset, sizeTier, referenceSize);

      // 确定 spec（用于错误信息上下文）
      const activeM = cfg.imageModels.find((m) => m.modelId === model);
      const genSpec = activeM ? resolveApiSpec(activeM, cfg) : (cfg.globalApiSpec ?? "openai");

      // 启动计时器
      set({ status: "running", error: null, elapsedSeconds: 0, lastDuration: null, progressPct: 20 });
      const timer = setInterval(() => {
        const current = get();
        // 超时检测：5分钟自动标记失败
        if (current.elapsedSeconds >= 300) {
          const message = `请求超时（已等待 5 分钟）\n\n📐 本次生图参数：\n· 规范：${genSpec === "gemini" ? "Gemini 原生" : "OpenAI 兼容"}\n· 模型：${model || "未指定"}\n· 分辨率：${sizeTier} · ${resolutionPreset} · ${finalWidth}×${finalHeight}\n· 数量：${batchSize} 张\n· 提示词：${prompt.length > 80 ? prompt.slice(0, 80) + "…" : prompt}`;
          set({ error: message });
          const failedHistory = get().generationHistory.map((entry) =>
            entry.id === generatingId ? { ...entry, results: [], error: message } : entry
          );
          set({ generationHistory: failedHistory });
          safeSaveHistory(failedHistory);
          clearInterval(timer);
          set({ _elapsedTimerRef: null, progressPct: 100, status: "idle" });
          return;
        }
        set((s) => ({ elapsedSeconds: s.elapsedSeconds + 1 }));
      }, 1000);
      set({ _elapsedTimerRef: timer });

      // 创建"进行中"历史条目
      const generatingId = Date.now().toString();
      const genStartTime = Date.now();
      const genTimestamp = new Date().toLocaleString("zh-CN");
      const pendingEntry: HistoryEntry = {
        id: generatingId,
        time: genTimestamp,
        prompt,
        negativePrompt: negativePrompt || undefined,
        model,
        width: finalWidth,
        height: finalHeight,
        batchSize,
        results: [],
      };
      const historyWithPending = [pendingEntry, ...state.generationHistory].slice(0, MAX_HISTORY);
      set({ generationHistory: historyWithPending });
      safeSaveHistory(historyWithPending);

      try {
        set({ progressPct: 60 });
      const referenceImages = state.referenceSlots.filter((f): f is File => f != null);
      let result = await generateImages({
        prompt,
        negativePrompt: negativePrompt || undefined,
        batchSize,
        width: finalWidth,
        height: finalHeight,
        model,
        referenceImages,
        resolutionPreset,
        sizeTier,
      });

      // 智能降级：模型不支持参考图时，去掉参考图重试
      if (result.error && referenceImages.length > 0) {
        const errMsg = result.error.toLowerCase();
        const isImageUnsupported =
          errMsg.includes("does not support image input") ||
          errMsg.includes("does not support image") ||
          errMsg.includes("image input is not supported") ||
          errMsg.includes("vision") && errMsg.includes("not support") ||
          errMsg.includes("multimodal") && errMsg.includes("not support") ||
          (errMsg.includes("cannot read") && errMsg.includes("image")) ||
          (errMsg.includes("invalid") && errMsg.includes("image_url")) ||
          (errMsg.includes("unsupported") && errMsg.includes("image"));
        if (isImageUnsupported) {
          result = await generateImages({
            prompt,
            negativePrompt: negativePrompt || undefined,
            batchSize,
            width: finalWidth,
            height: finalHeight,
            model,
            referenceImages: [],
            resolutionPreset,
            sizeTier,
          });
          if (!result.error) {
            // 降级成功，提示用户
            const warnMsg = "⚠️ 当前模型不支持参考图输入，已自动切换为纯文生图模式。生成结果不含参考图。";
            set({ error: warnMsg });
            setTimeout(() => {
              if (get().error === warnMsg) set({ error: null });
            }, 8000);
          }
        }
      }

      // 检查 generateImages 是否返回了错误（不再通过 throw 传递）
      if (result.error) {
        const rawMsg = result.error;
        const promptSnippet = prompt.length > 80 ? prompt.slice(0, 80) + "…" : prompt;
        const message =
          `${rawMsg}\n\n📐 本次生图参数：\n` +
          `· 规范：${genSpec === "gemini" ? "Gemini 原生" : "OpenAI 兼容"}\n` +
          `· 模型：${model || "未指定"}\n` +
          `· 分辨率：${sizeTier} · ${resolutionPreset} · ${finalWidth}×${finalHeight}\n` +
          `· 数量：${batchSize} 张\n` +
          `· 提示词：${promptSnippet}`;
        set({ error: message });
        const failedHistory = get().generationHistory.map((entry) =>
          entry.id === generatingId ? { ...entry, results: [], error: message } : entry
        );
        set({ generationHistory: failedHistory });
        safeSaveHistory(failedHistory);
        clearInterval(timer);
        set({ _elapsedTimerRef: null, progressPct: 100, status: "idle" });
        setTimeout(() => set({ progressPct: 0 }), 800);
        if (prompt.trim()) {
          const prev2 = get().promptHistory;
          const next2 = [prompt.trim(), ...prev2.filter((p) => p !== prompt.trim())].slice(0, MAX_PROMPT_HISTORY);
          set({ promptHistory: next2 });
          try { localStorage.setItem(STORAGE_KEYS.PROMPT_HISTORY, JSON.stringify(next2)); } catch { /* ignore */ }
        }
        return;
      }

      const images = result.images;
        set({ results: images, resultActiveIdx: 0 });

        // 比例校验（仅外部 URL 图片）
        if (images.length > 0 && images[0].url && !images[0].url.startsWith("data:")) {
          const checkImg = new Image();
          checkImg.onload = () => {
            const { naturalWidth: aw, naturalHeight: ah } = checkImg;
            if (aw > 0 && ah > 0) {
              // 分辨率尺寸校验：实际尺寸远小于请求尺寸时警告
              const requestedMin = Math.min(finalWidth, finalHeight);
              const actualMin = Math.min(aw, ah);
              if (actualMin < requestedMin * 0.6) {
                const warnMsg = `⚠️ 分辨率降级：请求 ${sizeTier}（${finalWidth}×${finalHeight}），实际返回 ${aw}×${ah}。当前 API 或模型可能不支持所选分辨率，已自动降至 API 支持的最大尺寸。`;
                set({ error: warnMsg });
                setTimeout(() => {
                  if (get().error === warnMsg) set({ error: null });
                }, 12000);
              }

              // 比例校验
              const diff = Math.abs(aw / ah - finalWidth / finalHeight) / (finalWidth / finalHeight);
              if (diff > 0.05) {
                const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
                const g1 = gcd(aw, ah), g2 = gcd(finalWidth, finalHeight);
                set({
                  ratioMismatchDialog: {
                    actualRatio: `${aw / g1}:${ah / g1}`,
                    expectedRatio: `${finalWidth / g2}:${finalHeight / g2}`,
                    onConfirm: () => {
                      set({ ratioMismatchDialog: null });
                      setTimeout(() => get().handleGenerate(), 100);
                    },
                  },
                });
              }
            }
          };
          checkImg.src = images[0].url;
        }

        // 生成缩略图后写历史
        const imagesWithThumbs = await Promise.all(
          images.map(async (img) => {
            if (!img?.url) return img;
            if (!img.url.startsWith("data:") && !img.url.startsWith("blob:")) return img;
            try {
              const thumb = await createThumbnail(img.url, 150);
              return { ...img, url: thumb, originalUrl: img.url };
            } catch {
              return { ...img, url: "", originalUrl: img.url };
            }
          })
        );
        const validImages = imagesWithThumbs.filter((img) => img?.url);

        // 存储原图到 IndexedDB（不受 localStorage 5MB 限制）
        try {
          await Promise.all(images.map(async (img) => {
            if (!img?.url) return;
            await putImage({
              id: img.id,
              url: img.url,
              thumbnail: validImages.find((v) => v.id === img.id)?.url,
              prompt,
              model,
              width: finalWidth,
              height: finalHeight,
              createdAt: Date.now(),
            });
          }));
          // 清理超过 200 张的旧图
          await clearOldImages(200);
        } catch { /* IndexedDB 不可用时静默降级 */ }

        const durationMs = Date.now() - genStartTime;
        const durationSec = Math.round(durationMs / 1000);
        const durationStr =
          durationSec >= 60
            ? `${Math.floor(durationSec / 60)}分${durationSec % 60}秒`
            : `${durationSec}秒`;
        set({ lastDuration: durationStr });

        const updatedHistory = get().generationHistory.map((entry) =>
          entry.id === generatingId ? { ...entry, results: validImages, duration: durationStr } : entry
        );
        set({ generationHistory: updatedHistory });
        safeSaveHistory(updatedHistory);

        // 持久化当前结果（仅外部 URL）
        const validForStorage = images.filter(
          (img) => img?.url && !img.url.startsWith("data:") && !img.url.startsWith("blob:")
        );
        if (validForStorage.length > 0) {
          try {
            localStorage.setItem(
              STORAGE_KEYS.CURRENT_GENERATION,
              JSON.stringify({
                id: "current",
                time: new Date().toLocaleString("zh-CN"),
                prompt,
                negativePrompt: negativePrompt || undefined,
                model,
                width: finalWidth,
                height: finalHeight,
                batchSize,
                results: validForStorage,
              })
            );
          } catch { /* 配额超出静默失败 */ }
        }
      } catch (e) {
        // 仅处理 generateImages 之外的其他未预期错误（generateImages 错误已在上面拦截）
        const rawMsg = e instanceof Error ? e.message : String(e);
        const promptSnippet = prompt.length > 80 ? prompt.slice(0, 80) + "…" : prompt;
        const message =
          `${rawMsg}\n\n📐 本次生图参数：\n` +
          `· 规范：${genSpec === "gemini" ? "Gemini 原生" : "OpenAI 兼容"}\n` +
          `· 模型：${model || "未指定"}\n` +
          `· 分辨率：${sizeTier} · ${resolutionPreset} · ${finalWidth}×${finalHeight}\n` +
          `· 数量：${batchSize} 张\n` +
          `· 提示词：${promptSnippet}`;
        set({ error: message });

        const failedHistory = get().generationHistory.map((entry) =>
          entry.id === generatingId ? { ...entry, results: [], error: message } : entry
        );
        set({ generationHistory: failedHistory });
        safeSaveHistory(failedHistory);
      } finally {
        clearInterval(timer);
        set({ _elapsedTimerRef: null, progressPct: 100, status: "idle" });
        setTimeout(() => set({ progressPct: 0 }), 800);
      }

      // 记录提示词历史
      if (prompt.trim()) {
        const prev = get().promptHistory;
        const next = [prompt.trim(), ...prev.filter((p) => p !== prompt.trim())].slice(0, MAX_PROMPT_HISTORY);
        set({ promptHistory: next });
        try { localStorage.setItem(STORAGE_KEYS.PROMPT_HISTORY, JSON.stringify(next)); } catch { /* ignore */ }
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
      });
    },
  };
});
