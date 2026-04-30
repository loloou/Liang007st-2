import { useState, useEffect, useRef } from "react";
import { useUiStore } from "./store/uiStore";
import { useGenerationStore, STORAGE_KEYS } from "./store/generationStore";
import { generateImages, GeneratedImage } from "./api/imageClient";
import { downloadImage, downloadImages } from "./utils/download";
import PromptOptimizerDialog from "./components/PromptOptimizerDialog";
import AboutDialog from "./components/Dialogs/AboutDialog";
import DetailedLogDialog from "./components/Dialogs/DetailedLogDialog";
import RatioMismatchDialog from "./components/Dialogs/RatioMismatchDialog";
import BalancePopup from "./components/BalancePopup";
import PerformanceMonitor from "./components/PerformanceMonitor";
import ImagePreviewModal from "./components/ImagePreviewModal";
import HistoryFullPreview from "./components/HistoryFullPreview";
import {
  getApiSettings,
  setApiSettings,
  getApiConfig,
  saveApiConfig,
  resolveApiSpec,
  addApiVendor,
  removeApiVendor,
  switchApiVendor,
  updateApiVendor,
  setDefaultApiVendor,
  type ApiConfig,
  type ApiSpec,
  type ChatModel,
  type ImageModel
} from "./api/settings";
import { testChatModel, testImageModel, fetchModelList } from "./api/modelConfig";
import {
  RESOLUTION_PRESETS,
  SIZE_TIERS,
  getResolution,
  loadImageDimensions,
  type ResolutionPresetId,
  type SizeTierId
} from "./utils/resolutionPresets";
import {
  groupModelsByCategory,
  filterGroupsBySearch,
  filterGroupsByTags,
  getModelDisplayInfo,
  getModelPrice,
  MODEL_CATEGORY_TAGS,
  MODEL_VENDOR_TAGS
} from "./utils/modelCategories";
import { fetchBalance } from "./api/balance";
import { THEMES, getTheme, setTheme, getThemeConfig, type ThemeMode } from "./utils/theme";
import { createThumbnail } from "./utils/imageUtils";
import AspectRatioSelect from "./components/AspectRatioSelect";
import { getRealPerformanceData, FPSCalculator } from "./utils/performanceMonitor";

type GenerationStatus = "idle" | "running";

const DEFAULT_SIZE_TIER: SizeTierId = "2K";
const RIGHT_PANEL_MIN = 280;
const RIGHT_PANEL_MAX = 640;
const RIGHT_PANEL_DEFAULT = 340;

function getInitialModelAndList() {
  const s = getApiSettings();
  // 只使用用户手动配置的模型，不再 fallback 到硬编码模型列表
  const list = s.selectedModelIds?.length ? s.selectedModelIds : [];
  const model = list[0] || "";
  return { model, list: list as string[] };
}

function App() {
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [batchSize, setBatchSize] = useState(1);
  const [width, setWidth] = useState(768);
  const [height, setHeight] = useState(768);
  const [resolutionPreset, setResolutionPreset] = useState<ResolutionPresetId>("original");
  const [sizeTier, setSizeTier] = useState<SizeTierId>(DEFAULT_SIZE_TIER);
  const [referenceSlots, setReferenceSlots] = useState<(File | null)[]>(() => [null, null, null, null]);
  const [referencePreviewUrls, setReferencePreviewUrls] = useState<(string | null)[]>(() => [null, null, null, null]);
  const [referenceSize, setReferenceSize] = useState<{ width: number; height: number } | null>(null);
  const [model, setModel] = useState(() => getInitialModelAndList().model);
  const [modelList, setModelList] = useState<string[]>(() => getInitialModelAndList().list);
  const [results, setResults] = useState<GeneratedImage[]>([]);
  const [status, setStatus] = useState<GenerationStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const elapsedSeconds = useGenerationStore((s) => s.elapsedSeconds);
  const storeStatus = useGenerationStore((s) => s.status);
  const [selectedImageIds, setSelectedImageIds] = useState<Set<string>>(new Set());
  const [previewImage, setPreviewImage] = useState<GeneratedImage | null>(null);
  const [downloadStatus, setDownloadStatus] = useState<"idle" | "downloading">("idle");
  const [settingsOpen, setSettingsOpen] = useState(false);
  // 设置弹窗 - 标签页
  const [settingsTab, setSettingsTab] = useState<"image" | "chat">("image");
  // 设置弹窗 - 配置草稿（打开弹窗时从 localStorage 拷贝，保存时写回）
  const [cfgDraft, setCfgDraft] = useState<ApiConfig>(() => getApiConfig());
  // 各模型测试状态 { [modelInternalId]: "idle"|"testing"|"ok"|"fail" }
  const [modelTestStatus, setModelTestStatus] = useState<Record<string, "idle"|"testing"|"ok"|"fail">>({});
  const [modelTestMsg, setModelTestMsg]     = useState<Record<string, string>>({});
  // 全局 BaseUrl 同步提示
  const [syncToast, setSyncToast] = useState(false);
  // 获取模型列表状态（用于 Image tab 的「获取模型」按钮）
  const [settingsModelsFetching, setSettingsModelsFetching] = useState(false);
  const [settingsModelsFetchErr, setSettingsModelsFetchErr] = useState("");
  // 模型选择弹窗（获取模型列表后弹出，供多选后同步到 imageModels / chatModels）
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [modelPickerMode, setModelPickerMode] = useState<"image" | "chat">("image");
  const [modelPickerList, setModelPickerList] = useState<string[]>([]);
  const [modelPickerSelected, setModelPickerSelected] = useState<Set<string>>(new Set());
  const [modelPickerSearch, setModelPickerSearch] = useState("");
  const [modelPickerCategoryTag, setModelPickerCategoryTag] = useState<string | null>(null);
  const [modelPickerVendorTag, setModelPickerVendorTag] = useState<string | null>(null);
  // legacy — kept for model-select modal compatibility
  const [settingsForm, setSettingsForm] = useState(() => {
    const s = getApiSettings();
    const active = s.channels?.find((c) => c.id === s.activeChannelId) ?? s.channels?.[0];
    return {
      activeChannelId: s.activeChannelId || active?.id || "",
      channelName: active?.name ?? "默认渠道",
      baseUrl: active?.baseUrl ?? s.baseUrl ?? "",
      apiKey: active?.apiKey ?? s.apiKey ?? "",
      selectedModelIds: s.selectedModelIds ?? [],
      modelList: s.modelList ?? [],
      apiValidateJson: s.apiValidateJson ?? true
    };
  });
  const [apiCheckStatus, setApiCheckStatus] = useState<"idle" | "checking" | "ok" | "fail">("idle");
  const [apiCheckMessage, setApiCheckMessage] = useState("");
  const [testApiStatus, setTestApiStatus] = useState<"idle" | "testing" | "ok" | "fail">("idle");
  const [testApiMessage, setTestApiMessage] = useState("");
  const [modelsFetchStatus, setModelsFetchStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [modelsFetchError, setModelsFetchError] = useState("");
  const [modelSelectOpen, setModelSelectOpen] = useState(false);
  const [fetchedModelList, setFetchedModelList] = useState<string[]>([]);
  const [selectedModelIdsInModal, setSelectedModelIdsInModal] = useState<string[]>([]);
  const [modelSearchQuery, setModelSearchQuery] = useState("");
  const [rightPanelWidth, setRightPanelWidth] = useState(RIGHT_PANEL_DEFAULT);
  const [isDragging, setIsDragging] = useState(false);
  const [promptHistory, setPromptHistory] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.PROMPT_HISTORY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [filterCategoryTag, setFilterCategoryTag] = useState<string | null>(null);
  const [filterVendorTag, setFilterVendorTag] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<"union" | "intersect">("union");
  const [selectedModelManageOpen, setSelectedModelManageOpen] = useState(false);
  // 选择模型弹窗可拖拽缩放尺寸
  const [modelModalSize, setModelModalSize] = useState({ w: 880, h: 620 });
  const modelModalResizing = useRef(false);
  const modelModalResizeStart = useRef({ mouseX: 0, mouseY: 0, w: 880, h: 620 });
  const [logEntries, setLogEntries] = useState<{
    time: string;
    request?: string;
    response?: string;
    error?: string;
    /** 完整请求 endpoint */
    endpoint?: string;
    /** 接口规范 */
    spec?: string;
    /** 完整请求体 JSON */
    requestBody?: string;
    /** 响应体摘要 */
    responseBody?: string;
    /** HTTP 状态码 */
    httpStatus?: number;
    /** 响应是否为有效 JSON */
    jsonValid?: boolean;
    /** HTTP 错误响应体 */
    httpErrorBody?: string;
  }[]>([]);
  const [balanceStatus, setBalanceStatus] = useState<"idle" | "loading" | "ok" | "fail">("idle");
  const [balanceMessage, setBalanceMessage] = useState("");
  const [showAbout, setShowAbout] = useState(false);
  const [theme, setThemeState] = useState<ThemeMode>(() => getTheme());
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const [performanceMonitorOpen, setPerformanceMonitorOpen] = useState(false);
  const themeBtnRef = useRef<HTMLButtonElement>(null);
  const perfBtnRef = useRef<HTMLButtonElement>(null);
  const balanceBtnRef = useRef<HTMLButtonElement>(null);
  const [historyPanelOpen, setHistoryPanelOpen] = useState(false);
  const [balancePopupOpen, setBalancePopupOpen] = useState(false);


  const [generationHistory, setGenerationHistory] = useState<{
    id: string;
    time: string;
    prompt: string;
    negativePrompt?: string;
    model: string;
    width: number;
    height: number;
    batchSize: number;
    results: GeneratedImage[];
    error?: string; // 失败时的错误信息
    createdAt?: number; // 创建时间戳，用于清理超时条目
  }[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.GENERATION_HISTORY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const themeConfig = getThemeConfig(theme);

  // ── 清理超时的"生图中..."条目（超过5分钟自动标记为失败）──────────────
  useEffect(() => {
    const now = Date.now();
    const TIMEOUT = 5 * 60 * 1000; // 5分钟超时
    const hasStuck = generationHistory.some(
      entry => entry.results.length === 0 && !entry.error && entry.createdAt && (now - entry.createdAt > TIMEOUT)
    );
    if (hasStuck) {
      setGenerationHistory(prev => prev.map(entry => {
        if (entry.results.length === 0 && !entry.error && entry.createdAt && (now - entry.createdAt > TIMEOUT)) {
          return { ...entry, error: "生成超时（超过5分钟）" };
        }
        return entry;
      }));
    }
  }, [generationHistory]);

  // ── localStorage 配额管理：清理旧数据 ─────────────────────────────────────
  useEffect(() => {
    try {
      // 清理历史记录，只保留最近 50 条（与 promptHistory effect 保持一致，避免双写冲突）
      const promptHistory = JSON.parse(localStorage.getItem(STORAGE_KEYS.PROMPT_HISTORY) || "[]");
      if (promptHistory.length > 50) {
        localStorage.setItem(STORAGE_KEYS.PROMPT_HISTORY, JSON.stringify(promptHistory.slice(0, 50)));
      }
    } catch (error) {
      console.error("清理 localStorage 数据失败:", error);
    }
  }, []);

  // ── 优化：history debounced 持久化（避免频繁 JSON.stringify 阻塞主线程）───
  const historySaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 比例不匹配弹窗防重入标记：用户点"重新生成"后，下一次结果不再触发弹窗
  const ratioMismatchRetried = useRef(false);
  // 存储最新的 handleGenerate 函数引用，避免闭包陷阱
  const handleGenerateRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const saveHistory = (history: typeof generationHistory) => {
    if (historySaveTimer.current) clearTimeout(historySaveTimer.current);
    historySaveTimer.current = setTimeout(() => {
      try { localStorage.setItem(STORAGE_KEYS.GENERATION_HISTORY, JSON.stringify(history)); } catch { /* 配额超出静默 */ }
    }, 500);
  };

  // ── 优化2：历史全屏预览 & 批量删除 ────────────────────────────────────────
  const [historyFullPreview, setHistoryFullPreview] = useState<GeneratedImage | null>(null);
  const [historyBatchMode, setHistoryBatchMode] = useState(false);
  const [historySelected, setHistorySelected] = useState<Set<string>>(new Set());
  const [historyLayout, setHistoryLayout] = useState<"list" | "grid">("list");

  // ── 优化3：尺寸比例不一致弹窗 ─────────────────────────────────────────────
  const [ratioMismatchDialog, setRatioMismatchDialog] = useState<{
    actualRatio: string;
    expectedRatio: string;
    onConfirm: () => void;
  } | null>(null);

  // ── 优化4：供应商管理弹窗 ─────────────────────────────────────────────────
  const [vendorDialogOpen, setVendorDialogOpen] = useState(false);
  const [vendorNameInput, setVendorNameInput] = useState("");
  const [vendorUrlInput, setVendorUrlInput] = useState("");
  const [vendorApiKeyInput, setVendorApiKeyInput] = useState("");
  const [vendorRemarkInput, setVendorRemarkInput] = useState("");
  const [vendorDeleteConfirm, setVendorDeleteConfirm] = useState<string | null>(null);
  // 编辑模式：存放正在编辑的供应商 id（null = 新增模式）
  const [vendorEditingId, setVendorEditingId] = useState<string | null>(null);
  // Global Config 快速保存供应商
  const [globalSaveVendorRemark, setGlobalSaveVendorRemark] = useState("");
  const [globalSaveVendorName, setGlobalSaveVendorName] = useState("");
  const [globalSaveVendorToast, setGlobalSaveVendorToast] = useState(false);
  // 供应商名称下拉
  const [vendorDropdownOpen, setVendorDropdownOpen] = useState(false);

  // ── 优化5：主界面模型管理弹窗（重新设计） ─────────────────────────────────
  const [mainModelPickerOpen, setMainModelPickerOpen] = useState(false);
  const [mainModelPickerSelected, setMainModelPickerSelected] = useState<Set<string>>(new Set());

  // ── 优化1：生成结果区当前预览图索引 ──────────────────────────────────────
  const [resultActiveIdx, setResultActiveIdx] = useState(0);

  const referenceImages = referenceSlots.filter((f): f is File => f != null);

  // 参考图预览 URL 与回收
  useEffect(() => {
    const urls: (string | null)[] = referenceSlots.map((f) => (f ? URL.createObjectURL(f) : null));
    setReferencePreviewUrls(urls);
    return () => {
      urls.forEach((u) => u && URL.revokeObjectURL(u));
    };
  }, [referenceSlots]);

  // 参考图尺寸：以第一张为主（用于原比例）
  useEffect(() => {
    const first = referenceSlots.find(Boolean) as File | undefined;
    if (!first) {
      setReferenceSize(null);
      return;
    }
    let cancelled = false;
    loadImageDimensions(first)
      .then((size) => {
        if (!cancelled) setReferenceSize(size);
      })
      .catch(() => {
        if (!cancelled) setReferenceSize(null);
      });
    return () => {
      cancelled = true;
    };
  }, [referenceSlots]);

  // 根据预设与尺寸档位同步宽高（国家标准 1K/2K/4K）
  useEffect(() => {
    const { width: w, height: h } = getResolution(resolutionPreset, sizeTier, referenceSize);
    setWidth(w);
    setHeight(h);
  }, [resolutionPreset, sizeTier, referenceSize]);

  const setReferenceSlot = (index: number, file: File | null) => {
    setReferenceSlots((prev) => {
      const next = [...prev];
      next[index] = file;
      return next;
    });
  };

  const handleReferenceSlotDrop = (index: number, e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f?.type.startsWith("image/")) setReferenceSlot(index, f);
  };

  // 提示词记录持久化
  useEffect(() => {
    if (promptHistory.length) {
      localStorage.setItem(STORAGE_KEYS.PROMPT_HISTORY, JSON.stringify(promptHistory.slice(0, 50)));
    }
  }, [promptHistory]);

  // 当前生成结果持久化（关闭页面后可在历史中找到）
  useEffect(() => {
    if (results.length > 0) {
      try {
        // 只保存元数据和外部 URL 图片，过滤掉 base64 和 blob URL 避免超出 localStorage 配额
        const validResults = results.filter(img => {
          if (!img || !img.url) return false;
          // 跳过 base64 和 blob URL，只保存外部 URL
          if (img.url.startsWith('data:') || img.url.startsWith('blob:')) return false;
          return true;
        });

        // 只有当有有效的外部 URL 图片时才保存
        if (validResults.length > 0) {
          const currentSession = {
            id: "current",
            time: new Date().toLocaleString("zh-CN"),
            prompt,
            negativePrompt: negativePrompt || undefined,
            model,
            width,
            height,
            batchSize,
            results: validResults
          };
          localStorage.setItem(STORAGE_KEYS.CURRENT_GENERATION, JSON.stringify(currentSession));
        }
      } catch (error) {
        console.error('保存当前生成结果失败:', error);
        // 配额超出时静默失败，不影响应用使用
      }
    } else {
      localStorage.removeItem(STORAGE_KEYS.CURRENT_GENERATION);
    }
  }, [results, prompt, negativePrompt, model, width, height, batchSize]);

  // 页面加载时恢复上次的结果
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.CURRENT_GENERATION);
      if (saved) {
        const currentSession = JSON.parse(saved);
        if (currentSession.results && currentSession.results.length > 0) {
          // 验证图片数据完整性，过滤掉失效的 blob: URL 和 base64 URL
          const validResults = currentSession.results.filter((img: GeneratedImage) => {
            if (!img || !img.url) return false;
            // blob: 和 data: URL 可能已失效，跳过
            if (img.url.startsWith('blob:') || img.url.startsWith('data:')) return false;
            return true;
          });
          if (validResults.length > 0) {
            setResults(validResults);
            setPrompt(currentSession.prompt || "");
            setNegativePrompt(currentSession.negativePrompt || "");
            setModel(currentSession.model || "");
            setBatchSize(currentSession.batchSize || 1);
            setResultActiveIdx(0);
          }
        }
      }
    } catch (err) {
      console.error("恢复上次结果失败:", err);
      // 忽略解析错误或配额错误，继续正常运行
      localStorage.removeItem(STORAGE_KEYS.CURRENT_GENERATION);
    }
  }, []);

  // 左右拖动调节宽度
  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => {
      const newWidth = window.innerWidth - e.clientX;
      setRightPanelWidth((w) => Math.min(RIGHT_PANEL_MAX, Math.max(RIGHT_PANEL_MIN, newWidth)));
    };
    const onUp = () => setIsDragging(false);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isDragging]);

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      const time = new Date().toLocaleTimeString("zh-CN");
      setLogEntries((prev) => [...prev.slice(-99), { time, error: "请输入提示词再开始生成。" }]);
      return;
    }
    // 检查是否已选模型
    if (!model.trim()) {
      const time = new Date().toLocaleTimeString("zh-CN");
      setLogEntries((prev) => [...prev.slice(-99), { time, error: "请先在「设置 → Image」中添加模型，然后在右侧「已选模型」中勾选后再生图。" }]);
      setError("未选择模型：请点击右侧「点击选择模型」，在设置中添加并勾选 Image 模型。");
      return;
    }
    // 检查是否已配置 Base URL
    const cfg = getApiConfig();
    if (!cfg.globalBaseUrl.trim() && cfg.imageModels.every((m) => !m.baseUrl?.trim())) {
      const time = new Date().toLocaleTimeString("zh-CN");
      setLogEntries((prev) => [...prev.slice(-99), { time, error: "请先在「设置 → Global Config」中填写 Base URL 后再生图。" }]);
      return;
    }
    setError(null);
    setStatus("running");
    // 每次新的生成开始，重置比例重试标记
    const isRatioRetry = ratioMismatchRetried.current;
    ratioMismatchRetried.current = false;

    // ── 优化3：校验并修正尺寸参数 ──────────────────────────────────────────
    const { width: expectedW, height: expectedH } = getResolution(resolutionPreset, sizeTier, referenceSize);
    // 自动修正请求时的 width/height，确保与界面设置一致
    const finalWidth = expectedW;
    const finalHeight = expectedH;

    const reqInfo = {
      prompt: prompt,
      negativePrompt: negativePrompt || "",
      model,
      batchSize,
      width: finalWidth,
      height: finalHeight
    };
    const time = new Date().toLocaleTimeString("zh-CN");
    setLogEntries((prev) => [...prev.slice(-99), { time, request: JSON.stringify(reqInfo, null, 2) }]);
    
    // 创建"进行中"的历史条目
    const generatingId = Date.now().toString();
    setGenerationHistory((prev) => {
      const generatingEntry = {
        id: generatingId,
        time: new Date().toLocaleString("zh-CN"),
        prompt,
        negativePrompt: negativePrompt || undefined,
        model,
        width: finalWidth,
        height: finalHeight,
        batchSize,
        results: [], // 空结果，表示进行中
        createdAt: Date.now(), // 记录创建时间，用于超时检测
      };
      const updated = [generatingEntry, ...prev].slice(0, 50);
      saveHistory(updated);
      return updated;
    });

    const result = await generateImages({
      prompt,
      negativePrompt: negativePrompt || undefined,
      batchSize,
      width: finalWidth,
      height: finalHeight,
      model,
      referenceImages,
      resolutionPreset,
      sizeTier
    });

    // 失败时：把完整上下文写入 logEntries（endpoint + requestBody 都能拿到）
    if (result.error) {
      const message = result.error;
      setLogEntries((prev) => {
        const last = prev[prev.length - 1];
        return prev.slice(0, -1).concat([{
          ...last,
          error: message,
          endpoint: result.endpoint,
          requestBody: result.requestBodyJson,
          httpStatus: result.httpStatus,
          httpErrorBody: result.httpErrorBody,
        }]);
      });
      setGenerationHistory((prev) => {
        try {
          const updated = prev.map(entry => {
            if (entry.id === generatingId) {
              return { ...entry, results: [], error: message };
            }
            return entry;
          });
          saveHistory(updated);
          return updated;
        } catch {
          return prev;
        }
      });
      setStatus("idle");
      if (prompt.trim()) {
        setPromptHistory((prev) => [prompt.trim(), ...prev.filter((p) => p !== prompt.trim())].slice(0, 50));
      }
      return;
    }

    const images = result.images;
      setResults(images);
      setResultActiveIdx(0);

      // ── 优化3：校验返回图片比例 ─────────────────────────────────────────
      if (images.length > 0) {
        const firstUrl = images[0].url;
        if (firstUrl && !firstUrl.startsWith("data:")) {
          // 通过创建Image对象检测实际尺寸（仅对 URL 类型图片）
          const img = new Image();
          img.onload = () => {
            const actualW = img.naturalWidth;
            const actualH = img.naturalHeight;
            if (actualW > 0 && actualH > 0) {
              const actualRatioVal = actualW / actualH;
              const expectedRatioVal = finalWidth / finalHeight;
              const diff = Math.abs(actualRatioVal - expectedRatioVal) / expectedRatioVal;
              if (diff > 0.05) {
                // 比例误差超过5%则提示；若已经是"重试后"的结果则不再弹窗（防循环）
                if (isRatioRetry) return;
                const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
                const g1 = gcd(actualW, actualH);
                const g2 = gcd(finalWidth, finalHeight);
                const actualRatioStr = `${actualW / g1}:${actualH / g1}`;
                const expectedRatioStr = `${finalWidth / g2}:${finalHeight / g2}`;
                setRatioMismatchDialog({
                  actualRatio: actualRatioStr,
                  expectedRatio: expectedRatioStr,
                  onConfirm: () => {
                    setRatioMismatchDialog(null);
                    // 标记这次是比例重试，避免再次弹窗
                    ratioMismatchRetried.current = true;
                    // 重新生成（使用 ref 避免闭包陷阱）
                    setTimeout(() => handleGenerateRef.current(), 100);
                  }
                });
              }
            }
          };
          img.src = firstUrl;
        }
      }

      // 保存到历史记录
      // 为每张图片创建缩略图（限制尺寸以避免 localStorage 配额超出、避免大图卡顿）
      // base64 / blob / 外部 URL 统一处理，全部生成 150px JPEG 缩略图
      const imagesWithThumbnails = await Promise.all(images.map(async (img) => {
        if (!img || !img.url) return img;

        // 已经是 base64 小图无需再处理
        if (img.url.startsWith('data:image/jpeg;base64,') && img.url.length < 2000) {
          return img;
        }

        try {
          const thumbnail = await createThumbnail(img.url, 150);
          return { ...img, url: thumbnail, originalUrl: img.url };
        } catch (error) {
          console.error('生成缩略图失败:', error);
          return { ...img, url: img.url, originalUrl: img.url }; // 失败时降级用原图
        }
      }));

      // 过滤掉完全无效的图片
      const validImages = imagesWithThumbnails.filter(img => img && img.url);

      // 更新"进行中"的历史条目，而不是创建新条目
      setGenerationHistory((prev) => {
        try {
          const updated = prev.map(entry => {
            if (entry.id === generatingId) {
              // 更新正在生成的条目
              return {
                ...entry,
                results: validImages
              };
            }
            return entry;
          });
          saveHistory(updated);
          return updated;
        } catch (error) {
          console.error('保存历史记录失败（可能超出配额）:', error);
          return prev; // 返回原状态，不影响应用使用
        }
      });
      setLogEntries((prev) => {
        const last = prev[prev.length - 1];
        return prev.slice(0, -1).concat([{
          ...last,
          response: `成功，返回 ${images.length} 张图`,
          endpoint: result.endpoint,
          spec: result.spec,
          requestBody: result.requestBodyJson,
          responseBody: result.responseSummary,
          httpStatus: result.httpStatus,
          jsonValid: result.jsonValid
        }]);
      });
      setStatus("idle");
    if (prompt.trim()) {
      setPromptHistory((prev) => [prompt.trim(), ...prev.filter((p) => p !== prompt.trim())].slice(0, 50));
    }
  };

  // 保持 handleGenerateRef 始终指向最新的 handleGenerate 函数
  // eslint-disable-next-line react-hooks/use-effect-requires-second-argument
  useEffect(() => { handleGenerateRef.current = handleGenerate; });

  // 切换图片选中状态
  const toggleImageSelection = (id: string) => {
    setSelectedImageIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // 全选/取消全选
  const toggleSelectAll = () => {
    if (selectedImageIds.size === results.length) {
      setSelectedImageIds(new Set());
    } else {
      setSelectedImageIds(new Set(results.map((r) => r.id)));
    }
  };

  // 下载单张图片
  const handleDownloadSingle = async (img: GeneratedImage) => {
    try {
      setDownloadStatus("downloading");
      await downloadImage(img.url, `generated_${img.id}.png`);
    } catch (e) {
      setError(`下载失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setDownloadStatus("idle");
    }
  };

  // 批量下载选中图片
  const handleBatchDownload = async () => {
    const selectedImages = results.filter((r) => selectedImageIds.has(r.id));
    if (selectedImages.length === 0) {
      setError("请先选择要下载的图片");
      return;
    }
    try {
      setDownloadStatus("downloading");
      await downloadImages(selectedImages, "generated");
    } catch (e) {
      setError(`批量下载失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setDownloadStatus("idle");
    }
  };

  // 切换主题
  const handleThemeChange = (newTheme: ThemeMode) => {
    setThemeState(newTheme);
    setTheme(newTheme);
    setThemeMenuOpen(false);
  };

  // 打开性能监控
  const handleOpenPerformanceMonitor = () => {
    setPerformanceMonitorOpen(!performanceMonitorOpen);
  };

  // 选择模型弹窗拖拽缩放
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!modelModalResizing.current) return;
      const { mouseX, mouseY, w, h } = modelModalResizeStart.current;
      const newW = Math.max(520, Math.min(window.innerWidth * 0.95, w + e.clientX - mouseX));
      const newH = Math.max(400, Math.min(window.innerHeight * 0.95, h + e.clientY - mouseY));
      setModelModalSize({ w: newW, h: newH });
    };
    const onUp = () => {
      if (modelModalResizing.current) {
        modelModalResizing.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, []);

  // 性能监控数据
  const [performanceData, setPerformanceData] = useState({
    fps: 60,
    renderTime: 16,
    memory: null as number | null,
    gpuUsage: null as number | null,  // Electron 不直接提供 GPU 使用率
    networkLatency: null as number | null
  });

  // 真正的性能数据更新
  useEffect(() => {
    if (!performanceMonitorOpen) return;

    // FPS 计算器
    const fpsCalculator = new FPSCalculator();
    let currentFps = 60;

    fpsCalculator.start((fps) => {
      currentFps = fps;
      // 获取真正的性能数据
      const realData = getRealPerformanceData();
      setPerformanceData({
        fps: currentFps,
        renderTime: Math.round(1000 / currentFps),
        memory: realData.memory,
        gpuUsage: null,  // Electron 不直接提供 GPU 使用率 API
        networkLatency: null  // 网络延迟需要主动测量
      });
    });

    // 定期更新其他指标
    const interval = setInterval(() => {
      const realData = getRealPerformanceData();
      setPerformanceData(prev => ({
        ...prev,
        memory: realData.memory,
        renderTime: Math.round(1000 / currentFps)
      }));
    }, 5000);

    return () => {
      fpsCalculator.stop();
      clearInterval(interval);
    };
  }, [performanceMonitorOpen]);

  // 提示词模板
  const [promptTemplates, setPromptTemplates] = useState<{ name: string; prompt: string; negative?: string }[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.PROMPT_TEMPLATES);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [templateNameInput, setTemplateNameInput] = useState("");
  const [showTemplateSave, setShowTemplateSave] = useState(false);

  // 提示词模板持久化
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.PROMPT_TEMPLATES, JSON.stringify(promptTemplates));
  }, [promptTemplates]);

  // 历史按钮位置状态（用于拖动）
  // 默认居中，使用固定值避免随机抖动
  const [historyBtnPosition, setHistoryBtnPosition] = useState(() => {
    return Math.round(window.innerHeight / 2);
  });
  const [isDraggingHistory, setIsDraggingHistory] = useState(false);

  // 历史按钮拖动
  useEffect(() => {
    if (!isDraggingHistory) return;
    const onMove = (e: MouseEvent) => {
      const newY = Math.max(80, Math.min(window.innerHeight - 200, e.clientY));
      setHistoryBtnPosition(newY);
    };
    const onUp = () => setIsDraggingHistory(false);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [isDraggingHistory]);

  // 保存模板
  const handleSaveTemplate = () => {
    if (!templateNameInput.trim() || !prompt.trim()) return;
    setPromptTemplates((prev) => [...prev, { name: templateNameInput.trim(), prompt, negative: negativePrompt }]);
    setTemplateNameInput("");
    setShowTemplateSave(false);
  };

  // 删除模板
  const handleDeleteTemplate = (index: number) => {
    setPromptTemplates((prev) => prev.filter((_, i) => i !== index));
  };

  // 删除历史记录
  const handleDeleteHistory = (id: string) => {
    setGenerationHistory((prev) => {
      const filtered = prev.filter((h) => h.id !== id);
      saveHistory(filtered);
      return filtered;
    });
  };

  // 应用模板
  const handleApplyTemplate = (template: { name: string; prompt: string; negative?: string }) => {
    setPrompt(template.prompt);
    setNegativePrompt(template.negative || "");
  };

  // 编辑弹窗状态
  // 编辑模板（改为内联编辑）
  const handleEditTemplate = (index: number) => {
    const template = promptTemplates[index];
    setInlineEditing({
      index,
      name: template.name,
      prompt: template.prompt,
      negative: template.negative || ""
    });
    setInlineEditName(template.name);
    setInlineEditPrompt(template.prompt);
    setInlineEditNegative(template.negative || "");
  };

  // 编辑历史记录（改为内联编辑）
  const handleEditHistory = (id: string) => {
    const history = generationHistory.find((h) => h.id === id);
    if (!history) return;
    setInlineEditing({
      id,
      prompt: history.prompt,
      negative: history.negativePrompt || ""
    });
    setInlineEditPrompt(history.prompt);
    setInlineEditNegative(history.negativePrompt || "");
  };

  // 保存内联编辑
  const handleInlineSaveEdit = () => {
    if (manageDialogType === "template") {
      if (inlineEditing?.index === undefined) return;
      if (!inlineEditName.trim() || !inlineEditPrompt.trim()) {
        alert(inlineEditName.trim() ? "请输入提示词内容" : "请输入模板名称");
        return;
      }
      setPromptTemplates((prev) =>
        prev.map((t, i) =>
          i === inlineEditing!.index
            ? { ...t, name: inlineEditName.trim(), prompt: inlineEditPrompt.trim(), negative: inlineEditNegative.trim() || "" }
            : t
        )
      );
    } else if (manageDialogType === "history" && inlineEditing?.id) {
      setGenerationHistory((prev) =>
        prev.map((h) =>
          h.id === inlineEditing!.id
            ? { ...h, negativePrompt: inlineEditNegative.trim() || "" }
            : h
        )
      );
    }
    setInlineEditing(null);
  };

  // 取消内联编辑
  const handleInlineCancelEdit = () => {
    setInlineEditing(null);
  };

  // 删除内联编辑条目
  const handleInlineDeleteEdit = () => {
    if (manageDialogType === "template" && inlineEditing?.index !== undefined) {
      handleDeleteTemplate(inlineEditing.index);
    } else if (manageDialogType === "history" && inlineEditing?.id) {
      handleDeleteHistory(inlineEditing.id);
    }
    setInlineEditing(null);
  };

  // 管理弹窗尺寸
  const [manageModalSize, setManageModalSize] = useState({ w: 640, h: 520 });
  const manageModalResizing = useRef(false);
  const manageModalResizeStart = useRef({ mouseX: 0, mouseY: 0, w: 640, h: 520 });

  const [isOptimizing, setIsOptimizing] = useState(false);
  // ── 优化5：提示词优化独立弹窗 ─────────────────────────────────────────────
  const [promptOptimizeDialogOpen, setPromptOptimizeDialogOpen] = useState(false);

  // 折叠状态
  const [negPromptOpen, setNegPromptOpen] = useState(true);
  const [refImgOpen, setRefImgOpen] = useState(true);

  // 小屏响应式：窗口宽度 < 1280px 时折叠参考图和反向提示词
  useEffect(() => {
    const checkSize = () => {
      const compact = window.innerWidth < 1280;
      if (compact) {
        setRefImgOpen(false);
        setNegPromptOpen(false);
      } else {
        setRefImgOpen(true);
        setNegPromptOpen(true);
      }
    };
    checkSize();
    window.addEventListener("resize", checkSize);
    return () => window.removeEventListener("resize", checkSize);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 历史+模板合并下拉
  const [historyTemplateValue, setHistoryTemplateValue] = useState("");

  // 反向提示词下拉值（用于重置选择）
  const [negTemplateValue, setNegTemplateValue] = useState("");

  // 历史/模板管理弹窗
  const [manageDialogOpen, setManageDialogOpen] = useState(false);
  const [manageDialogType, setManageDialogType] = useState<"history" | "template">("history");
  // 内联编辑状态（在管理弹窗中直接编辑，不打开新弹窗）
  const [inlineEditing, setInlineEditing] = useState<{ index?: number; id?: string; name?: string; prompt?: string; negative?: string } | null>(null);
  const [inlineEditName, setInlineEditName] = useState("");
  const [inlineEditPrompt, setInlineEditPrompt] = useState("");
  const [inlineEditNegative, setInlineEditNegative] = useState("");

  const handlePromptOptimize = () => {
    if (!prompt.trim()) return;
    // 打开优化弹窗
    setPromptOptimizeDialogOpen(true);
  };

  // 管理弹窗拖动调整尺寸
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!manageModalResizing.current) return;
      const { mouseX, mouseY, w, h } = manageModalResizeStart.current;
      const newW = Math.max(520, Math.min(window.innerWidth * 0.95, w + e.clientX - mouseX));
      const newH = Math.max(400, Math.min(window.innerHeight * 0.95, h + e.clientY - mouseY));
      setManageModalSize({ w: newW, h: newH });
    };
    const onUp = () => {
      manageModalResizing.current = false;
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, []);

  // 编辑弹窗拖动调整尺寸已删除（改为内联编辑）

  return (
    <div className={`min-h-screen flex flex-col bg-gradient-to-br ${themeConfig.bgGradient} ${themeConfig.textColor}`}>
      {/* 顶部工具栏 - 固定悬浮毛玻璃 */}
      <header className="fixed top-0 left-0 right-0 z-30 h-14 flex items-center justify-between px-6 glass-header">
        {/* 左侧：Logo 和功能按钮 */}
        <div className="flex items-center gap-3 text-sm">
          <span className="font-bold text-gradient text-base tracking-tight">Liang007 生图</span>
          <button
              onClick={() => {
                setCfgDraft(getApiConfig());
                setModelTestStatus({});
                setModelTestMsg({});
                setSyncToast(false);
                setSettingsModelsFetching(false);
                setSettingsModelsFetchErr("");
                setSettingsTab("image");
                setSettingsOpen(true);
              }}
              className="px-3 py-1.5 rounded-full glass-button text-slate-700 text-xs btn-hover-lift"
            >
              ⚙ 设置
            </button>
            <button
              ref={balanceBtnRef}
              className="px-3 py-1.5 rounded-full glass-button text-slate-700 text-xs btn-hover-lift disabled:opacity-60"
              disabled={balanceStatus === "loading"}
              onClick={async () => {
                setBalanceStatus("loading"); setBalanceMessage(""); setBalancePopupOpen(false);
                const res = await fetchBalance();
                if (res.ok) { setBalanceStatus("ok"); setBalanceMessage(typeof res.data === "object" ? JSON.stringify(res.data, null, 2) : String(res.data)); }
                else { setBalanceStatus("fail"); setBalanceMessage(res.message); }
                setBalancePopupOpen(true);
              }}
            >
              {balanceStatus === "loading" ? (
                <span className="flex items-center gap-1"><svg className="animate-spin w-3 h-3" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>查询中…</span>
              ) : "💰 查询余额"}
            </button>
            <div className="relative">
              <button
                ref={themeBtnRef}
                className={`px-3 py-1.5 rounded-full text-xs btn-hover-lift transition-all ${
                  themeMenuOpen ? "glass-button ring-2 ring-primary-200/60 text-primary-600" : "glass-button text-slate-700"
                }`}
                onClick={() => setThemeMenuOpen(!themeMenuOpen)}
              >
                🎨 主题
              </button>
            </div>
            <button
              className="px-3 py-1.5 rounded-full bg-gradient-to-r from-green-500 to-emerald-500 text-white text-xs font-medium btn-hover-lift shadow-sm"
              onClick={() => setShowAbout(true)}
            >
              关于
            </button>
          </div>
        {/* 右侧：性能监控 */}
        <button
          ref={perfBtnRef}
          className={`px-3 py-1.5 rounded-full text-white text-xs font-medium btn-hover-lift shadow-sm transition-all ${
            performanceMonitorOpen
              ? "bg-gradient-to-r from-cyan-600 to-blue-600 ring-2 ring-cyan-300/60"
              : "bg-gradient-to-r from-cyan-500 to-blue-500"
          }`}
          onClick={handleOpenPerformanceMonitor}
        >
          📊 性能监控
        </button>
      </header>

      {/* 主题菜单 - fixed 毛玻璃弹窗 */}
      {themeMenuOpen && themeBtnRef.current && (
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setThemeMenuOpen(false)} />
          <div
            className="fixed glass-popup rounded-xl py-2 z-[9999] w-40 popup-enter"
            style={{ left: themeBtnRef.current.getBoundingClientRect().left, top: themeBtnRef.current.getBoundingClientRect().bottom + 6 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-3 pb-1.5 mb-1 border-b border-white/40">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">选择主题风格</span>
            </div>
            {THEMES.map((t) => {
              const isActive = theme === t.id;
              const colorMap: Record<string, string> = {
                light: "bg-gradient-to-r from-blue-400 to-indigo-500",
                darkBlue: "bg-gradient-to-r from-blue-700 to-indigo-800",
                purple: "bg-gradient-to-r from-violet-400 to-purple-600",
                sunset: "bg-gradient-to-r from-orange-400 to-amber-500",
                ocean: "bg-gradient-to-r from-cyan-400 to-sky-600",
                auroraPink: "bg-gradient-to-r from-pink-400 to-rose-500",
                auroraGreen: "bg-gradient-to-r from-emerald-400 to-teal-500",
                forest: "bg-gradient-to-r from-green-500 to-emerald-600",
              };
              const dotColor = colorMap[t.id] || "bg-gradient-to-r from-slate-300 to-slate-400";
              return (
                <button key={t.id}
                  className={`w-full px-3 py-2 text-left text-xs flex items-center gap-2.5 hover:bg-white/50 transition-colors ${isActive ? "bg-white/60" : ""}`}
                  onClick={() => { handleThemeChange(t.id); setThemeMenuOpen(false); }}
                >
                  <span className={`flex-1 ${isActive ? "text-primary-600 font-semibold" : "text-slate-700"}`}>{t.name}</span>
                  {isActive && <svg className="w-3 h-3 text-primary-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* 余额弹窗 */}
      <BalancePopup
        open={balancePopupOpen}
        balanceStatus={balanceStatus}
        balanceMessage={balanceMessage}
        buttonRef={balanceBtnRef}
        onClose={() => setBalancePopupOpen(false)}
      />

      {/* 性能监控面板 */}
      <PerformanceMonitor
        open={performanceMonitorOpen}
        performanceData={performanceData}
        buttonRef={perfBtnRef}
        onClose={() => setPerformanceMonitorOpen(false)}
      />

      {/* ════════════════════════════════════════════════════════
           设置弹窗 — 模型接口配置（Chat / Image / 工具）
      ════════════════════════════════════════════════════════ */}
      {settingsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overlay-dark p-4"
          onClick={() => setSettingsOpen(false)}
        >
          <div
            className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden popup-enter"
            onClick={(e) => e.stopPropagation()}
          >
            {/* ── 标题栏 ── */}
            <div className="flex items-center justify-between px-6 pt-5 pb-0 flex-shrink-0">
              <div>
                <h2 className="text-base font-bold text-slate-800">模型接口配置</h2>
                <p className="text-[11px] text-slate-400 mt-0.5">严格遵循 OpenAI API 格式，仅替换 BASE URL 和 API KEY 即可完成对接</p>
              </div>
              <button className="text-slate-400 hover:text-slate-600 text-xl leading-none p-1 ml-4" onClick={() => setSettingsOpen(false)}>×</button>
            </div>

            {/* ── 全局配置区（单行紧凑布局） ── */}
            <div className="px-6 pt-3 pb-3 border-b border-slate-100 flex-shrink-0 bg-slate-50/60">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary-500 flex-shrink-0" />
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Global Config</span>
                <span className="text-[10px] text-slate-400 ml-1 hidden sm:inline">— 所有模型默认继承</span>
                <button
                  type="button"
                  className="ml-auto px-2.5 py-1 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-600 text-[11px] font-medium hover:bg-indigo-100 transition flex items-center gap-1 flex-shrink-0"
                  onClick={() => { setVendorDialogOpen(true); setVendorDeleteConfirm(null); }}
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                  供应商管理
                  {cfgDraft.apiVendors?.length > 0 && <span className="px-1 bg-indigo-100 rounded text-indigo-500 text-[9px]">{cfgDraft.apiVendors.length}</span>}
                </button>
              </div>

              {/* 单行：供应商名称下拉 | Base URL | API Key | 同步 | 保存 */}
              <div className="flex items-center gap-2">
                {/* 供应商名称 — 可下拉切换 */}
                <div className="relative flex-shrink-0" style={{width: 150}}>
                  <input
                    type="text"
                    className="w-full border border-slate-200 rounded-lg px-2.5 pr-7 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 text-xs"
                    placeholder="供应商名称"
                    value={globalSaveVendorName}
                    onChange={(e) => setGlobalSaveVendorName(e.target.value)}
                    onFocus={() => cfgDraft.apiVendors?.length > 0 && setVendorDropdownOpen(true)}
                    onBlur={() => setTimeout(() => setVendorDropdownOpen(false), 150)}
                  />
                  {/* 下拉箭头 */}
                  {cfgDraft.apiVendors?.length > 0 && (
                    <button
                      type="button"
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-500 transition"
                      onMouseDown={(e) => { e.preventDefault(); setVendorDropdownOpen((v) => !v); }}
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </button>
                  )}
                  {/* 下拉列表 */}
                  {vendorDropdownOpen && cfgDraft.apiVendors?.length > 0 && (
                    <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden min-w-[220px]">
                      <div className="px-2.5 py-1.5 text-[10px] text-slate-400 font-medium border-b border-slate-100 bg-slate-50">已保存的供应商</div>
                      {cfgDraft.apiVendors.map((v) => (
                        <button
                          key={v.id}
                          type="button"
                          className="w-full text-left px-3 py-2 hover:bg-indigo-50 transition flex items-start gap-2 group"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            // 切换：填充 Base URL、API Key、供应商名称
                            const updated = switchApiVendor(v.id);
                            setCfgDraft((d) => ({
                              ...d,
                              globalBaseUrl: v.baseUrl,
                              globalApiKey: v.apiKey?.trim() ? v.apiKey.trim() : d.globalApiKey,
                              activeVendorId: v.id,
                              apiVendors: updated.apiVendors
                            }));
                            setGlobalSaveVendorName(v.name);
                            setVendorDropdownOpen(false);
                          }}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-semibold text-slate-700 truncate">{v.name}</span>
                              {cfgDraft.activeVendorId === v.id && <span className="text-[9px] bg-primary-100 text-primary-600 px-1 rounded-full flex-shrink-0">使用中</span>}
                              {v.isDefault && <span className="text-[9px] bg-emerald-100 text-emerald-600 px-1 rounded-full flex-shrink-0">默认</span>}
                            </div>
                            <p className="text-[10px] text-slate-400 font-mono truncate mt-0.5">{v.baseUrl}</p>
                            {v.remark && <p className="text-[10px] text-slate-400 italic truncate">{v.remark}</p>}
                          </div>
                          {v.apiKey && <span className="text-[9px] text-emerald-500 flex-shrink-0 mt-0.5">Key✓</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Base URL */}
                <input
                  type="url"
                  className="flex-1 min-w-0 border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-400 text-xs font-mono"
                  placeholder="Base URL"
                  value={cfgDraft.globalBaseUrl}
                  onChange={(e) => setCfgDraft((d) => ({ ...d, globalBaseUrl: e.target.value.trim() }))}
                />

                {/* API Key */}
                <input
                  type="password"
                  autoComplete="off"
                  className="flex-1 min-w-0 border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-400 text-xs"
                  placeholder="API Key"
                  value={cfgDraft.globalApiKey}
                  onChange={(e) => setCfgDraft((d) => ({ ...d, globalApiKey: e.target.value }))}
                />

                {/* 同步按钮 */}
                <button
                  type="button"
                  title="同步 Base URL 到所有模型"
                  className="px-2.5 py-1.5 rounded-lg border border-primary-200 bg-primary-50 text-primary-600 hover:bg-primary-100 text-[10px] font-medium transition whitespace-nowrap flex-shrink-0"
                  onClick={() => {
                    setCfgDraft((d) => ({
                      ...d,
                      chatModels:  d.chatModels.map((m)  => ({ ...m, baseUrl: "" })),
                      imageModels: d.imageModels.map((m) => ({ ...m, baseUrl: "" }))
                    }));
                    setSyncToast(true);
                    setTimeout(() => setSyncToast(false), 2500);
                  }}
                >同步</button>

                {/* 保存供应商按钮 */}
                <button
                  type="button"
                  disabled={!globalSaveVendorName.trim() || !cfgDraft.globalBaseUrl.trim()}
                  title={!globalSaveVendorName.trim() ? "请先填写供应商名称" : !cfgDraft.globalBaseUrl.trim() ? "请先填写 Base URL" : "保存当前配置为供应商"}
                  className="px-2.5 py-1.5 rounded-lg border border-indigo-300 bg-indigo-500 hover:bg-indigo-600 text-white text-[10px] font-medium transition whitespace-nowrap flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                  onClick={() => {
                    if (!globalSaveVendorName.trim() || !cfgDraft.globalBaseUrl.trim()) return;
                    const updated = addApiVendor({
                      name: globalSaveVendorName.trim(),
                      baseUrl: cfgDraft.globalBaseUrl.trim(),
                      apiKey: cfgDraft.globalApiKey || undefined,
                    });
                    setCfgDraft((d) => ({ ...d, apiVendors: updated.apiVendors }));
                    setGlobalSaveVendorName("");
                    setGlobalSaveVendorToast(true);
                    setTimeout(() => setGlobalSaveVendorToast(false), 2500);
                  }}
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
                  保存
                </button>
              </div>

              {/* 接口规范 */}
              <div className="flex items-center gap-2 mt-2">
                <span className="text-[10px] text-slate-400 flex-shrink-0">接口规范</span>
                {(["openai", "gemini"] as ApiSpec[]).map((sp) => (
                  <button
                    key={sp}
                    type="button"
                    onClick={() => setCfgDraft((d) => ({ ...d, globalApiSpec: sp }))}
                    className={`px-2.5 py-1 rounded-lg border text-[10px] font-medium transition-all ${
                      (cfgDraft.globalApiSpec ?? "gemini") === sp
                        ? sp === "gemini"
                          ? "border-purple-300 bg-purple-50 text-purple-700 shadow-sm"
                          : "border-primary-300 bg-primary-50 text-primary-700 shadow-sm"
                        : "border-slate-200 bg-white text-slate-400 hover:bg-slate-50"
                    }`}
                  >
                    {sp === "openai" ? "🔵 OpenAI" : "🔮 Gemini"}
                  </button>
                ))}
                {syncToast && (
                  <span className="text-[10px] text-primary-600 flex items-center gap-1 ml-2">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    已同步到所有模型
                  </span>
                )}
                {globalSaveVendorToast && (
                  <span className="text-[10px] text-emerald-600 flex items-center gap-1 ml-2">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    供应商已保存
                  </span>
                )}
              </div>
            </div>

            {/* ── 标签页 ── */}
            <div className="flex items-center gap-0 px-6 pt-3 flex-shrink-0 border-b border-slate-100">
              {(["image", "chat"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setSettingsTab(tab)}
                  className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors -mb-px ${
                    settingsTab === tab
                      ? "border-primary-500 text-primary-600"
                      : "border-transparent text-slate-400 hover:text-slate-600"
                  }`}
                >
                  {tab === "image" ? (
                    <span className="flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                      Image
                      <code className="text-[9px] bg-slate-100 text-slate-500 px-1 rounded font-mono">/v1/images/generations</code>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
                      Chat
                      <code className="text-[9px] bg-slate-100 text-slate-500 px-1 rounded font-mono">/v1/chat/completions</code>
                    </span>
                  )}
                </button>
              ))}
              {/* 工具标签（不可用） */}
              <button
                type="button"
                disabled
                title="待开发"
                className="px-4 py-2 text-xs font-semibold border-b-2 border-transparent text-slate-300 -mb-px cursor-not-allowed flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                工具
                <span className="text-[9px] bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded-full font-normal">待开发</span>
              </button>
            </div>

            {/* ── 标签页内容 ── */}
            <div className="flex-1 overflow-y-auto app-scrollbar px-6 py-4 min-h-0">

              {/* ─ Image Tab ─ */}
              {settingsTab === "image" && (() => {
                const models = cfgDraft.imageModels;
                const addModel = () => {
                  const newM: ImageModel = { id: Math.random().toString(36).slice(2) + Date.now().toString(36), modelId: "", label: "", apiKey: "", baseUrl: "" };
                  setCfgDraft((d) => ({ ...d, imageModels: [...d.imageModels, newM], activeImageModelId: d.activeImageModelId || newM.id }));
                };
                const updateModel = (id: string, patch: Partial<ImageModel>) => {
                  setCfgDraft((d) => ({ ...d, imageModels: d.imageModels.map((m) => m.id === id ? { ...m, ...patch } : m) }));
                };
                const removeModel = (id: string) => {
                  setCfgDraft((d) => {
                    const next = d.imageModels.filter((m) => m.id !== id);
                    const activeId = d.activeImageModelId === id ? (next[0]?.id ?? "") : d.activeImageModelId;
                    return { ...d, imageModels: next, activeImageModelId: activeId };
                  });
                };

                return (
                  <div className="flex flex-col gap-3">
                    {/* 获取模型按钮 */}
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] text-slate-400">绘图模型（POST /v1/images/generations），每行对应一个可用模型</p>
                      <div className="flex items-center gap-2">
                        {settingsModelsFetchErr && (
                          <span className="text-[11px] text-red-500">{settingsModelsFetchErr}</span>
                        )}
                        <button
                          type="button"
                          disabled={settingsModelsFetching || !cfgDraft.globalBaseUrl.trim()}
                          className="px-2.5 py-1.5 rounded-lg border border-primary-200 bg-primary-50 text-primary-600 text-[11px] font-medium hover:bg-primary-100 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-1.5"
                          onClick={async () => {
                            setSettingsModelsFetching(true);
                            setSettingsModelsFetchErr("");
                            const apiKey = cfgDraft.globalApiKey;
                            const r = await fetchModelList(cfgDraft.globalBaseUrl, apiKey);
                            setSettingsModelsFetching(false);
                            if (!r.ok) { setSettingsModelsFetchErr(r.message); return; }
                            // 打开选择弹窗，预选已在 imageModels 里的模型
                            const existingIds = new Set(cfgDraft.imageModels.map((m) => m.modelId).filter(Boolean));
                            setModelPickerList(r.models);
                            setModelPickerSelected(new Set(r.models.filter((id) => existingIds.has(id))));
                            setModelPickerSearch("");
                            setModelPickerCategoryTag(null);
                            setModelPickerVendorTag(null);
                            setModelPickerMode("image");
                            setModelPickerOpen(true);
                          }}
                        >
                          {settingsModelsFetching
                            ? <><svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>获取中…</>
                            : <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>获取模型列表</>
                          }
                        </button>
                        <button
                          type="button"
                          className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 text-[11px] hover:bg-slate-50 transition flex items-center gap-1"
                          onClick={addModel}
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                          添加
                        </button>
                      </div>
                    </div>

                    {/* 模型列表 */}
                    {models.length === 0 ? (
                      <div className="text-center py-8 text-sm text-slate-400">
                        <svg className="w-8 h-8 mx-auto mb-2 text-slate-200" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                        暂无 Image 模型，点击「添加」或「获取模型列表」
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2.5">
                        {models.map((m) => {
                          const ts = modelTestStatus[m.id] ?? "idle";
                          const tmsg = modelTestMsg[m.id] ?? "";
                          const isActive = cfgDraft.activeImageModelId === m.id;
                          return (
                            <div key={m.id} className={`rounded-xl border p-3 transition-all ${isActive ? "border-primary-300 bg-primary-50/40" : "border-slate-200 bg-white"}`}>
                              {/* 模型头部 */}
                              <div className="flex items-center gap-2 mb-2.5">
                                {/* 激活选中 */}
                                <button
                                  type="button"
                                  title={isActive ? "当前生图使用此模型" : "点击设为主模型"}
                                  onClick={() => setCfgDraft((d) => ({ ...d, activeImageModelId: m.id }))}
                                  className={`w-4 h-4 rounded-full border-2 flex-shrink-0 transition-all ${isActive ? "border-primary-500 bg-primary-500" : "border-slate-300 bg-white hover:border-primary-300"}`}
                                />
                                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex-1">Image Model</span>
                                {isActive && <span className="text-[10px] bg-primary-100 text-primary-600 px-1.5 py-0.5 rounded-full font-medium">主模型</span>}
                                {/* 删除 */}
                                <button
                                  type="button"
                                  title="删除此模型"
                                  onClick={() => removeModel(m.id)}
                                  className="p-1 rounded hover:bg-red-50 text-slate-300 hover:text-red-400 transition-colors"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                </button>
                              </div>

                              {/* 字段行 */}
                              <div className="grid grid-cols-3 gap-2 mb-2">
                                {/* Model ID */}
                                <div className="col-span-3 sm:col-span-1">
                                  <label className="block text-[10px] text-slate-500 mb-0.5 font-medium">MODEL ID <span className="text-red-400">*</span></label>
                                  <input
                                    type="text"
                                    className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-400 font-mono"
                                    placeholder="nano-banana"
                                    value={m.modelId}
                                    onChange={(e) => updateModel(m.id, { modelId: e.target.value })}
                                  />
                                </div>
                                {/* API KEY */}
                                <div className="col-span-3 sm:col-span-1">
                                  <label className="block text-[10px] text-slate-500 mb-0.5 font-medium">API KEY <span className="text-slate-300">(可选)</span></label>
                                  <input
                                    type="password"
                                    autoComplete="off"
                                    className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-400"
                                    placeholder="留空则用全局 Key"
                                    value={m.apiKey ?? ""}
                                    onChange={(e) => updateModel(m.id, { apiKey: e.target.value })}
                                  />
                                </div>
                                {/* BASE URL */}
                                <div className="col-span-3 sm:col-span-1">
                                  <label className="block text-[10px] text-slate-500 mb-0.5 font-medium">BASE URL <span className="text-slate-300">(可选)</span></label>
                                  <input
                                    type="url"
                                    className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-400 font-mono"
                                    placeholder={cfgDraft.globalBaseUrl || "继承全局"}
                                    value={m.baseUrl ?? ""}
                                    onChange={(e) => updateModel(m.id, { baseUrl: e.target.value })}
                                  />
                                </div>
                                {/* 接口规范 */}
                                <div className="col-span-3">
                                  <label className="block text-[10px] text-slate-500 mb-0.5 font-medium">接口规范</label>
                                  <div className="flex items-center gap-1.5">
                                    {(["openai", "gemini"] as ApiSpec[]).map((sp) => {
                                      const activeSpec = resolveApiSpec(m, cfgDraft);
                                      const isSelected = (m.apiSpec ? m.apiSpec : undefined) === sp || (!m.apiSpec && sp === cfgDraft.globalApiSpec) || (!m.apiSpec && !cfgDraft.globalApiSpec && sp === "openai");
                                      return (
                                        <button
                                          key={sp}
                                          type="button"
                                          onClick={() => updateModel(m.id, { apiSpec: sp === cfgDraft.globalApiSpec ? undefined : sp })}
                                          className={`px-3 py-1 rounded-lg border text-[11px] font-medium transition-all ${
                                            activeSpec === sp
                                              ? sp === "gemini"
                                                ? "border-purple-300 bg-purple-50 text-purple-700"
                                                : "border-primary-300 bg-primary-50 text-primary-700"
                                              : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                                          }`}
                                        >
                                          {sp === "openai" ? "🔵 OpenAI 规范" : "🔮 Gemini 规范"}
                                          {!m.apiSpec && <span className="ml-1 text-[9px] text-slate-400">(继承全局)</span>}
                                        </button>
                                      );
                                    })}
                                    {m.apiSpec && (
                                      <button
                                        type="button"
                                        className="text-[10px] text-slate-400 hover:text-slate-600 underline transition ml-1"
                                        onClick={() => updateModel(m.id, { apiSpec: undefined })}
                                      >
                                        重置为全局
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* 接口预览 + 测试 */}
                              <div className="flex items-center gap-2 flex-wrap">
                                {(() => {
                                  const baseUrlForPreview = (m.baseUrl?.trim() || cfgDraft.globalBaseUrl || "<BASE_URL>").replace(/\/$/, "");
                                  const specForPreview = resolveApiSpec(m, cfgDraft);
                                  const modelForPreview = m.modelId?.trim() || "gemini-2.0-flash-preview-image-generation";
                                  const pathPreview = specForPreview === "gemini"
                                    ? `/v1beta/models/${modelForPreview}:generateContent`
                                    : "/v1/images/generations";
                                  return (
                                    <code className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-mono flex-1 min-w-0 truncate">
                                      POST {baseUrlForPreview}{pathPreview}
                                    </code>
                                  );
                                })()}
                                {/* 测试按钮 */}
                                <button
                                  type="button"
                                  disabled={ts === "testing"}
                                  className={`flex-shrink-0 px-2.5 py-1 rounded-lg border text-[10px] font-medium flex items-center gap-1 transition ${
                                    ts === "ok"   ? "border-green-200 bg-green-50 text-green-600" :
                                    ts === "fail" ? "border-red-200 bg-red-50 text-red-600" :
                                    "border-violet-200 bg-violet-50 text-violet-600 hover:bg-violet-100 disabled:opacity-50"
                                  }`}
                                  onClick={async () => {
                                    setModelTestStatus((s) => ({ ...s, [m.id]: "testing" }));
                                    setModelTestMsg((s) => ({ ...s, [m.id]: "" }));
                                    const result = await testImageModel(m, cfgDraft);
                                    setModelTestStatus((s) => ({ ...s, [m.id]: result.ok ? "ok" : "fail" }));
                                    setModelTestMsg((s) => ({ ...s, [m.id]: result.message + (result.ok ? "" : (result.detail ? `\n${result.detail}` : "")) }));
                                  }}
                                >
                                  {ts === "testing" ? (
                                    <><svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>测试中…</>
                                  ) : ts === "ok" ? (
                                    <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>联通</>
                                  ) : ts === "fail" ? (
                                    <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>失败</>
                                  ) : (
                                    <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>测试连接</>
                                  )}
                                </button>
                              </div>
                              {/* 测试结果 */}
                              {tmsg && (
                                <div className={`mt-2 px-2.5 py-1.5 rounded-lg text-[10px] whitespace-pre-wrap leading-relaxed ${
                                  ts === "ok" ? "bg-green-50 border border-green-100 text-green-700" : "bg-red-50 border border-red-100 text-red-700"
                                }`}>
                                  {tmsg}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* JSON 格式校验开关 */}
                    <div className="mt-1 flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2 border border-slate-200">
                      <span className="text-[11px] text-slate-500">严格校验 API 响应 JSON 格式（非 JSON 返回时给出友好提示）</span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={cfgDraft.apiValidateJson}
                        onClick={() => setCfgDraft((d) => ({ ...d, apiValidateJson: !d.apiValidateJson }))}
                        className={`relative inline-flex flex-shrink-0 h-5 w-9 rounded-full border-2 transition-colors duration-200 focus:outline-none ${
                          cfgDraft.apiValidateJson ? "bg-primary-500 border-primary-500" : "bg-slate-300 border-slate-300"
                        }`}
                      >
                        <span className={`inline-block w-3.5 h-3.5 rounded-full bg-white shadow transform transition-transform duration-200 ${cfgDraft.apiValidateJson ? "translate-x-4" : "translate-x-0"}`} />
                      </button>
                    </div>
                  </div>
                );
              })()}

              {/* ─ Chat Tab ─ */}
              {settingsTab === "chat" && (() => {
                const models = cfgDraft.chatModels;
                const addModel = () => {
                  const newM: ChatModel = { id: Math.random().toString(36).slice(2) + Date.now().toString(36), modelId: "", label: "", apiKey: "", baseUrl: "" };
                  setCfgDraft((d) => ({ ...d, chatModels: [...d.chatModels, newM] }));
                };
                const updateModel = (id: string, patch: Partial<ChatModel>) => {
                  setCfgDraft((d) => ({ ...d, chatModels: d.chatModels.map((m) => m.id === id ? { ...m, ...patch } : m) }));
                };
                const removeModel = (id: string) => {
                  setCfgDraft((d) => ({ ...d, chatModels: d.chatModels.filter((m) => m.id !== id) }));
                };

                return (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] text-slate-400">聊天对话模型（POST /v1/chat/completions），如 gpt-4o、Gemini 等</p>
                      <div className="flex items-center gap-2">
                        {settingsModelsFetchErr && settingsTab === "chat" && (
                          <span className="text-[11px] text-red-500">{settingsModelsFetchErr}</span>
                        )}
                        <button
                          type="button"
                          disabled={settingsModelsFetching || !cfgDraft.globalBaseUrl.trim()}
                          className="px-2.5 py-1.5 rounded-lg border border-primary-200 bg-primary-50 text-primary-600 text-[11px] font-medium hover:bg-primary-100 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-1.5"
                          onClick={async () => {
                            setSettingsModelsFetching(true);
                            setSettingsModelsFetchErr("");
                            const r = await fetchModelList(cfgDraft.globalBaseUrl, cfgDraft.globalApiKey);
                            setSettingsModelsFetching(false);
                            if (!r.ok) { setSettingsModelsFetchErr(r.message); return; }
                            const existingIds = new Set(cfgDraft.chatModels.map((m) => m.modelId).filter(Boolean));
                            setModelPickerList(r.models);
                            setModelPickerSelected(new Set(r.models.filter((id) => existingIds.has(id))));
                            setModelPickerSearch("");
                            setModelPickerCategoryTag(null);
                            setModelPickerVendorTag(null);
                            setModelPickerMode("chat");
                            setModelPickerOpen(true);
                          }}
                        >
                          {settingsModelsFetching
                            ? <><svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>获取中…</>
                            : <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>获取模型列表</>
                          }
                        </button>
                        <button
                          type="button"
                          className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 text-[11px] hover:bg-slate-50 transition flex items-center gap-1"
                          onClick={addModel}
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                          添加
                        </button>
                      </div>
                    </div>

                    {models.length === 0 ? (
                      <div className="text-center py-8 text-sm text-slate-400">
                        <svg className="w-8 h-8 mx-auto mb-2 text-slate-200" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
                        暂无 Chat 模型，点击「添加」或「获取模型列表」
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2.5">
                        {models.map((m) => {
                          const ts = modelTestStatus[m.id] ?? "idle";
                          const tmsg = modelTestMsg[m.id] ?? "";
                          return (
                            <div key={m.id} className="rounded-xl border border-slate-200 bg-white p-3">
                              <div className="flex items-center gap-2 mb-2.5">
                                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex-1">Chat Model</span>
                                <button
                                  type="button"
                                  title="删除此模型"
                                  onClick={() => removeModel(m.id)}
                                  className="p-1 rounded hover:bg-red-50 text-slate-300 hover:text-red-400 transition-colors"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                </button>
                              </div>

                              <div className="grid grid-cols-3 gap-2 mb-2">
                                <div className="col-span-3 sm:col-span-1">
                                  <label className="block text-[10px] text-slate-500 mb-0.5 font-medium">MODEL ID <span className="text-red-400">*</span></label>
                                  <input
                                    type="text"
                                    className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-400 font-mono"
                                    placeholder="gpt-4o"
                                    value={m.modelId}
                                    onChange={(e) => updateModel(m.id, { modelId: e.target.value })}
                                  />
                                </div>
                                <div className="col-span-3 sm:col-span-1">
                                  <label className="block text-[10px] text-slate-500 mb-0.5 font-medium">API KEY <span className="text-slate-300">(可选)</span></label>
                                  <input
                                    type="password"
                                    autoComplete="off"
                                    className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-400"
                                    placeholder="留空则用全局 Key"
                                    value={m.apiKey ?? ""}
                                    onChange={(e) => updateModel(m.id, { apiKey: e.target.value })}
                                  />
                                </div>
                                <div className="col-span-3 sm:col-span-1">
                                  <label className="block text-[10px] text-slate-500 mb-0.5 font-medium">BASE URL <span className="text-slate-300">(可选)</span></label>
                                  <input
                                    type="url"
                                    className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-400 font-mono"
                                    placeholder={cfgDraft.globalBaseUrl || "继承全局"}
                                    value={m.baseUrl ?? ""}
                                    onChange={(e) => updateModel(m.id, { baseUrl: e.target.value })}
                                  />
                                </div>
                              </div>

                              <div className="flex items-center gap-2 flex-wrap">
                                <code className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-mono flex-1 min-w-0 truncate">
                                  POST {(m.baseUrl?.trim() || cfgDraft.globalBaseUrl || "<BASE_URL>").replace(/\/$/, "")}/v1/chat/completions
                                </code>
                                <button
                                  type="button"
                                  disabled={ts === "testing"}
                                  className={`flex-shrink-0 px-2.5 py-1 rounded-lg border text-[10px] font-medium flex items-center gap-1 transition ${
                                    ts === "ok"   ? "border-green-200 bg-green-50 text-green-600" :
                                    ts === "fail" ? "border-red-200 bg-red-50 text-red-600" :
                                    "border-violet-200 bg-violet-50 text-violet-600 hover:bg-violet-100 disabled:opacity-50"
                                  }`}
                                  onClick={async () => {
                                    setModelTestStatus((s) => ({ ...s, [m.id]: "testing" }));
                                    setModelTestMsg((s) => ({ ...s, [m.id]: "" }));
                                    const result = await testChatModel(m, cfgDraft);
                                    setModelTestStatus((s) => ({ ...s, [m.id]: result.ok ? "ok" : "fail" }));
                                    setModelTestMsg((s) => ({ ...s, [m.id]: result.message + (result.ok ? "" : (result.detail ? `\n${result.detail}` : "")) }));
                                  }}
                                >
                                  {ts === "testing" ? (
                                    <><svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>测试中…</>
                                  ) : ts === "ok" ? (
                                    <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>联通</>
                                  ) : ts === "fail" ? (
                                    <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>失败</>
                                  ) : (
                                    <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>测试连接</>
                                  )}
                                </button>
                              </div>
                              {tmsg && (
                                <div className={`mt-2 px-2.5 py-1.5 rounded-lg text-[10px] whitespace-pre-wrap leading-relaxed ${
                                  ts === "ok" ? "bg-green-50 border border-green-100 text-green-700" : "bg-red-50 border border-red-100 text-red-700"
                                }`}>
                                  {tmsg}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}

            </div>

            {/* ── 底部操作栏 ── */}
            <div className="flex-shrink-0 border-t border-slate-100 px-6 py-4 flex items-center justify-between bg-white rounded-b-2xl">
              <p className="text-[10px] text-slate-400">
                请求头：<code className="bg-slate-100 px-1 rounded">Authorization: Bearer API_KEY</code>
              </p>
              <div className="flex gap-2">
                <button
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm hover:bg-slate-50 transition"
                  onClick={() => setSettingsOpen(false)}
                >
                  取消
                </button>
                <button
                  className="px-5 py-2 rounded-lg bg-primary-500 text-white text-sm font-medium hover:bg-primary-600 transition"
                  onClick={() => {
                    // 保存配置
                    saveApiConfig(cfgDraft);
                    // 同步主界面模型列表
                    const imgModelIds = cfgDraft.imageModels.map((m) => m.modelId).filter(Boolean);
                    if (imgModelIds.length > 0) {
                      setModelList(imgModelIds);
                      const activeM = cfgDraft.imageModels.find((m) => m.id === cfgDraft.activeImageModelId);
                      const activeMid = activeM?.modelId?.trim() || imgModelIds[0];
                      setModel(activeMid);
                    } else {
                      // 清空了所有模型 — 同步清空界面
                      setModelList([]);
                      setModel("");
                    }
                    setSettingsOpen(false);
                  }}
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 选择模型弹窗：悬浮模式，固定定位，可超出设置弹窗，支持拖拽缩放 */}
      {modelSelectOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{backdropFilter:"blur(4px)",background:"rgba(0,0,0,0.45)"}} onClick={(e) => { if (e.target === e.currentTarget) setModelSelectOpen(false); }}>
          <div
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden popup-enter relative"
            style={{width: modelModalSize.w, height: modelModalSize.h, maxWidth:"95vw", maxHeight:"95vh", minWidth:520, minHeight:400}}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 顶部标题栏 */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0 bg-gradient-to-r from-primary-50 to-purple-50">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold text-slate-800">选择调用模型</h3>
              </div>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                  <input
                    type="text"
                    className="pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-400 w-48"
                    placeholder="搜索模型 id…"
                    value={modelSearchQuery}
                    onChange={(e) => setModelSearchQuery(e.target.value)}
                  />
                </div>
                <button type="button" className="text-slate-400 hover:text-slate-600 text-2xl leading-none p-1 hover:bg-slate-100 rounded-lg transition" onClick={() => setModelSelectOpen(false)}>×</button>
              </div>
            </div>

            {/* 主体：左侧筛选 + 右侧列表 */}
            <div className="flex flex-1 min-h-0 overflow-hidden">
              {/* 左侧筛选面板 */}
              <div className="w-52 flex-shrink-0 border-r border-slate-100 bg-slate-50/70 flex flex-col overflow-y-auto app-scrollbar">
                {/* 模型标签 */}
                <div className="px-3 py-2.5">
                  <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">模型标签</div>
                  <div className="flex flex-col gap-0.5">
                    <button type="button" className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition ${!filterCategoryTag ? "bg-primary-500 text-white font-medium" : "text-slate-600 hover:bg-white hover:shadow-sm"}`} onClick={() => setFilterCategoryTag(null)}>全部标签</button>
                    {MODEL_CATEGORY_TAGS.map((tag) => (
                      <button key={tag} type="button" className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition flex items-center justify-between ${filterCategoryTag === tag ? "bg-primary-500 text-white font-medium" : "text-slate-600 hover:bg-white hover:shadow-sm"}`} onClick={() => setFilterCategoryTag(filterCategoryTag === tag ? null : tag)}>
                        <span>{tag}</span>
                        {filterCategoryTag === tag && <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                      </button>
                    ))}
                  </div>
                </div>
                {/* 模型厂商 */}
                <div className="px-3 py-2.5 border-t border-slate-100">
                  <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    模型厂商
                    <a href="https://ai.t8star.cn/models" target="_blank" rel="noopener noreferrer" className="text-primary-500 hover:underline normal-case">参考</a>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <button type="button" className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition ${!filterVendorTag ? "bg-primary-500 text-white font-medium" : "text-slate-600 hover:bg-white hover:shadow-sm"}`} onClick={() => setFilterVendorTag(null)}>全部厂商</button>
                    {MODEL_VENDOR_TAGS.map((tag) => (
                      <button key={tag} type="button" className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition flex items-center justify-between ${filterVendorTag === tag ? "bg-primary-500 text-white font-medium" : "text-slate-600 hover:bg-white hover:shadow-sm"}`} onClick={() => setFilterVendorTag(filterVendorTag === tag ? null : tag)}>
                        <span>{tag}</span>
                        {filterVendorTag === tag && <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* 右侧模型列表 */}
              <div className="flex-1 overflow-y-auto app-scrollbar p-4 min-h-0">
                {fetchedModelList.length === 0 ? (
                  <p className="text-sm text-slate-500 py-8 text-center">暂无模型</p>
                ) : (() => {
                  const baseGroups = filterGroupsBySearch(groupModelsByCategory(fetchedModelList), modelSearchQuery);
                  const filtered = filterGroupsByTags(baseGroups, filterCategoryTag, filterVendorTag);
                  return filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                      <svg className="w-12 h-12 text-slate-200 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      <p className="text-sm">没有匹配的模型</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {filtered.map(({ category, models }) => (
                        <div key={category}>
                          <div className="text-xs font-medium text-slate-500 px-2 py-1.5 mb-1 flex items-center gap-2">
                            <span className="flex-1 border-b border-slate-100 pb-1">{category}</span>
                            <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{models.length}</span>
                          </div>
                          <div className="grid grid-cols-1 gap-0.5">
                            {models.map((id) => {
                              const info = getModelDisplayInfo(id);
                              const priceInfo = getModelPrice(id);
                              const checked = selectedModelIdsInModal.includes(id);
                              return (
                                <label key={id} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all ${checked ? "bg-primary-50 border border-primary-200/70" : "hover:bg-slate-50 border border-transparent"}`}>
                                  <input type="checkbox" checked={checked} onChange={() => setSelectedModelIdsInModal((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])} className="text-primary-500 rounded w-4 h-4 flex-shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <div className={`text-sm truncate ${checked ? "text-primary-700 font-medium" : "text-slate-700"}`} title={id}>{id}</div>
                                    <div className="flex items-center gap-1 mt-0.5">
                                      {info.categoryTag && <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 text-[10px]">{info.categoryTag}</span>}
                                      {info.vendorTag && <span className="px-1.5 py-0.5 rounded bg-primary-50 text-primary-600 text-[10px]">{info.vendorTag}</span>}
                                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${priceInfo.price === "询价" ? "bg-slate-100 text-slate-400" : "bg-emerald-100 text-emerald-700 border border-emerald-200/60"}`}>
                                        {priceInfo.price}
                                        {priceInfo.note && <span className="ml-0.5 opacity-70">{priceInfo.note}</span>}
                                      </span>
                                    </div>
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* 底部操作栏 */}
            <div className="px-5 py-3.5 border-t border-slate-100 flex items-center justify-between gap-2 flex-shrink-0 bg-white">
              {/* 左下角：已选数量（可点击打开管理弹窗） + 清空 */}
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold transition-all cursor-pointer ${selectedModelIdsInModal.length > 0 ? "bg-primary-500 text-white shadow-md shadow-primary-500/25 hover:bg-primary-600" : "bg-slate-100 text-slate-400 hover:bg-slate-200"}`}
                  title="点击管理已选模型"
                  onClick={() => {
                    // 同步当前勾选到 settingsForm，不关闭选择模型弹窗，叠加打开管理弹窗
                    setSettingsForm((f) => ({ ...f, selectedModelIds: selectedModelIdsInModal, modelList: fetchedModelList }));
                    setSelectedModelManageOpen(true);
                  }}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  已选 <span className={`text-base font-bold leading-none ${selectedModelIdsInModal.length > 0 ? "text-white" : "text-slate-400"}`}>{selectedModelIdsInModal.length}</span> 个模型
                  <svg className="w-3 h-3 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                </button>
                {selectedModelIdsInModal.length > 0 && (
                  <button type="button" className="text-xs text-slate-400 hover:text-red-500 transition px-2 py-1 rounded-lg hover:bg-red-50" onClick={() => setSelectedModelIdsInModal([])}>清空选择</button>
                )}
              </div>
              <div className="flex gap-2">
                <button type="button" className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm hover:bg-slate-50 transition" onClick={() => setModelSelectOpen(false)}>取消</button>
                <button type="button" className="px-4 py-2 rounded-lg bg-primary-500 text-white text-sm hover:bg-primary-600 transition font-medium" onClick={() => { setSettingsForm((f) => ({ ...f, selectedModelIds: selectedModelIdsInModal, modelList: fetchedModelList })); setModelSelectOpen(false); }}>确定</button>
              </div>
            </div>

            {/* 右下角拖拽缩放把手 */}
            <div
              className="absolute bottom-0 right-0 w-5 h-5 cursor-se-resize flex items-end justify-end pb-1 pr-1 z-10 group"
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                modelModalResizing.current = true;
                modelModalResizeStart.current = { mouseX: e.clientX, mouseY: e.clientY, w: modelModalSize.w, h: modelModalSize.h };
                document.body.style.cursor = "se-resize";
                document.body.style.userSelect = "none";
              }}
            >
              <svg className="w-3 h-3 text-slate-300 group-hover:text-primary-400 transition-colors" viewBox="0 0 10 10" fill="currentColor">
                <path d="M8 2L2 8M10 5L5 10M10 8L8 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
              </svg>
            </div>
          </div>
        </div>
      )}

      {/* 已选模型管理弹窗（叠加在选择模型弹窗之上） */}
      {selectedModelManageOpen && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center" style={{backdropFilter:"blur(2px)",background:"rgba(0,0,0,0.35)"}} onClick={(e) => { if (e.target === e.currentTarget) { setSelectedModelIdsInModal(settingsForm.selectedModelIds); setSelectedModelManageOpen(false); } }}>
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden popup-enter" style={{width:"min(90vw,600px)",maxHeight:"min(90vh,680px)"}}>
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0 bg-gradient-to-r from-emerald-50 to-teal-50">
              <div className="flex items-center gap-3">
                <h3 className="text-base font-semibold text-slate-800">已选模型管理</h3>
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-medium">{settingsForm.selectedModelIds.length} 个</span>
              </div>
              <button type="button" className="text-slate-400 hover:text-slate-600 text-2xl leading-none p-1 hover:bg-slate-100 rounded-lg transition" onClick={() => { setSelectedModelIdsInModal(settingsForm.selectedModelIds); setSelectedModelManageOpen(false); }}>×</button>
            </div>

            {/* 主体：左列已选 + 右列可添加 */}
            <div className="flex flex-1 min-h-0 overflow-hidden">
              {/* 左：已选列表 */}
              <div className="flex-1 flex flex-col border-r border-slate-100 min-w-0">
                <div className="px-4 py-2.5 border-b border-slate-50 bg-slate-50/60 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-600">当前已选</span>
                  <button type="button" className="text-[10px] text-slate-400 hover:text-red-500 transition" onClick={() => { if (confirm("确定清空所有已选模型吗？")) setSettingsForm((f) => ({ ...f, selectedModelIds: [] })); }}>清空全部</button>
                </div>
                <div className="flex-1 overflow-y-auto app-scrollbar p-3 min-h-0">
                  {settingsForm.selectedModelIds.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                      <svg className="w-10 h-10 text-slate-200 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" /></svg>
                      <p className="text-xs">暂无已选模型</p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {settingsForm.selectedModelIds.map((id, idx) => {
                        const info = getModelDisplayInfo(id);
                        const priceInfo = getModelPrice(id);
                        return (
                          <div key={id} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-100 hover:border-red-200 hover:bg-red-50/30 group transition-all">
                            <span className="w-5 h-5 rounded bg-emerald-100 text-emerald-600 flex items-center justify-center text-[9px] font-bold flex-shrink-0">{idx + 1}</span>
                            <div className="flex-1 min-w-0">
                              <div className="text-xs text-slate-700 truncate font-medium" title={id}>{id}</div>
                              <div className="flex items-center gap-1 mt-0.5">
                                {info.vendorTag && <span className="px-1 py-0 rounded bg-primary-50 text-primary-600 text-[9px]">{info.vendorTag}</span>}
                                <span className={`px-1 py-0 rounded text-[9px] ${priceInfo.price === "询价" ? "bg-slate-100 text-slate-400" : "bg-emerald-50 text-emerald-600"}`}>{priceInfo.price}</span>
                              </div>
                            </div>
                            <button type="button" className="w-6 h-6 flex items-center justify-center rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-100 transition-all opacity-0 group-hover:opacity-100 flex-shrink-0" title="移除" onClick={() => setSettingsForm((f) => ({ ...f, selectedModelIds: f.selectedModelIds.filter(x => x !== id) }))}>
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* 右：从已获取列表中添加 */}
              <div className="flex-1 flex flex-col min-w-0">
                <div className="px-4 py-2.5 border-b border-slate-50 bg-slate-50/60">
                  <span className="text-xs font-semibold text-slate-600">添加模型</span>
                  {fetchedModelList.length === 0 && <span className="text-[9px] text-slate-400 ml-1.5">请先在设置中获取模型列表</span>}
                </div>
                {fetchedModelList.length > 0 ? (
                  <>
                    <div className="px-3 py-2 border-b border-slate-50">
                      <input
                        type="text"
                        className="w-full text-xs rounded-lg border border-slate-200 px-2.5 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-primary-300"
                        placeholder="搜索模型 id…"
                        value={modelSearchQuery}
                        onChange={(e) => setModelSearchQuery(e.target.value)}
                      />
                    </div>
                    <div className="flex-1 overflow-y-auto app-scrollbar p-3 min-h-0">
                      <div className="space-y-0.5">
                        {fetchedModelList
                          .filter(id => !modelSearchQuery.trim() || id.toLowerCase().includes(modelSearchQuery.toLowerCase()))
                          .map(id => {
                            const isAdded = settingsForm.selectedModelIds.includes(id);
                            const info = getModelDisplayInfo(id);
                            const priceInfo = getModelPrice(id);
                            return (
                              <div key={id} className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all ${isAdded ? "bg-emerald-50 border-emerald-200/70" : "bg-white border-slate-100 hover:border-primary-200 hover:bg-primary-50/30"}`}>
                                <div className="flex-1 min-w-0">
                                  <div className={`text-xs truncate ${isAdded ? "text-emerald-700 font-medium" : "text-slate-700"}`} title={id}>{id}</div>
                                  <div className="flex items-center gap-1 mt-0.5">
                                    {info.categoryTag && <span className="px-1 py-0 rounded bg-slate-100 text-slate-500 text-[9px]">{info.categoryTag}</span>}
                                    {info.vendorTag && <span className="px-1 py-0 rounded bg-primary-50 text-primary-600 text-[9px]">{info.vendorTag}</span>}
                                    <span className={`px-1 py-0 rounded text-[9px] ${priceInfo.price === "询价" ? "bg-slate-100 text-slate-400" : "bg-emerald-50 text-emerald-600"}`}>{priceInfo.price}</span>
                                  </div>
                                </div>
                                {isAdded ? (
                                  <span className="text-[9px] text-emerald-500 flex-shrink-0">已添加</span>
                                ) : (
                                  <button type="button" className="w-6 h-6 flex items-center justify-center rounded-lg bg-primary-500 hover:bg-primary-600 text-white transition flex-shrink-0" title="添加" onClick={() => setSettingsForm((f) => ({ ...f, selectedModelIds: [...f.selectedModelIds, id] }))}>
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
                                  </button>
                                )}
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center p-6 text-slate-400 text-center">
                    <svg className="w-12 h-12 text-slate-200 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" /></svg>
                    <p className="text-xs">暂无可用模型库</p>
                    <p className="text-[10px] text-slate-300 mt-1">请先在设置中点击「自动获取模型」</p>
                  </div>
                )}
              </div>
            </div>

            <div className="px-5 py-3.5 border-t border-slate-100 flex items-center justify-between flex-shrink-0 bg-white">
              <span className="text-xs text-slate-400">修改会即时生效</span>
              <button type="button" className="px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm hover:bg-emerald-600 transition font-medium" onClick={() => {
                // 同步到 modelList 状态
                if (settingsForm.selectedModelIds.length) {
                  setModelList(settingsForm.selectedModelIds);
                  setModel((m) => settingsForm.selectedModelIds.includes(m) ? m : settingsForm.selectedModelIds[0]);
                  setApiSettings({ selectedModelIds: settingsForm.selectedModelIds, modelList: settingsForm.modelList });
                  // B3修复：同步到 cfgDraft.imageModels，防止设置弹窗和模型管理弹窗状态不一致
                  setCfgDraft((prev) => {
                    const existingModels = prev.imageModels;
                    const syncedModels = settingsForm.selectedModelIds.map((mid: string) => {
                      const found = existingModels.find((m) => m.modelId === mid);
                      return found ?? { id: Math.random().toString(36).slice(2), modelId: mid, label: mid, apiKey: "", baseUrl: "" };
                    });
                    return { ...prev, imageModels: syncedModels };
                  });
                }
                // 同步回选择弹窗的勾选状态
                setSelectedModelIdsInModal(settingsForm.selectedModelIds);
                setSelectedModelManageOpen(false);
              }}>完成</button>
            </div>
          </div>
        </div>
      )}

      {/* 主体区域 - 适配固定header */}
      <main className="flex gap-3 p-4 pt-[72px] overflow-hidden" style={{ height: '100vh', minHeight: 0 }}>

        {/* 左侧历史栏 - 靠左停靠，展开时与生成结果并排 */}
        <div
          className={`flex-shrink-0 flex flex-col glass-card overflow-hidden transition-all duration-300 ${
            historyPanelOpen ? "w-[300px] opacity-100" : "w-0 opacity-0 pointer-events-none"
          }`}
          style={{ borderRadius: "1rem" }}
        >
          {/* 头部 */}
          <div className="flex-shrink-0 px-3 py-2.5 flex items-center justify-between bg-gradient-to-r from-primary-500 to-purple-500"
            style={historyPanelOpen ? {} : { display: "none" }}>
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h2 className="text-sm font-bold text-white">生图历史</h2>
              {generationHistory.length > 0 && (
                <span className="px-1.5 py-0.5 bg-white/25 rounded-full text-white text-[10px] font-semibold tabular-nums">{generationHistory.length}</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {/* 排版切换：列表 / 网格 */}
              {generationHistory.length > 0 && (
                <div className="flex items-center bg-white/20 rounded-lg p-0.5">
                  <button
                    onClick={() => setHistoryLayout("list")}
                    title="列表视图"
                    className={`px-1.5 py-0.5 rounded transition ${historyLayout === "list" ? "bg-white/90 text-primary-600" : "text-white/70 hover:text-white"}`}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setHistoryLayout("grid")}
                    title="网格视图"
                    className={`px-1.5 py-0.5 rounded transition ${historyLayout === "grid" ? "bg-white/90 text-primary-600" : "text-white/70 hover:text-white"}`}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A.75.75 0 016 .75v3a.75.75 0 01-1.5 0V6.75A.75.75 0 013.75 6zm10.5 0A.75.75 0 0114.5 6v3a.75.75 0 01-1.5 0V6.75A.75.75 0 0114.25 6zM3.75 15.75a.75.75 0 01.75-.75h3a.75.75 0 010 1.5h-3a.75.75 0 01-.75-.75zM14.25 15a.75.75 0 00.75-.75h-3a.75.75 0 000 1.5h3a.75.75 0 00.75-.75z" />
                    </svg>
                  </button>
                </div>
              )}
              {generationHistory.length > 0 && (
                <button
                  onClick={() => { setHistoryBatchMode(!historyBatchMode); setHistorySelected(new Set()); }}
                  className={`text-white text-[11px] px-2 py-1 rounded-lg transition font-medium ${historyBatchMode ? "bg-white/30 ring-1 ring-white/40" : "hover:bg-white/20 text-white/80"}`}
                >{historyBatchMode ? "退出批量" : "批量"}</button>
              )}
              {generationHistory.length > 0 && !historyBatchMode && (
                <button
                  onClick={() => { if (confirm("确定要清空所有历史记录吗？")) { setGenerationHistory([]); } }}
                  className="text-white/60 hover:text-white text-[11px] px-1.5 py-1 rounded-lg hover:bg-red-500/40 transition"
                >清空</button>
              )}
            </div>
          </div>

          {/* 历史列表 */}
          <div className="flex-1 overflow-y-auto app-scrollbar" style={historyPanelOpen ? {} : { display: "none" }}>
            {generationHistory.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-400 px-4">
                <svg className="w-10 h-10 mb-2 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-xs">暂无历史记录</p>
              </div>
            ) : (
              <>
                {/* 网格视图 */}
                {historyLayout === "grid" ? (
                  <div className="p-2 grid grid-cols-2 gap-2">
                        {generationHistory.map((entry) => {
                          const hasError = !!entry.error;
                          const isPending = entry.results.length === 0 && !hasError;
                          const firstImg = entry.results[0];
                          return (
                            <div
                              key={entry.id}
                              className={`relative rounded-xl overflow-hidden cursor-pointer transition hover:ring-2 hover:ring-primary-400/50 group ${
                                historySelected.has(entry.id) ? "ring-2 ring-primary-500" : ""
                              }`}
                              onClick={() => {
                                // 批量模式：切换选择；非批量：只查看，不填入提示词
                                if (historyBatchMode) {
                                  setHistorySelected(prev => {
                                    const next = new Set(prev);
                                    if (next.has(entry.id)) {
                                      next.delete(entry.id);
                                    } else {
                                      next.add(entry.id);
                                    }
                                    return next;
                                  });
                                }
                              }}
                              onDoubleClick={(e) => {
                                if (!historyBatchMode) {
                                  e.stopPropagation();
                                  if (hasError) {
                                    // 打开错误详情
                                    const elapsedMs = entry.createdAt ? Date.now() - entry.createdAt : null;
                                    const elapsedStr = elapsedMs ? `（耗时 ${Math.floor(elapsedMs / 60000)}分${Math.floor((elapsedMs % 60000) / 1000)}秒）` : "";
                                    const errorLog = {
                                      time: new Date(entry.timestamp).toLocaleTimeString(),
                                      endpoint: `生成图片${elapsedStr}`,
                                      error: entry.error,
                                      request: `[模型] ${entry.model}\n[尺寸] ${entry.width}×${entry.height}\n[批次] ${entry.batchSize}\n[正向提示词]\n${entry.prompt}${entry.negativePrompt ? `\n\n[反向提示词]\n${entry.negativePrompt}` : ""}`,
                                      httpErrorBody: `错误类型: ${entry.error?.includes("超时") ? "生成超时（5分钟）" : "生成失败"}\n记录时间: ${new Date(entry.createdAt || entry.timestamp).toLocaleString()}${entry.createdAt ? `\n开始时间: ${new Date(entry.createdAt).toLocaleString()}` : ""}${elapsedMs ? `\n总耗时: ${Math.floor(elapsedMs / 60000)}分${Math.floor((elapsedMs % 60000) / 1000)}秒` : ""}`,
                                    };
                                    useUiStore.getState().setSelectedLogEntry(errorLog);
                                    useUiStore.getState().setShowDetailedLog(true);
                                  } else if (firstImg) {
                                    setHistoryFullPreview(firstImg);
                                  }
                                }
                              }}
                            >
                              {firstImg ? (
                                <img
                                  src={firstImg.url}
                                  alt=""
                                  className="w-full aspect-square object-cover bg-slate-700 cursor-zoom-in hover:opacity-90 transition"
                                  onDoubleClick={() => setHistoryFullPreview(firstImg)}
                                  title="双击查看大图"
                                />
                              ) : (
                            <div className="w-full aspect-square bg-slate-700/60 flex items-center justify-center">
                              {hasError ? (
                                <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                              ) : (
                                <svg className="w-6 h-6 text-slate-500 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                              )}
                            </div>
                          )}
                          {/* 悬停遮罩 */}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition" />
                          {/* 底部信息 */}
                          <div className="absolute bottom-0 left-0 right-0 p-1.5">
                            <p className="text-[9px] text-white/80 truncate">{entry.prompt}</p>
                            <div className="flex items-center gap-1 mt-0.5">
                              {entry.results.length > 0 && <span className="text-[8px] text-primary-300">{entry.results.length}张</span>}
                              {isPending && <span className="text-[8px] text-amber-300 animate-pulse">生图中</span>}
                              {hasError && <span className="text-[8px] text-red-300 truncate">{entry.error}</span>}
                            </div>
                          </div>
                          {/* 批量选择 */}
                          {historyBatchMode && (
                            <div className="absolute top-1 left-1">
                              <div className={`w-4 h-4 rounded border flex items-center justify-center transition ${
                                historySelected.has(entry.id) ? "bg-primary-500 border-primary-500" : "bg-black/40 border-white/50"
                              }`}>
                                {historySelected.has(entry.id) && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  /* 列表视图 */
                  generationHistory.map((entry) => {
                    const hasError = !!entry.error;
                    const isPending = entry.results.length === 0 && !hasError;
                    const firstImg = entry.results[0];
                    return (
                      <div
                        key={entry.id}
                        className={`p-2.5 border-b border-white/20 hover:bg-white/10 cursor-pointer transition group ${
                          historySelected.has(entry.id) ? "bg-primary-500/20 ring-1 ring-primary-400/40" : ""
                        } ${historyBatchMode ? "pl-3" : ""}`}
                        onClick={() => {
                          // 批量模式：切换选择；非批量：只查看，不填入提示词
                          if (historyBatchMode) {
                            setHistorySelected(prev => {
                              const next = new Set(prev);
                              next.has(entry.id) ? next.delete(entry.id) : next.add(entry.id);
                              return next;
                            });
                          }
                        }}
                        onDoubleClick={() => {
                          if (!historyBatchMode) {
                            if (hasError) {
                              const elapsedMs = entry.createdAt ? Date.now() - entry.createdAt : null;
                              const elapsedStr = elapsedMs ? `（耗时 ${Math.floor(elapsedMs / 60000)}分${Math.floor((elapsedMs % 60000) / 1000)}秒）` : "";
                              const errorLog = {
                                time: new Date(entry.timestamp).toLocaleTimeString(),
                                endpoint: `生成图片${elapsedStr}`,
                                error: entry.error,
                                request: `[模型] ${entry.model}\n[尺寸] ${entry.width}×${entry.height}\n[批次] ${entry.batchSize}\n[正向提示词]\n${entry.prompt}${entry.negativePrompt ? `\n\n[反向提示词]\n${entry.negativePrompt}` : ""}`,
                                httpErrorBody: `错误类型: ${entry.error?.includes("超时") ? "生成超时（5分钟）" : "生成失败"}\n记录时间: ${new Date(entry.createdAt || entry.timestamp).toLocaleString()}${entry.createdAt ? `\n开始时间: ${new Date(entry.createdAt).toLocaleString()}` : ""}${elapsedMs ? `\n总耗时: ${Math.floor(elapsedMs / 60000)}分${Math.floor((elapsedMs % 60000) / 1000)}秒` : ""}`,
                              };
                              useUiStore.getState().setSelectedLogEntry(errorLog);
                              useUiStore.getState().setShowDetailedLog(true);
                            } else if (firstImg) {
                              setHistoryFullPreview(firstImg);
                            }
                          }
                        }}
                      >
                        {/* 批量选择checkbox */}
                        {historyBatchMode && (
                          <div className="flex items-center mb-1.5">
                            <div className={`w-4 h-4 rounded border flex items-center justify-center transition ${
                              historySelected.has(entry.id) ? "bg-primary-500 border-primary-500" : "border-white/50"
                            }`}>
                              {historySelected.has(entry.id) && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                            </div>
                          </div>
                        )}
                        {/* 图片预览 */}
                        <div className="flex gap-2 items-start">
                          {firstImg ? (
                            <img
                              src={firstImg.url}
                              alt=""
                              className="w-14 h-14 rounded-lg object-cover flex-shrink-0 bg-slate-700 cursor-zoom-in hover:ring-2 hover:ring-primary-400 transition"
                              onDoubleClick={() => setHistoryFullPreview(firstImg)}
                              title="双击查看大图"
                            />
                          ) : (
                            <div className="w-14 h-14 rounded-lg bg-slate-700/60 flex items-center justify-center flex-shrink-0">
                              {hasError ? (
                                <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                              ) : (
                                <svg className="w-5 h-5 text-slate-500 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                              )}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed">{entry.prompt}</p>
                            <div className="flex items-center gap-1 mt-1 flex-wrap">
                              <span className="text-[9px] text-slate-400">{entry.time}</span>
                              <span className="text-[9px] px-1 bg-slate-100 dark:bg-slate-700 rounded text-slate-500">{entry.model}</span>
                              {entry.results.length > 0 && <span className="text-[9px] text-primary-500">{entry.results.length}张</span>}
                              {isPending && <span className="text-[9px] text-amber-500 animate-pulse">生图中...</span>}
                              {hasError && <span className="text-[9px] text-red-400 line-clamp-1">{entry.error}</span>}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </>
            )}
          </div>

          {/* 批量操作栏 */}
          {historyBatchMode && historySelected.size > 0 && (
            <div className="flex-shrink-0 px-3 py-2 border-t border-white/20 bg-white/10 flex items-center gap-2">
              <span className="text-xs text-white/80">已选 {historySelected.size}</span>
              <button
                onClick={() => {
                  setGenerationHistory(prev => {
                    const filtered = prev.filter(h => !historySelected.has(h.id));
                    saveHistory(filtered);
                    return filtered;
                  });
                  setHistorySelected(new Set());
                }}
                className="px-2 py-1 rounded bg-red-500/70 text-white text-[11px] hover:bg-red-500 transition"
              >删除</button>
              <button onClick={() => { setHistoryBatchMode(false); setHistorySelected(new Set()); }}
                className="px-2 py-1 rounded bg-white/20 text-white/80 text-[11px] hover:bg-white/30 transition">取消</button>
            </div>
          )}
        </div>

        {/* 右侧生成结果区 - 毛玻璃 等高布局，自适应剩余宽度 */}
        <section className={`flex-1 min-w-[200px] glass-card rounded-2xl flex flex-col overflow-hidden ${status === "running" ? "generating-pulse" : ""}`}>
          <div className="px-4 py-3 border-b border-white/30 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2 text-sm text-slate-700">
              <span className="font-semibold">生成结果</span>
              {results.length > 0 && <span className="badge-primary">{results.length} 张</span>}
              {results.length > 0 && elapsedSeconds > 0 && (() => {
                const mins = Math.floor(elapsedSeconds / 60);
                const secs = elapsedSeconds % 60;
                return <span className="badge-primary/60 text-slate-500 font-mono">{mins > 0 ? `${mins}分${secs}秒` : `${secs}秒`}</span>;
              })()}
              {selectedImageIds.size > 0 && <span className="badge-success">已选 {selectedImageIds.size}</span>}
              {storeStatus === "running" && (() => {
                const mins = Math.floor(elapsedSeconds / 60);
                const secs = elapsedSeconds % 60;
                return <span className="badge-warning flex items-center gap-1"><span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />生成中 {mins > 0 ? `(${mins}分${secs}秒)` : `(${secs}秒)`}</span>;
              })()}
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              {results.length > 0 && (
                <>
                  <button onClick={toggleSelectAll} className="px-2.5 py-1 rounded-lg border border-white/50 bg-white/40 hover:bg-white/70 transition text-xs btn-hover-lift">
                    {selectedImageIds.size === results.length ? "取消全选" : "全选"}
                  </button>
                  <button
                    onClick={handleBatchDownload}
                    disabled={selectedImageIds.size === 0 || downloadStatus === "downloading"}
                    className="px-2.5 py-1 rounded-lg border border-white/50 bg-white/40 hover:bg-white/70 disabled:opacity-40 disabled:cursor-not-allowed transition text-xs btn-hover-lift"
                  >
                    {downloadStatus === "downloading" ? "下载中..." : "批量下载"}
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="flex-1 flex items-center justify-center overflow-auto app-scrollbar">
            {status === "running" && results.length === 0 ? (
              /* 骨架屏 */
              <div className="w-full h-full p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {Array.from({ length: batchSize }).map((_, i) => (
                  <div key={i} className="rounded-xl overflow-hidden">
                    <div className="skeleton w-full h-40" />
                    <div className="p-2 space-y-1.5">
                      <div className="skeleton h-2.5 w-3/4" />
                      <div className="skeleton h-2 w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : results.length === 0 ? (
              /* 精美空状态 */
              <div className="flex flex-col items-center justify-center text-slate-400 h-full px-8 py-12">
                <div className="empty-placeholder w-56 h-40 flex flex-col items-center justify-center mb-6 group cursor-default">
                  <div className="grid grid-cols-3 gap-2 mb-3 opacity-30">
                    {["bg-purple-200","bg-blue-200","bg-pink-200","bg-amber-200","bg-green-200","bg-cyan-200"].map((c,i)=>(
                      <div key={i} className={`w-8 h-8 rounded-lg ${c}`} />
                    ))}
                  </div>
                  <p className="text-xs text-slate-400 font-medium">你的作品将在这里展示</p>
                </div>
                <p className="text-sm font-medium text-slate-500 mb-1">暂无生成结果</p>
                <p className="text-xs text-slate-400 text-center leading-relaxed max-w-[200px]">在右侧输入提示词，<br/>选择模型后点击「开始生图」</p>
              </div>
            ) : (
              (() => {
                // 安全索引检查，防止空数组导致的错误
                if (results.length === 0) {
                  return <div className="w-full h-full flex items-center justify-center text-slate-400">暂无图片</div>;
                }
                const safeIdx = Math.min(Math.max(resultActiveIdx, 0), results.length - 1);
                const activeImg = results[safeIdx];
                // 扩展类型，支持 originalUrl（原图 URL）
                const extendedImg = activeImg as typeof activeImg & { originalUrl?: string };
                // 优先用缩略图（base64，稳定），备用原图 URL（可能已失效）
                const activeImgUrl = activeImg.url || extendedImg.originalUrl;
                const isSelected = selectedImageIds.has(activeImg.id);
                return (
                  <div className="w-full h-full flex flex-col">
                    {/* 主图区 - 填满结果区 */}
                    <div
                      className="flex-1 relative overflow-hidden cursor-pointer group"
                      onClick={() => { setPreviewImage(activeImg); }}
                    >
                      <img
                        src={activeImgUrl}
                        alt=""
                        className="w-full h-full object-contain"
                        draggable={false}
                        onError={(e) => {
                          // 缩略图也失败时再提示
                          const parent = e.currentTarget.parentElement;
                          if (parent) {
                            parent.innerHTML = '<div class="flex items-center justify-center w-full h-full text-slate-400">图片加载失败</div>';
                          }
                        }}
                      />
                      {/* 删除按钮 */}
                      <button
                        className="absolute top-2 left-2 w-8 h-8 rounded-full bg-red-500/80 hover:bg-red-600 text-white flex items-center justify-center transition opacity-0 group-hover:opacity-100 z-10"
                        onClick={(e) => { e.stopPropagation(); setResults((prev) => prev.filter((_, i) => i !== safeIdx)); setResultActiveIdx(0); }}
                        title="删除此图片"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                      {/* 左右切换箭头（多图时显示） */}
                      {results.length > 1 && (
                        <>
                          <button
                            className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center transition opacity-0 group-hover:opacity-100 text-xl leading-none"
                            onClick={(e) => { e.stopPropagation(); setResultActiveIdx((i) => (i - 1 + results.length) % results.length); }}
                          >‹</button>
                          <button
                            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center transition opacity-0 group-hover:opacity-100 text-xl leading-none"
                            onClick={(e) => { e.stopPropagation(); setResultActiveIdx((i) => (i + 1) % results.length); }}
                          >›</button>
                          {/* 图片计数角标 */}
                          <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-black/50 text-white text-[10px] font-medium">
                            {safeIdx + 1} / {results.length}
                          </div>
                        </>
                      )}
                    </div>
                    {/* 缩略图横条（多图时显示） */}
                    {results.length > 1 && (
                      <div className="flex-shrink-0 flex gap-1.5 px-2 py-2 overflow-x-auto app-scrollbar border-t border-white/20">
                        {results.map((img, idx) => {
                          // 扩展类型，支持 originalUrl（原图 URL）
                          const extImg = img as typeof img & { originalUrl?: string };
                          const thumbUrl = img.url || extImg.originalUrl;
                          return (
                            <div key={img.id} className="relative flex-shrink-0">
                              <button
                                onClick={() => setResultActiveIdx(idx)}
                                className={`w-12 h-12 rounded-lg overflow-hidden border-2 transition-all ${idx === safeIdx ? "border-primary-400 ring-1 ring-primary-300" : "border-transparent hover:border-white/60"}`}
                              >
                                <img src={thumbUrl} alt="" className="w-full h-full object-cover" />
                              </button>
                              <button
                                className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-red-500/90 hover:bg-red-600 text-white flex items-center justify-center transition text-xs leading-none"
                                onClick={(e) => { e.stopPropagation(); setResults((prev) => prev.filter((_, i) => i !== idx)); if (idx < safeIdx) setResultActiveIdx(safeIdx - 1); else if (idx === safeIdx && results.length > 1) setResultActiveIdx(Math.min(safeIdx, results.length - 2)); }}
                                title="删除此图片"
                              >
                                ×
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()
            )}
          </div>
        </section>

      {/* 图片预览模态框 */}
      <ImagePreviewModal
        image={previewImage}
        onClose={() => {
          setPreviewImage(null);
          if (document.fullscreenElement) document.exitFullscreen?.().catch(()=>{});
        }}
      />

      {/* 详细日志弹窗 */}
      <DetailedLogDialog />










      {/* ── 模型选择弹窗（获取模型列表后弹出）────────────────────── */}
      {modelPickerOpen && (() => {
        // 计算经过筛选+搜索后的模型列表
        const allGroups = groupModelsByCategory(modelPickerList);
        const searchedGroups = filterGroupsBySearch(allGroups, modelPickerSearch);
        const filteredGroups = filterGroupsByTags(searchedGroups, modelPickerCategoryTag, modelPickerVendorTag);
        const filteredModels = filteredGroups.flatMap((g) => g.models);

        // 厂商列表（动态，基于当前拉取到的模型）
        const dynamicVendors = Array.from(new Set(
          modelPickerList.map((id) => {
            const info = getModelDisplayInfo(id);
            return info.vendorTag;
          }).filter(Boolean)
        ));

        const toggleModel = (mid: string) => {
          setModelPickerSelected((prev) => {
            const next = new Set(prev);
            if (next.has(mid)) next.delete(mid);
            else next.add(mid);
            return next;
          });
        };

        const toggleAll = () => {
          const allSelected = filteredModels.every((id) => modelPickerSelected.has(id));
          setModelPickerSelected((prev) => {
            const next = new Set(prev);
            if (allSelected) filteredModels.forEach((id) => next.delete(id));
            else filteredModels.forEach((id) => next.add(id));
            return next;
          });
        };

        return (
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center"
            style={{ background: "rgba(15,23,42,0.55)", backdropFilter: "blur(4px)" }}
            onClick={() => setModelPickerOpen(false)}
          >
            <div
              className="bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
              style={{ width: 860, maxWidth: "96vw", height: 580, maxHeight: "92vh" }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* 头部 */}
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 flex-shrink-0">
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">选择模型</h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">共 {modelPickerList.length} 个模型 · 已选 {modelPickerSelected.size} 个</p>
                </div>
                <div className="flex items-center gap-2">
                  {/* 搜索框 */}
                  <div className="relative">
                    <svg className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    <input
                      type="text"
                      placeholder="搜索模型…"
                      value={modelPickerSearch}
                      onChange={(e) => setModelPickerSearch(e.target.value)}
                      className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-300 w-44"
                    />
                  </div>
                  <button onClick={() => setModelPickerOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              </div>

              {/* 主体：左侧筛选 + 右侧列表 */}
              <div className="flex flex-1 overflow-hidden">
                {/* 左侧筛选面板 */}
                <div className="w-44 flex-shrink-0 border-r border-slate-100 overflow-y-auto py-3 px-2.5 flex flex-col gap-4">
                  {/* 模型类型 */}
                  <div>
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5 px-1">模型类型</p>
                    <div className="flex flex-col gap-0.5">
                      <button
                        onClick={() => setModelPickerCategoryTag(null)}
                        className={`text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors ${modelPickerCategoryTag === null ? "bg-primary-50 text-primary-600 font-medium" : "text-slate-600 hover:bg-slate-50"}`}
                      >
                        全部类型
                      </button>
                      {MODEL_CATEGORY_TAGS.map((tag) => (
                        <button
                          key={tag}
                          onClick={() => setModelPickerCategoryTag(modelPickerCategoryTag === tag ? null : tag)}
                          className={`text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors ${modelPickerCategoryTag === tag ? "bg-primary-50 text-primary-600 font-medium" : "text-slate-600 hover:bg-slate-50"}`}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 模型厂商 */}
                  {dynamicVendors.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5 px-1">模型厂商</p>
                      <div className="flex flex-col gap-0.5">
                        <button
                          onClick={() => setModelPickerVendorTag(null)}
                          className={`text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors ${modelPickerVendorTag === null ? "bg-violet-50 text-violet-600 font-medium" : "text-slate-600 hover:bg-slate-50"}`}
                        >
                          全部厂商
                        </button>
                        {dynamicVendors.map((tag) => (
                          <button
                            key={tag}
                            onClick={() => setModelPickerVendorTag(modelPickerVendorTag === tag ? null : tag)}
                            className={`text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors ${modelPickerVendorTag === tag ? "bg-violet-50 text-violet-600 font-medium" : "text-slate-600 hover:bg-slate-50"}`}
                          >
                            {tag}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* 右侧模型列表 */}
                <div className="flex-1 flex flex-col overflow-hidden">
                  {/* 列表头部：全选 + 计数 */}
                  <div className="px-4 py-2 border-b border-slate-50 flex items-center justify-between flex-shrink-0">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={toggleAll}
                        className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-primary-600 transition-colors"
                      >
                        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors flex-shrink-0 ${
                          filteredModels.length > 0 && filteredModels.every((id) => modelPickerSelected.has(id))
                            ? "bg-primary-500 border-primary-500"
                            : filteredModels.some((id) => modelPickerSelected.has(id))
                            ? "bg-primary-100 border-primary-300"
                            : "border-slate-300 bg-white"
                        }`}>
                          {filteredModels.length > 0 && filteredModels.every((id) => modelPickerSelected.has(id)) && (
                            <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                          )}
                        </div>
                        全选当前视图
                      </button>
                      <span className="text-[11px] text-slate-400">（显示 {filteredModels.length} 个）</span>
                    </div>
                    {modelPickerSelected.size > 0 && (
                      <button
                        onClick={() => setModelPickerSelected(new Set())}
                        className="text-[11px] text-slate-400 hover:text-red-400 transition-colors"
                      >
                        清除全选
                      </button>
                    )}
                  </div>

                  {/* 模型列表（按分类分组） */}
                  <div className="flex-1 overflow-y-auto px-3 py-2">
                    {filteredGroups.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-40 text-slate-400">
                        <svg className="w-10 h-10 text-slate-200 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                        <p className="text-xs">无匹配结果</p>
                      </div>
                    ) : (
                      filteredGroups.map((group) => (
                        <div key={group.category} className="mb-3">
                          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-1 mb-1.5 sticky top-0 bg-white py-0.5">{group.category}</p>
                          <div className="grid grid-cols-2 gap-1">
                            {group.models.map((mid) => {
                              const info = getModelDisplayInfo(mid);
                              const price = getModelPrice(mid);
                              const selected = modelPickerSelected.has(mid);
                              return (
                                <button
                                  key={mid}
                                  onClick={() => toggleModel(mid)}
                                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition-all ${
                                    selected
                                      ? "border-primary-300 bg-primary-50 shadow-sm"
                                      : "border-slate-100 bg-white hover:border-slate-200 hover:bg-slate-50"
                                  }`}
                                >
                                  <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                                    selected ? "bg-primary-500 border-primary-500" : "border-slate-300 bg-white"
                                  }`}>
                                    {selected && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[11px] font-mono text-slate-700 truncate leading-tight">{mid}</p>
                                    <div className="flex items-center gap-1 mt-0.5">
                                      {info.vendorTag && <span className="text-[9px] text-violet-500 bg-violet-50 px-1 py-0.5 rounded font-medium leading-none">{info.vendorTag}</span>}
                                      <span className="text-[9px] text-emerald-600 font-medium leading-none">{price.price}</span>
                                    </div>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* 底部操作栏 */}
              <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 flex-shrink-0 bg-slate-50/60">
                <span className="text-xs text-slate-400">已选 <span className="font-semibold text-slate-700">{modelPickerSelected.size}</span> 个模型，点击确认后同步到 {modelPickerMode === "image" ? "Image" : "Chat"} 模型列表</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setModelPickerOpen(false)}
                    className="px-4 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-sm hover:bg-slate-100 transition"
                  >
                    取消
                  </button>
                  <button
                    onClick={() => {
                      const selectedArr = Array.from(modelPickerSelected);
                      const pickerModelIds = new Set(modelPickerList);

                      if (modelPickerMode === "image") {
                        // ── 写入 imageModels ──
                        const existingMap = new Map(cfgDraft.imageModels.map((m) => [m.modelId, m]));
                        const manualModels = cfgDraft.imageModels.filter((m) => !pickerModelIds.has(m.modelId));
                        const pickerModels: ImageModel[] = selectedArr.map((mid) => {
                          const existing = existingMap.get(mid);
                          if (existing) return existing;
                          return { id: Math.random().toString(36).slice(2) + Date.now().toString(36), modelId: mid, label: mid, apiKey: "", baseUrl: "" };
                        });
                        const nextModels = [...manualModels, ...pickerModels];
                        const activeStillExists = nextModels.find((m) => m.id === cfgDraft.activeImageModelId);
                        setCfgDraft((d) => ({
                          ...d,
                          imageModels: nextModels,
                          activeImageModelId: activeStillExists ? d.activeImageModelId : (nextModels[0]?.id ?? "")
                        }));
                      } else {
                        // ── 写入 chatModels ──
                        const existingMap = new Map(cfgDraft.chatModels.map((m) => [m.modelId, m]));
                        const manualModels = cfgDraft.chatModels.filter((m) => !pickerModelIds.has(m.modelId));
                        const pickerModels: ChatModel[] = selectedArr.map((mid) => {
                          const existing = existingMap.get(mid);
                          if (existing) return existing;
                          return { id: Math.random().toString(36).slice(2) + Date.now().toString(36), modelId: mid, label: mid, apiKey: "", baseUrl: "" };
                        });
                        const nextModels = [...manualModels, ...pickerModels];
                        setCfgDraft((d) => ({ ...d, chatModels: nextModels }));
                      }

                      setModelPickerOpen(false);
                    }}
                    className="px-5 py-1.5 rounded-lg bg-primary-500 text-white text-sm font-medium hover:bg-primary-600 transition"
                  >
                    确认（{modelPickerSelected.size}）
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── 历史记录全屏预览弹窗（完整缩放/拖动/保存） ─────────────────────── */}
      <HistoryFullPreview
        image={historyFullPreview}
        onClose={() => setHistoryFullPreview(null)}
      />

      {/* 历史按钮 - 切换历史栏显示/隐藏 */}
      <div
        className="fixed left-0 z-40 cursor-move"
        style={{ top: historyBtnPosition }}
        onMouseDown={() => setIsDraggingHistory(true)}
      >
        <button
          className={`px-2.5 py-1.5 rounded-r-full text-white text-[11px] font-medium shadow-md hover:shadow-lg transition-all flex items-center gap-1 bg-gradient-to-r ${
            historyPanelOpen
              ? "from-rose-500 to-red-600 ring-2 ring-red-300"
              : "from-primary-500/80 to-purple-500/80 backdrop-blur-sm"
          }`}
          onClick={(e) => {
            e.stopPropagation();
            setHistoryPanelOpen(!historyPanelOpen);
          }}
        >
          <svg className="w-2.5 h-2.5 opacity-90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>历史</span>
        </button>
      </div>

      {/* ── 优化3：生成比例不一致确认弹窗 ─────────────────────────────────── */}
      <RatioMismatchDialog
        data={ratioMismatchDialog}
        onDismiss={() => setRatioMismatchDialog(null)}
        onRegenerate={() => {
          setRatioMismatchDialog(null);
          setTimeout(() => handleGenerate(), 100);
        }}
      />

      {/* ── 优化5：主界面模型选择弹窗 ──────────────────────────────────────── */}
      {mainModelPickerOpen && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center"
          style={{ background: "rgba(15,23,42,0.6)", backdropFilter: "blur(6px)" }}
          onClick={() => setMainModelPickerOpen(false)}
        >
          <div
            className="glass-popup rounded-2xl shadow-2xl flex flex-col overflow-hidden popup-enter"
            style={{ width: 520, maxWidth: "96vw", maxHeight: "80vh" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-white/30 flex items-center justify-between flex-shrink-0">
              <div>
                <h3 className="text-sm font-bold text-slate-800">生图模型管理</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">勾选后的模型将参与生图，取消勾选则跳过</p>
              </div>
              <button onClick={() => setMainModelPickerOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto app-scrollbar p-3 space-y-1">
              {(() => {
                const cfg = getApiConfig();
                const imgModels = cfg.imageModels.filter((m) => m.modelId.trim());
                if (imgModels.length === 0) {
                  return (
                    <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                      <svg className="w-10 h-10 text-slate-200 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                      <p className="text-sm">暂无可用模型</p>
                      <p className="text-xs text-slate-300 mt-1">请先在「设置 → Image」中添加模型</p>
                    </div>
                  );
                }
                return imgModels.map((m) => {
                  const isChecked = mainModelPickerSelected.has(m.id);
                  const spec = resolveApiSpec(m, cfg);
                  const priceInfo = getModelPrice(m.modelId);
                  return (
                    <label
                      key={m.id}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-all ${isChecked ? "bg-primary-50/80 border-primary-300" : "bg-white/60 border-white/40 hover:bg-white/80 hover:border-primary-200"}`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          setMainModelPickerSelected((prev) => {
                            const next = new Set(prev);
                            if (next.has(m.id)) next.delete(m.id);
                            else next.add(m.id);
                            return next;
                          });
                        }}
                        className="w-4 h-4 rounded text-primary-500 flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-mono truncate ${isChecked ? "text-primary-700 font-medium" : "text-slate-700"}`}>{m.modelId}</p>
                        {m.label && m.label !== m.modelId && <p className="text-[10px] text-slate-400 truncate">{m.label}</p>}
                        {/* 价格信息 */}
                        <p className="text-[11px] text-slate-400 mt-0.5 leading-tight">
                          {priceInfo.price !== "询价"
                            ? <>单次：<span className="text-emerald-600 font-medium">{priceInfo.price}</span>{priceInfo.note && <span className="ml-1 text-[9px] bg-slate-100 text-slate-500 px-1 rounded">{priceInfo.note}</span>}</>
                            : <span className="text-slate-300">暂无定价</span>
                          }
                        </p>
                      </div>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium flex-shrink-0 ${spec === "gemini" ? "bg-purple-50 text-purple-600 border border-purple-200" : "bg-blue-50 text-blue-600 border border-blue-200"}`}>
                        {spec === "gemini" ? "Gemini" : "OpenAI"}
                      </span>
                    </label>
                  );
                });
              })()}
            </div>
            <div className="px-5 py-3 border-t border-white/30 flex items-center justify-between flex-shrink-0">
              <span className="text-xs text-slate-500">已勾选 <span className="font-semibold text-slate-700">{mainModelPickerSelected.size}</span> 个</span>
              <div className="flex gap-2">
                <button className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm hover:bg-slate-50 transition" onClick={() => setMainModelPickerOpen(false)}>取消</button>
                <button
                  className="px-5 py-2 rounded-xl bg-primary-500 text-white text-sm font-medium hover:bg-primary-600 transition"
                  onClick={() => {
                    const cfg = getApiConfig();
                    const selectedModels = cfg.imageModels.filter((m) => mainModelPickerSelected.has(m.id) && m.modelId.trim());
                    if (selectedModels.length > 0) {
                      const ids = selectedModels.map((m) => m.modelId);
                      setModelList(ids);
                      setModel((prev) => ids.includes(prev) ? prev : ids[0]);
                    }
                    setMainModelPickerOpen(false);
                  }}
                >确认</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 优化4：供应商管理弹窗 ──────────────────────────────────────────── */}
      {vendorDialogOpen && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center"
          style={{ background: "rgba(15,23,42,0.45)" }}
          onClick={() => { setVendorDialogOpen(false); setVendorEditingId(null); }}
        >
          <div
            className="rounded-2xl shadow-2xl flex flex-col overflow-hidden popup-enter"
            style={{ width: 580, maxWidth: "96vw", maxHeight: "80vh", background: "rgba(255,255,255,0.98)", border: "1px solid #e2e8f0" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 标题栏 */}
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between flex-shrink-0 bg-gradient-to-r from-indigo-50 to-blue-50">
              <div>
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <svg className="w-4 h-4 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                  API 供应商管理
                  {cfgDraft.apiVendors?.length > 0 && <span className="text-[11px] bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full font-medium">{cfgDraft.apiVendors.length} 个</span>}
                </h3>
                <p className="text-[10px] text-slate-400 mt-0.5">在上方填写信息后点击「保存」即可添加；点击 ✏️ 可编辑各项信息</p>
              </div>
              <button onClick={() => { setVendorDialogOpen(false); setVendorEditingId(null); }} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* 供应商列表 */}
            <div className="flex-1 overflow-y-auto app-scrollbar p-4 min-h-0">
              {cfgDraft.apiVendors.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-xs border border-dashed border-slate-200 rounded-xl">
                  <svg className="w-10 h-10 mx-auto mb-3 opacity-25" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                  <p className="font-medium text-slate-400">暂无供应商</p>
                  <p className="mt-1 text-slate-300">在「模型接口配置」填写 Base URL、API Key 和供应商名称后点击「保存」即可添加</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {cfgDraft.apiVendors.map((vendor) => {
                    const isActive = cfgDraft.activeVendorId === vendor.id;
                    const isDefault = vendor.isDefault;
                    const isEditing = vendorEditingId === vendor.id;
                    return (
                      <div
                        key={vendor.id}
                        className={`rounded-xl border transition-all ${
                          isEditing ? "border-amber-300 bg-amber-50/40 shadow-sm"
                          : isActive ? "border-primary-200 bg-primary-50/40 shadow-sm"
                          : "border-slate-200 bg-white hover:border-slate-300"
                        }`}
                      >
                        {/* 展示行 */}
                        <div className="flex items-start gap-3 px-3.5 py-2.5">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className={`text-sm font-semibold truncate ${isActive ? "text-primary-700" : "text-slate-700"}`}>{vendor.name}</p>
                              {isActive && <span className="text-[10px] bg-primary-100 text-primary-600 px-1.5 py-0.5 rounded-full font-medium flex-shrink-0">当前使用</span>}
                              {isDefault && <span className="text-[10px] bg-emerald-100 text-emerald-600 px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 flex items-center gap-0.5"><svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>默认</span>}
                            </div>
                            <p className="text-[10px] text-slate-400 font-mono truncate mt-0.5">{vendor.baseUrl}</p>
                            {vendor.apiKey && (
                              <p className="text-[10px] text-slate-400 mt-0.5 font-mono">
                                Key: {vendor.apiKey.length > 8 ? vendor.apiKey.slice(0, 4) + "••••" + vendor.apiKey.slice(-4) : "••••••••"}
                              </p>
                            )}
                            {vendor.remark && <p className="text-[10px] text-slate-500 mt-0.5 italic">备注：{vendor.remark}</p>}
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
                            {/* 设为默认 */}
                            <button
                              title={isDefault ? "已是默认供应商" : "设为默认（启动时自动应用）"}
                              className={`p-1.5 rounded-lg border transition ${isDefault ? "border-emerald-200 bg-emerald-50 text-emerald-500" : "border-slate-200 text-slate-400 hover:border-emerald-200 hover:text-emerald-500 hover:bg-emerald-50"}`}
                              onClick={() => {
                                const updated = setDefaultApiVendor(isDefault ? "" : vendor.id);
                                setCfgDraft((d) => ({ ...d, apiVendors: updated.apiVendors }));
                              }}
                            >
                              <svg className="w-3 h-3" fill={isDefault ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
                            </button>
                            {/* 切换使用 */}
                            <button
                              title="切换为当前使用的供应商"
                              className={`px-2 py-1.5 rounded-lg text-xs font-medium transition border ${isActive ? "border-primary-200 bg-primary-50 text-primary-600 hover:bg-primary-100" : "border-slate-200 bg-white text-slate-600 hover:border-primary-200 hover:text-primary-600 hover:bg-primary-50"}`}
                              onClick={() => {
                                const updated = switchApiVendor(vendor.id);
                                setCfgDraft((d) => ({
                                  ...d,
                                  globalBaseUrl: vendor.baseUrl,
                                  globalApiKey: vendor.apiKey?.trim() ? vendor.apiKey.trim() : d.globalApiKey,
                                  activeVendorId: vendor.id,
                                  apiVendors: updated.apiVendors
                                }));
                              }}
                            >
                              {isActive ? "✓ 使用中" : "使用"}
                            </button>
                            {/* 编辑 */}
                            <button
                              title="编辑此供应商"
                              className={`p-1.5 rounded-lg border transition ${isEditing ? "border-amber-300 bg-amber-100 text-amber-600" : "border-slate-200 text-slate-400 hover:border-amber-200 hover:text-amber-500 hover:bg-amber-50"}`}
                              onClick={() => {
                                if (isEditing) {
                                  setVendorEditingId(null);
                                } else {
                                  setVendorEditingId(vendor.id);
                                  setVendorNameInput(vendor.name);
                                  setVendorUrlInput(vendor.baseUrl);
                                  setVendorApiKeyInput(vendor.apiKey || "");
                                  setVendorRemarkInput(vendor.remark || "");
                                }
                              }}
                            >
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                            </button>
                            {/* 删除 */}
                            {vendorDeleteConfirm === vendor.id ? (
                              <div className="flex gap-1 items-center">
                                <button
                                  className="px-2 py-1 rounded-lg text-xs bg-red-500 text-white hover:bg-red-600 transition"
                                  onClick={() => {
                                    const updated = removeApiVendor(vendor.id);
                                    setCfgDraft((d) => ({ ...d, apiVendors: updated.apiVendors, activeVendorId: updated.activeVendorId, globalBaseUrl: updated.globalBaseUrl }));
                                    setVendorDeleteConfirm(null);
                                    if (vendorEditingId === vendor.id) setVendorEditingId(null);
                                  }}
                                >是</button>
                                <button className="px-2 py-1 rounded-lg text-xs border border-slate-200 text-slate-500 hover:bg-slate-50 transition" onClick={() => setVendorDeleteConfirm(null)}>否</button>
                              </div>
                            ) : (
                              <button
                                title="删除此供应商"
                                className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-red-500 hover:border-red-200 hover:bg-red-50 transition"
                                onClick={() => setVendorDeleteConfirm(vendor.id)}
                              >
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                              </button>
                            )}
                          </div>
                        </div>
                        {/* 内联编辑展开区 */}
                        {isEditing && (
                          <div className="px-3.5 pb-3 border-t border-amber-100">
                            <div className="grid grid-cols-2 gap-2 mt-2.5 mb-2">
                              <div>
                                <label className="block text-[10px] text-slate-500 mb-0.5 font-medium">供应商名称</label>
                                <input type="text" className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-amber-100 focus:border-amber-400" value={vendorNameInput} onChange={(e) => setVendorNameInput(e.target.value)} />
                              </div>
                              <div>
                                <label className="block text-[10px] text-slate-500 mb-0.5 font-medium">Base URL</label>
                                <input type="url" className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-amber-100 focus:border-amber-400 font-mono" value={vendorUrlInput} onChange={(e) => setVendorUrlInput(e.target.value)} />
                              </div>
                              <div>
                                <label className="block text-[10px] text-slate-500 mb-0.5 font-medium">API Key（可选）</label>
                                <input type="password" autoComplete="off" className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-amber-100 focus:border-amber-400 font-mono" value={vendorApiKeyInput} onChange={(e) => setVendorApiKeyInput(e.target.value)} />
                              </div>
                              <div>
                                <label className="block text-[10px] text-slate-500 mb-0.5 font-medium">备注（可选）</label>
                                <input type="text" className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-amber-100 focus:border-amber-400" value={vendorRemarkInput} onChange={(e) => setVendorRemarkInput(e.target.value)} />
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <button
                                disabled={!vendorNameInput.trim() || !vendorUrlInput.trim()}
                                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-500 hover:bg-amber-600 text-white transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                                onClick={() => {
                                  if (!vendorNameInput.trim() || !vendorUrlInput.trim()) return;
                                  const updated = updateApiVendor(vendor.id, {
                                    name: vendorNameInput.trim(),
                                    baseUrl: vendorUrlInput.trim(),
                                    apiKey: vendorApiKeyInput.trim() || undefined,
                                    remark: vendorRemarkInput.trim() || undefined
                                  });
                                  setCfgDraft((d) => ({ ...d, apiVendors: updated.apiVendors, globalBaseUrl: updated.globalBaseUrl }));
                                  setVendorEditingId(null);
                                }}
                              >
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                保存修改
                              </button>
                              <button className="px-3 py-1.5 rounded-lg text-xs border border-slate-200 text-slate-500 hover:bg-slate-100 transition" onClick={() => setVendorEditingId(null)}>取消</button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between flex-shrink-0 bg-slate-50/60">
              <p className="text-[10px] text-slate-400">⭐ 设为默认 = 下次打开时自动应用该供应商</p>
              <button
                className="px-5 py-2 rounded-xl bg-primary-500 text-white text-sm font-medium hover:bg-primary-600 transition shadow-sm"
                onClick={() => {
                  saveApiConfig(cfgDraft);
                  setVendorDialogOpen(false);
                  setVendorEditingId(null);
                }}
              >完成</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 优化5：提示词优化弹窗 ────────────────────────────────────────────── */}
      <PromptOptimizerDialog
        open={promptOptimizeDialogOpen}
        onClose={() => setPromptOptimizeDialogOpen(false)}
        originalPrompt={prompt.trim()}
        onAdopt={(optimized) => setPrompt(optimized)}
      />

      {/* ── 管理/历史弹窗（统一） ───────────────────────────────────────────── */}
      {manageDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overlay-dark" onClick={() => setManageDialogOpen(false)}>
          <div
            className="glass-popup rounded-2xl overflow-hidden flex flex-col popup-enter"
            style={{ width: manageModalSize.w, height: manageModalSize.h, minHeight: 400, minWidth: 520 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 标题栏 */}
            <div className="px-5 py-3 border-b border-slate-200/60 flex items-center justify-between bg-white/40">
              <h3 className="text-sm font-semibold text-slate-800">
                {manageDialogType === "template" ? "📁 提示词模板管理" : "📋 生成历史管理"}
              </h3>
              <button
                type="button"
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                onClick={() => setManageDialogOpen(false)}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* 内容区 */}
            <div className="flex-1 overflow-auto p-4">
              {/* 内联编辑表单 */}
              {inlineEditing ? (
                <div className="bg-white rounded-xl border-2 border-primary-200 p-4 mb-4 shadow-sm">
                  <div className="flex items-center justify-between mb-3 pb-3 border-b border-slate-100">
                    <h4 className="text-sm font-semibold text-primary-600">
                      {manageDialogType === "template" ? "✏️ 编辑模板" : "✏️ 编辑历史记录"}
                    </h4>
                    <button
                      type="button"
                      className="text-slate-400 hover:text-slate-600 transition-colors"
                      onClick={handleInlineCancelEdit}
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  
                  <div className="space-y-3">
                    {/* 模板名称（仅模板编辑） */}
                    {manageDialogType === "template" && (
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">模板名称</label>
                        <input
                          type="text"
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-400"
                          value={inlineEditName}
                          onChange={(e) => setInlineEditName(e.target.value)}
                          placeholder="输入模板名称..."
                        />
                      </div>
                    )}
                    
                    {/* 正向提示词 */}
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        {manageDialogType === "template" ? "正向提示词" : "提示词（只读）"}
                      </label>
                      <textarea
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-400 resize-none"
                        rows={3}
                        value={inlineEditPrompt}
                        onChange={(e) => setInlineEditPrompt(e.target.value)}
                        disabled={manageDialogType === "history"}
                        style={manageDialogType === "history" ? { backgroundColor: "#f8fafc" } : {}}
                        placeholder="输入提示词..."
                      />
                    </div>
                    
                    {/* 反向提示词 */}
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">反向提示词</label>
                      <textarea
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-400 resize-none"
                        rows={2}
                        value={inlineEditNegative}
                        onChange={(e) => setInlineEditNegative(e.target.value)}
                        placeholder="输入反向提示词（可选）..."
                      />
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-100">
                    <button
                      type="button"
                      className="px-3 py-1.5 rounded-lg text-xs border border-red-200 text-red-500 hover:bg-red-50 transition"
                      onClick={handleInlineDeleteEdit}
                    >
                      删除条目
                    </button>
                    <div className="flex-1"></div>
                    <button
                      type="button"
                      className="px-3 py-1.5 rounded-lg text-xs border border-slate-200 text-slate-600 hover:bg-slate-50 transition"
                      onClick={handleInlineCancelEdit}
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      className="px-4 py-1.5 rounded-lg text-xs font-medium bg-primary-500 text-white hover:bg-primary-600 transition shadow-sm"
                      onClick={handleInlineSaveEdit}
                    >
                      保存修改
                    </button>
                  </div>
                </div>
              ) : null}
              
              {manageDialogType === "template" ? (
                /* 模板列表 + 输入历史 */
                <div className="space-y-4">
                  {/* 模板列表 */}
                  {promptTemplates.length > 0 ? (
                    <div className="space-y-2">
                      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">📁 保存的模板（{promptTemplates.length}）</div>
                      {promptTemplates.map((t, i) => (
                        <div
                          key={i}
                          className="group bg-white/60 rounded-lg border border-slate-200 hover:border-primary-300 transition-all p-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-semibold text-slate-800 truncate">{t.name}</span>
                                <button
                                  type="button"
                                  className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-primary-600 transition-colors"
                                  title="编辑模板"
                                  onClick={() => handleEditTemplate(i)}
                                >
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                </button>
                              </div>
                              <div className="text-[11px] text-slate-600 mb-1">{t.prompt.slice(0, 80)}{t.prompt.length > 80 ? "..." : ""}</div>
                              {t.negative && t.negative.trim() && (
                                <div className="text-[11px] text-rose-600/80 italic">反向: {t.negative.slice(0, 40)}{t.negative.length > 40 ? "..." : ""}</div>
                              )}
                            </div>
                            <button
                              type="button"
                              className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors flex-shrink-0"
                              title="删除模板"
                              onClick={() => handleDeleteTemplate(i)}
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center text-slate-400 py-4">
                      <svg className="w-10 h-10 mb-2 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <p className="text-sm">暂无保存的模板</p>
                      <p className="text-xs mt-1">在提示词下拉中选择"保存当前为模板"</p>
                    </div>
                  )}

                  {/* 输入历史列表 */}
                  {promptHistory.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 pt-2 border-t border-slate-200/60">📝 输入历史（{promptHistory.length}）</div>
                      {promptHistory.map((p, i) => (
                        <div
                          key={i}
                          className="group bg-white/40 rounded-lg border border-slate-100 hover:border-primary-200 transition-all p-2.5"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div
                              className="flex-1 text-[11px] text-slate-600 line-clamp-2 cursor-pointer hover:text-primary-600"
                              onClick={() => { setPrompt(p); setManageDialogOpen(false); }}
                              title="点击应用此提示词"
                            >
                              {p}
                            </div>
                            <button
                              type="button"
                              className="p-1 rounded hover:bg-red-50 text-slate-300 hover:text-red-500 transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100"
                              title="删除此历史"
                              onClick={() => {
                                setPromptHistory(prev => prev.filter((_, idx) => idx !== i));
                              }}
                            >
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      ))}
                      {promptHistory.length > 0 && (
                        <button
                          type="button"
                          className="w-full mt-2 px-3 py-1.5 rounded-lg text-xs border border-red-200 text-red-500 hover:bg-red-50 transition"
                          onClick={() => {
                            if (confirm("确定要清空所有输入历史吗？")) {
                              setPromptHistory([]);
                            }
                          }}
                        >
                          清空输入历史
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                /* 反向提示词历史记录列表 */
                (() => {
                  const negativeHistory = generationHistory.filter(h => h.negativePrompt && h.negativePrompt.trim());
                  return negativeHistory.length > 0 ? (
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-rose-500 uppercase tracking-wide mb-2">⛔ 反向提示词历史（{negativeHistory.length}）</div>
                    {negativeHistory.map((h, i) => {
                      const isGenerating = h.results.length === 0;
                      return (
                        <div
                          key={h.id}
                          className={`group bg-white/60 rounded-lg border transition-all p-3 ${
                            isGenerating
                              ? h.error
                                ? "border-red-300 bg-red-50/40"
                                : "border-blue-300 bg-blue-50/40"
                              : "border-slate-200 hover:border-blue-300"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-semibold text-slate-800">{h.time}</span>
                                <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 text-[10px]">{h.model}</span>
                              </div>
                              {/* 反向提示词 - 主要显示 */}
                              <div className="text-[11px] text-rose-600 mb-1 font-medium">{h.negativePrompt}</div>
                              {/* 正向提示词 - 次要显示 */}
                              <div className="text-[11px] text-slate-500 italic">正向: {h.prompt.slice(0, 50)}{h.prompt.length > 50 ? "..." : ""}</div>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              {!isGenerating && (
                                <button
                                  type="button"
                                  className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-500 transition-colors"
                                  title="编辑历史（修改反向提示词）"
                                  onClick={() => handleEditHistory(h.id)}
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                </button>
                              )}
                              <button
                                type="button"
                                className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                                title="删除历史记录"
                                onClick={() => handleDeleteHistory(h.id)}
                              >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-slate-400 py-8">
                    <svg className="w-12 h-12 mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-sm">暂无反向提示词历史</p>
                    <p className="text-xs mt-1">使用了反向提示词的生成记录会显示在此</p>
                  </div>
                );
                })()
              )}
            </div>

            {/* 底部操作区 */}
            <div className="px-5 py-3 border-t border-slate-200/60 bg-slate-50/60 flex items-center justify-between flex-shrink-0">
              {manageDialogType === "template" && (
                <button
                  type="button"
                  className="px-3 py-1.5 rounded-lg text-xs border border-slate-200 text-red-500 hover:bg-red-50 hover:border-red-200 transition"
                  onClick={() => {
                    if (confirm("确定要清空所有模板吗？此操作不可恢复。")) {
                      setPromptTemplates([]);
                    }
                  }}
                >
                  清空全部
                </button>
              )}
              {manageDialogType === "history" && (
                <button
                  type="button"
                  className="px-3 py-1.5 rounded-lg text-xs border border-slate-200 text-red-500 hover:bg-red-50 hover:border-red-200 transition"
                  onClick={() => {
                    if (confirm("确定要清空所有历史记录吗？此操作不可恢复。")) {
                      setGenerationHistory([]);
                    }
                  }}
                >
                  清空全部
                </button>
              )}
              <div className="flex items-center gap-2 text-[10px] text-slate-400">
                <span>模板 {promptTemplates.length} | 输入历史 {promptHistory.length} | 生成历史 {generationHistory.length}</span>
              </div>
            </div>

            {/* 拖动调整尺寸手柄 */}
            <div
              className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize hover:bg-primary-200/50 transition-colors"
              onMouseDown={(e) => {
                e.preventDefault();
                manageModalResizing.current = true;
                manageModalResizeStart.current = {
                  mouseX: e.clientX,
                  mouseY: e.clientY,
                  w: manageModalSize.w,
                  h: manageModalSize.h
                };
              }}
            >
              <svg className="w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22 22H20V20H22V22ZM22 18H20V16H22V18ZM18 22H16V20H18V22ZM22 14H20V12H22V14ZM18 18H16V16H18V18ZM14 22H12V20H14V22Z" />
              </svg>
            </div>
          </div>
        </div>
      )}

      {/* 编辑弹窗已改为内联编辑，移除旧代码 */}

      {/* ── 关于弹窗 ─────────────────────────────────────────────────────── */}
      <AboutDialog />

      {/* 拖动条 */}
        <div
          className="w-2 flex-shrink-0 cursor-col-resize flex items-center justify-center group hover:bg-primary-100/50"
          onMouseDown={() => setIsDragging(true)}
          title="拖动调节宽度"
        >
          <div className="w-0.5 h-12 bg-slate-200 group-hover:bg-primary-400 rounded-full transition-colors" />
        </div>

        {/* 右侧控制栏 - 玻璃拟态 - 全高 flex-col 无滚动 */}
        <aside
          className="flex-shrink-0 flex flex-col gap-2 overflow-hidden"
          style={{ width: rightPanelWidth, height: "100%", maxHeight: "100%" }}
        >
          {/* ── 提示词模块 ── */}
          <div className="glass-card rounded-xl px-3 pt-2.5 pb-2 flex flex-col gap-1.5 flex-shrink-0">
            {/* 标题行 */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700">提示词 Prompt</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={!prompt.trim()}
                  className="px-2 py-0.5 rounded-lg border text-[11px] btn-hover-lift transition-all border-slate-200 bg-white/60 text-slate-600 hover:border-primary-200 hover:text-primary-600 disabled:opacity-40 disabled:cursor-not-allowed"
                  onClick={handlePromptOptimize}
                  title="打开提示词优化助手"
                >
                  ✨ 优化
                </button>
              </div>
            </div>
            {/* 主提示词输入框 - 加高 */}
            <textarea
              className="w-full text-sm rounded-xl glass-input px-3 py-2 resize-none app-scrollbar"
              style={{ minHeight: 120, maxHeight: 200 }}
              placeholder="输入提示词，将使用选用的模型生成图片..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
            {/* 提示词模板下拉（含模板和历史记录） */}
            <div className="flex items-center gap-1">
              <select
                className="flex-1 min-w-[140px] text-xs rounded-lg border border-slate-200 bg-slate-50/80 px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary-300"
                value={historyTemplateValue}
                onChange={(e) => {
                  const v = e.target.value;
                  setHistoryTemplateValue("");
                  if (!v) return;
                  if (v.startsWith("tpl:")) {
                    // 应用模板
                    const idx = parseInt(v.slice(4));
                    if (!isNaN(idx) && promptTemplates[idx]) handleApplyTemplate(promptTemplates[idx]);
                  } else if (v.startsWith("ph:")) {
                    // 应用输入历史
                    const idx = parseInt(v.slice(3));
                    if (!isNaN(idx) && promptHistory[idx]) {
                      setPrompt(promptHistory[idx]);
                    }
                  } else if (v.startsWith("hist:")) {
                    // 应用历史记录
                    const idx = parseInt(v.slice(5));
                    if (!isNaN(idx) && generationHistory[idx]) {
                      const entry = generationHistory[idx];
                      setPrompt(entry.prompt || "");
                      setNegativePrompt(entry.negativePrompt || "");
                      setModel(entry.model || "");
                      setBatchSize(entry.batchSize || 1);
                      // 尝试恢复图片结果（仅限有效的外部 URL）
                      if (entry.results && entry.results.length > 0) {
                        const validResults = entry.results.filter(img => {
                          if (!img || !img.url) return false;
                          // 跳过失效的 blob: 和 data: URL
                          if (img.url.startsWith('blob:') || img.url.startsWith('data:')) {
                            // 如果有 originalUrl 字段，使用它
                            if ((img as any).originalUrl && !(img as any).originalUrl.startsWith('blob:') && !(img as any).originalUrl.startsWith('data:')) {
                              (img as any).url = (img as any).originalUrl;
                              return true;
                            }
                            return false;
                          }
                          return true;
                        });
                        if (validResults.length > 0) {
                          setResults(validResults);
                          setResultActiveIdx(0);
                        }
                      }
                    }
                  } else if (v === "save") {
                    setShowTemplateSave(true);
                  }
                }}
              >
                <option value="">提示词模板/历史…</option>
                {/* 输入历史 */}
                {promptHistory.length > 0 && (
                  <optgroup label="📝 输入历史">
                    {promptHistory.slice(0, 10).map((p, i) => (
                      <option key={`ph-${i}`} value={`ph:${i}`}>
                        {p.slice(0, 30)}{p.length > 30 ? "..." : ""}
                      </option>
                    ))}
                  </optgroup>
                )}
                {/* 历史记录选项 */}
                {generationHistory.length > 0 && (
                  <optgroup label="📋 生成历史">
                    {generationHistory.slice(0, 10).map((entry, i) => (
                      <option key={`hist-${i}`} value={`hist:${i}`}>
                        {entry.time} - {entry.prompt.slice(0, 25)}{entry.prompt.length > 25 ? "..." : ""}
                      </option>
                    ))}
                  </optgroup>
                )}
                {/* 模板选项 */}
                <optgroup label="📁 保存的模板">
                  {promptTemplates.length > 0 ? (
                    promptTemplates.map((t, i) => (
                      <option key={i} value={`tpl:${i}`}>{t.name}</option>
                    ))
                  ) : (
                    <option disabled value="">（暂无模板）</option>
                  )}
                </optgroup>
                <option value="save">＋ 保存当前为模板…</option>
              </select>
              {/* 管理按钮：打开模板管理弹窗 */}
              <button
                type="button"
                title="管理提示词"
                className="flex-shrink-0 px-2 py-1.5 rounded-lg border border-slate-200 bg-slate-50/80 text-slate-500 hover:text-primary-600 hover:border-primary-200 hover:bg-primary-50 transition text-[11px]"
                onClick={() => { setManageDialogType("template"); setManageDialogOpen(true); }}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
            </div>
            {/* 保存模板内联区 */}
            {showTemplateSave && (
              <div className="flex items-center gap-1.5 bg-primary-50 rounded-lg px-2 py-1.5 border border-primary-200">
                <input
                  type="text"
                  className="flex-1 text-xs rounded border border-primary-200 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary-300"
                  placeholder="模板名称…"
                  value={templateNameInput}
                  onChange={(e) => setTemplateNameInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSaveTemplate()}
                />
                <button type="button" className="px-2 py-1 rounded bg-primary-500 text-white text-[11px] hover:bg-primary-600" onClick={handleSaveTemplate}>保存</button>
                <button type="button" className="px-2 py-1 rounded border border-slate-200 text-slate-500 text-[11px] hover:bg-slate-50" onClick={() => { setShowTemplateSave(false); setTemplateNameInput(""); }}>×</button>
              </div>
            )}
            {/* 反向提示词 - 历史记录 + 模板 */}
            <div className="border border-slate-200/60 rounded-lg overflow-hidden">
              <textarea
                className="w-full text-xs glass-input px-2.5 py-2 resize-none app-scrollbar rounded-none border-0"
                style={{ height: 68 }}
                placeholder="反向提示词（可选）"
                value={negativePrompt}
                onChange={(e) => setNegativePrompt(e.target.value)}
              />
              {/* 反向提示词历史记录 + 模板（合并到一个下拉） */}
              <div className="border-t border-slate-200/60 px-2 py-1.5 bg-slate-50/40">
                {/* 模板和历史记录合并下拉 */}
                <div className="flex items-center gap-1">
                  <select
                    className="flex-1 min-w-[140px] text-xs rounded-lg border border-slate-200 bg-slate-50/80 px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-rose-300"
                    value={negTemplateValue}
                    onChange={(e) => {
                      const v = e.target.value;
                      setNegTemplateValue("");
                      if (!v) return;
                      if (v.startsWith("tpl:")) {
                        // 从正向模板中提取反向提示词
                        const idx = parseInt(v.slice(4));
                        if (!isNaN(idx) && promptTemplates[idx]) {
                          setNegativePrompt(promptTemplates[idx].negative || "");
                        }
                      } else if (v.startsWith("hist:")) {
                        // 从生成历史中提取反向提示词
                        const idx = parseInt(v.slice(5));
                        if (!isNaN(idx) && generationHistory[idx] && generationHistory[idx].negativePrompt) {
                          setNegativePrompt(generationHistory[idx].negativePrompt || "");
                        }
                      }
                    }}
                  >
                    <option value="">反向提示词/历史…</option>
                    {/* 历史记录中的反向提示词 */}
                    {generationHistory.filter(h => h.negativePrompt && h.negativePrompt.trim()).length > 0 && (
                      <optgroup label="📋 历史记录">
                        {generationHistory.filter(h => h.negativePrompt && h.negativePrompt.trim()).slice(0, 10).map((entry, i) => (
                          <option key={`hist-${entry.id}`} value={`hist:${generationHistory.indexOf(entry)}`}>
                            {entry.time} - {entry.negativePrompt!.slice(0, 25)}{entry.negativePrompt!.length > 25 ? "..." : ""}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {/* 模板中的反向提示词 */}
                    {promptTemplates.filter(t => t.negative && t.negative.trim()).length > 0 && (
                      <optgroup label="📁 保存的模板">
                        {promptTemplates.filter(t => t.negative && t.negative.trim()).map((t, i) => (
                          <option key={i} value={`tpl:${promptTemplates.indexOf(t)}`}>
                            {t.name} - {t.negative!.slice(0, 20)}{t.negative!.length > 20 ? "..." : ""}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                  <button
                    type="button"
                    title="管理反向提示词"
                    className="flex-shrink-0 px-2 py-1.5 rounded-lg border border-slate-200 bg-slate-50/80 text-slate-500 hover:text-rose-500 hover:border-rose-200 hover:bg-rose-50 transition text-[11px]"
                    onClick={() => { setManageDialogType("history"); setManageDialogOpen(true); }}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* ── 参考图 - 可折叠 ── */}
          <div className="glass-card rounded-xl overflow-hidden flex-shrink-0">
            <button
              type="button"
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-white/30 transition-colors"
              onClick={() => setRefImgOpen((v) => !v)}
            >
              <span className="flex items-center gap-1.5">
                <svg className="w-3 h-3 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                参考图
                {referenceImages.length > 0 && <span className="px-1.5 py-0.5 rounded-full bg-primary-100 text-primary-600 text-[10px] font-medium">{referenceImages.length}</span>}
              </span>
              <svg className={`w-3 h-3 text-slate-400 transition-transform duration-200 ${refImgOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            <div className={`transition-all duration-200 overflow-hidden ${refImgOpen ? "max-h-52" : "max-h-0"}`}>
              <div className="px-3 pb-3 grid grid-cols-4 gap-2">
                {[0, 1, 2, 3].map((index) => (
                  <label
                    key={index}
                    className="aspect-square max-h-24 border border-dashed border-slate-300 rounded-lg cursor-pointer bg-slate-50 hover:bg-slate-100 transition flex flex-col items-center justify-center overflow-hidden relative"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => handleReferenceSlotDrop(index, e)}
                  >
                    <input
                      type="file"
                      className="hidden"
                      accept="image/*"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        setReferenceSlot(index, f ?? null);
                        e.target.value = "";
                      }}
                    />
                    {referencePreviewUrls[index] ? (
                      <>
                        <img src={referencePreviewUrls[index]!} alt="" className="absolute inset-0 w-full h-full object-cover" />
                        <button
                          type="button"
                          className="absolute top-0 right-0 w-5 h-5 flex items-center justify-center rounded-bl bg-black/60 text-white text-xs hover:bg-red-500 transition-colors"
                          title="删除图片"
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setReferenceSlot(index, null); }}
                        >×</button>
                        <span className="absolute bottom-0 left-0 right-0 py-0.5 bg-black/50 text-white text-[9px] text-center">点击可替换</span>
                      </>
                    ) : (
                      <span className="text-[9px] text-slate-400 text-center px-0.5">点击/拖拽</span>
                    )}
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* ── 生图设置 - 单行紧凑 ── */}
          <div className="glass-card rounded-xl px-3 py-2.5 flex flex-col gap-2 flex-shrink-0">
            <div className="text-xs font-semibold text-slate-700">生图设置</div>
            {/* 四项横排：模型 / 比例 / 分辨率 / 数量 */}
            <div className="grid grid-cols-[1fr_88px_68px_1fr] gap-1.5 text-[11px]">
              {/* 模型 */}
              <div className="flex flex-col gap-0.5">
                <span className="text-slate-400 text-[10px]">模型</span>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="border border-slate-200 rounded-md px-1.5 py-1.5 text-[11px] bg-slate-50 focus:outline-none focus:ring-1 focus:ring-primary-300 w-full truncate"
                  title={model}
                >
                  {[...new Set(model ? [model, ...modelList] : modelList)].map((id) => (
                    <option key={id} value={id}>{id}</option>
                  ))}
                </select>
              </div>
              {/* 比例 */}
              <div className="flex flex-col gap-0.5">
                <span className="text-slate-400 text-[10px]">比例</span>
                <AspectRatioSelect
                  value={resolutionPreset}
                  onChange={setResolutionPreset}
                  isGemini={(getApiConfig().globalApiSpec ?? "gemini") === "gemini"}
                />
              </div>
              {/* 分辨率 */}
              <div className="flex flex-col gap-0.5">
                <span className="text-slate-400 text-[10px]">分辨率</span>
                <select
                  value={sizeTier}
                  onChange={(e) => setSizeTier(e.target.value as SizeTierId)}
                  className="border border-slate-200 rounded-md px-1.5 py-1.5 text-[11px] bg-slate-50 focus:outline-none focus:ring-1 focus:ring-primary-300 w-full"
                >
                  {SIZE_TIERS.map((t) => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </select>
              </div>
              {/* 数量 */}
              <div className="flex flex-col gap-0.5">
                <span className="text-slate-400 text-[10px]">数量</span>
                <div className="flex gap-0.5">
                  {[1, 2, 4].map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={`flex-1 py-1.5 rounded border text-[11px] font-medium transition ${
                        batchSize === n
                          ? "border-primary-500 bg-primary-50 text-primary-700"
                          : "border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                      onClick={() => setBatchSize(n)}
                    >{n}</button>
                  ))}
                </div>
              </div>
            </div>
            {/* 分辨率尺寸 + 已选模型管理（同行） */}
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-slate-400 tabular-nums">{width} × {height} px</span>
              <button
                type="button"
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 transition font-medium border ${
                  modelList.length > 0
                    ? "text-primary-600 bg-primary-50 hover:bg-primary-100 border-primary-200 shadow-sm"
                    : "text-slate-400 bg-slate-50 hover:bg-slate-100 border-slate-200"
                }`}
                onClick={() => {
                  const cfg = getApiConfig();
                  const activeIds = new Set(
                    cfg.imageModels.filter((m) => modelList.includes(m.modelId)).map((m) => m.id)
                  );
                  setMainModelPickerSelected(activeIds);
                  setMainModelPickerOpen(true);
                }}
              >
                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
                {modelList.length > 0
                  ? <>已选 <span className="font-bold tabular-nums">{modelList.length}</span> 个模型 · 点击管理</>
                  : "点击选择模型"
                }
              </button>
            </div>
          </div>

          {/* ── 生图按钮 ── */}
          <div className="glass-card rounded-xl px-3 py-2 flex flex-col gap-1.5 flex-shrink-0">
            <button
              onClick={handleGenerate}
              disabled={status === "running"}
              className={`w-full h-10 rounded-full text-white text-sm font-semibold shadow-lg transition-all relative overflow-hidden ${
                status === "running"
                  ? "bg-gradient-to-r from-primary-400 to-primary-500 cursor-not-allowed opacity-80 generating-pulse"
                  : "gradient-button"
              }`}
            >
              {status === "running" ? (
                <div className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>生图中...</span>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span>开始生图</span>
                </div>
              )}
            </button>
          </div>

          {/* ── 日志 ── */}
          <div className="glass-card rounded-xl flex flex-col overflow-hidden flex-1 min-h-0">
            {/* 标题栏 */}
            <div className="flex items-center justify-between px-3 py-2 flex-shrink-0 border-b border-white/20">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                <span className={`w-1.5 h-1.5 rounded-full transition-colors ${
                  status === "running" ? "bg-green-500 animate-pulse"
                  : logEntries.length > 0 && logEntries[logEntries.length - 1]?.error ? "bg-red-500"
                  : logEntries.length > 0 ? "bg-blue-400"
                  : "bg-slate-300"
                }`} />
                日志
                {logEntries.length > 0 && <span className="text-[10px] text-slate-400">({logEntries.length})</span>}
              </span>
              <div className="flex items-center gap-1">
                {/* 详情按钮 */}
                <button
                  type="button"
                  title="查看详细日志"
                  className="p-1 rounded hover:bg-white/40 text-slate-400 hover:text-slate-600 transition-colors"
                  onClick={() => useUiStore.getState().setShowDetailedLog(true)}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h10" />
                  </svg>
                </button>
                {/* 清空按钮 */}
                {logEntries.length > 0 && (
                  <button
                    type="button"
                    title="清空日志"
                    className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                    onClick={() => setLogEntries([])}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
            {/* 日志内容 */}
            <div className="flex-1 min-h-0 overflow-y-auto app-scrollbar p-2 text-[11px] font-mono text-slate-600 space-y-2">
              {logEntries.length === 0 ? (
                <p className="text-slate-400 italic">生图后将显示请求与返回信息…</p>
              ) : (
                logEntries.slice(-50).map((entry, i) => (
                  <div
                    key={i}
                    className="border-b border-white/30 pb-1.5 last:border-0 cursor-pointer rounded px-1 hover:bg-white/30 transition-colors"
                    title="双击查看详情"
                    onDoubleClick={() => {
                      useUiStore.getState().setSelectedLogEntry(entry);
                      useUiStore.getState().setShowDetailedLog(true);
                    }}
                  >
                    <span className="text-slate-400">[{entry.time}]</span>
                    {entry.endpoint && <p className="mt-0.5 text-indigo-400 truncate text-[10px]">→ {entry.endpoint}</p>}
                    {entry.request && <pre className="mt-0.5 whitespace-pre-wrap break-all text-slate-600">{entry.request}</pre>}
                    {entry.response && <p className="mt-0.5 text-green-600">✓ {entry.response}</p>}
                    {entry.error && <p className="mt-0.5 text-red-500">✗ {entry.error}</p>}
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>
      </main>

      {/* 重复的提示词模板管理弹窗已删除，使用统一管理弹窗 */}
    </div>
  );
}

export default App;

