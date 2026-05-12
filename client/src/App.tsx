import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { useUiStore } from "./store/uiStore";
import { useGenerationStore, STORAGE_KEYS } from "./store/generationStore";
import { generateImages, GeneratedImage } from "./api/imageClient";
import { downloadImage, downloadImages } from "./utils/download";
const PromptOptimizerDialog = lazy(() => import("./components/PromptOptimizerDialog"));
const InfiniteCanvas = lazy(() => import("./components/InfiniteCanvas"));import AboutDialog from "./components/Dialogs/AboutDialog";
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
import SettingsDialog from "./components/SettingsDialog";
import VendorManager from "./components/VendorManager";
import ControlPanel from "./components/ControlPanel";
import { safeUrl } from "./utils/safeUrl";
import AspectRatioSelect from "./components/AspectRatioSelect";
import { getRealPerformanceData, FPSCalculator } from "./utils/performanceMonitor";

type GenerationStatus = "idle" | "running";

const RIGHT_PANEL_MIN = 280;
const RIGHT_PANEL_MAX = 640;
const RIGHT_PANEL_DEFAULT = 340;

function App() {
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const batchSize = useGenerationStore((s) => s.batchSize);
  const setBatchSize = (v: number) => useGenerationStore.getState().setBatchSize(v);
  const [width, setWidth] = useState(768);
  const [height, setHeight] = useState(768);
  const resolutionPreset = useGenerationStore((s) => s.resolutionPreset);
  const setResolutionPreset = (v: ResolutionPresetId) => useGenerationStore.getState().setResolutionPreset(v);
  const sizeTier = useGenerationStore((s) => s.sizeTier);
  const setSizeTier = (v: SizeTierId) => useGenerationStore.getState().setSizeTier(v);
  const [referenceSlots, setReferenceSlots] = useState<(File | null)[]>(() => [null, null, null, null]);
  const [referencePreviewUrls, setReferencePreviewUrls] = useState<(string | null)[]>(() => [null, null, null, null]);
  const [referenceSize, setReferenceSize] = useState<{ width: number; height: number } | null>(null);
  const model = useGenerationStore((s) => s.model);
  const setModel = (v: string) => useGenerationStore.getState().setModel(v);
  const modelList = useGenerationStore((s) => s.modelList);
  const setModelList = (v: string[] | ((prev: string[]) => string[])) => {
    const store = useGenerationStore.getState();
    const next = typeof v === "function" ? v(store.modelList) : v;
    store.setModelList(next);
  };
  const [results, setResults] = useState<GeneratedImage[]>([]);
  const [status, setStatus] = useState<GenerationStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const elapsedSeconds = useGenerationStore((s) => s.elapsedSeconds);
  const storeStatus = useGenerationStore((s) => s.status);
  const lastDuration = useGenerationStore((s) => s.lastDuration);
  const progressPct = useGenerationStore((s) => s.progressPct);
  const [selectedImageIds, setSelectedImageIds] = useState<Set<string>>(new Set());
  const [previewImage, setPreviewImage] = useState<GeneratedImage | null>(null);
  const [downloadStatus, setDownloadStatus] = useState<"idle" | "downloading">("idle");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [modelSelectOpen, setModelSelectOpen] = useState(false);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [modelPickerMode, setModelPickerMode] = useState<"image" | "chat">("image");
  const [modelPickerList, setModelPickerList] = useState<string[]>([]);
  const [modelPickerSelected, setModelPickerSelected] = useState<Set<string>>(new Set());
  const [modelPickerSearch, setModelPickerSearch] = useState("");
  const [modelPickerCategoryTag, setModelPickerCategoryTag] = useState<string | null>(null);
  const [modelPickerVendorTag, setModelPickerVendorTag] = useState<string | null>(null);
  // 共享配置草稿（供应商管理、模型选择器等内联弹窗使用，SettingsDialog 有独立副本）
  const [cfgDraft, setCfgDraft] = useState<ApiConfig>(() => getApiConfig());
  // model-select modal 需要的 settingsForm（后续提取 ModelPicker 时移除）
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
  const [fetchedModelList, _setFetchedModelList] = useState<string[]>([]);
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
  const [_filterMode, _setFilterMode] = useState<"union" | "intersect">("union");
  const [selectedModelManageOpen, setSelectedModelManageOpen] = useState(false);
  // 选择模型弹窗可拖拽缩放尺寸
  const [modelModalSize, setModelModalSize] = useState({ w: 880, h: 620 });
  const modelModalResizing = useRef(false);
  const modelModalResizeStart = useRef({ mouseX: 0, mouseY: 0, w: 880, h: 620 });
  const [_logEntries, setLogEntries] = useState<{
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
  const [_showAbout, _setShowAbout] = useState(false);
  const [theme, setThemeState] = useState<ThemeMode>(() => getTheme());
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const [performanceMonitorOpen, setPerformanceMonitorOpen] = useState(false);
  const themeBtnRef = useRef<HTMLButtonElement>(null);
  const perfBtnRef = useRef<HTMLButtonElement>(null);
  const balanceBtnRef = useRef<HTMLButtonElement>(null);
  const [historyPanelOpen, setHistoryPanelOpen] = useState(false);
  const [balancePopupOpen, setBalancePopupOpen] = useState(false);
  const [whiteboardOpen, setWhiteboardOpen] = useState(false);


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
  // 并发生成守卫（ref 比 state 更可靠，同步生效）
  const isGeneratingRef = useRef(false);
  // 生成计时器 ref
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
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

  // ── 供应商管理弹窗 ─────────────────────────────────────────────────
  const [vendorDialogOpen, setVendorDialogOpen] = useState(false);
  // Global Config 快速保存供应商
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
    localStorage.setItem(STORAGE_KEYS.PROMPT_HISTORY, JSON.stringify(promptHistory.slice(0, 50)));
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
      setRightPanelWidth((_w) => Math.min(RIGHT_PANEL_MAX, Math.max(RIGHT_PANEL_MIN, newWidth)));
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
    if (isGeneratingRef.current) return;
    isGeneratingRef.current = true;
    try {
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
    // 启动生成计时器
    useGenerationStore.setState({ elapsedSeconds: 0 });
    if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    elapsedTimerRef.current = setInterval(() => {
      const current = useGenerationStore.getState();
      if (current.elapsedSeconds < 300) { // 5分钟超时
        useGenerationStore.setState({ elapsedSeconds: current.elapsedSeconds + 1 });
      }
    }, 1000);
    // 每次新的生成开始，重置比例重试标记
    const isRatioRetry = ratioMismatchRetried.current;
    ratioMismatchRetried.current = false;

    // ── 校验并修正尺寸参数 ──────────────────────────────────────────
    const { width: finalWidth, height: finalHeight } = getResolution(resolutionPreset, sizeTier, referenceSize);

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

    let result = await generateImages({
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

    // 智能降级：模型不支持参考图时，去掉参考图重试
    if (result.error && referenceImages.length > 0) {
      const errMsg = result.error.toLowerCase();
      const isImageUnsupported =
        errMsg.includes("does not support image input") ||
        errMsg.includes("does not support image") ||
        errMsg.includes("image input is not supported") ||
        errMsg.includes("cannot read") ||
        errMsg.includes("inform the user") ||
        (errMsg.includes("vision") && errMsg.includes("not support")) ||
        (errMsg.includes("multimodal") && errMsg.includes("not support")) ||
        (errMsg.includes("invalid") && errMsg.includes("image_url")) ||
        (errMsg.includes("unsupported") && errMsg.includes("image"));
      console.log(`[图片降级] error含图片关键词: ${isImageUnsupported}, error: ${errMsg.slice(0, 100)}`);
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
          const warnMsg = "⚠️ 当前模型不支持参考图输入，已自动切换为纯文生图模式。";
          setError(warnMsg);
          setTimeout(() => setError((prev) => prev === warnMsg ? null : prev), 8000);
        }
      }
    }

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
      setError(message);
      setTimeout(() => setError((prev) => prev === message ? null : prev), 15000);
      if (elapsedTimerRef.current) { clearInterval(elapsedTimerRef.current); elapsedTimerRef.current = null; }
      setStatus("idle");
      if (prompt.trim()) {
        setPromptHistory((prev) => [prompt.trim(), ...prev.filter((p) => p !== prompt.trim())].slice(0, 50));
      }
      return;
    }

    const images = result.images;
      setResults(images);
      setResultActiveIdx(0);
      setPreviewImage(null);

      // ── 分辨率校验 ─────────────────────────────────────────
      if (images.length > 0) {
        const firstUrl = images[0].url;
        if (firstUrl) {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => {
            const actualW = img.naturalWidth;
            const actualH = img.naturalHeight;
            if (actualW > 0 && actualH > 0) {
              // 比例校验
              const actualRatioVal = actualW / actualH;
              const expectedRatioVal = finalWidth / finalHeight;
              const diff = Math.abs(actualRatioVal - expectedRatioVal) / expectedRatioVal;
              if (diff > 0.05 && !isRatioRetry) {
                const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
                const g1 = gcd(actualW, actualH);
                const g2 = gcd(finalWidth, finalHeight);
                setRatioMismatchDialog({
                  actualRatio: `${actualW / g1}:${actualH / g1}`,
                  expectedRatio: `${finalWidth / g2}:${finalHeight / g2}`,
                  onConfirm: () => {
                    setRatioMismatchDialog(null);
                    ratioMismatchRetried.current = true;
                    setTimeout(() => handleGenerateRef.current(), 100);
                  }
                });
              }

              // 分辨率降级警告
              if (actualW < finalWidth * 0.6 || actualH < finalHeight * 0.6) {
                const warnMsg = `⚠️ 分辨率降级：请求 ${finalWidth}×${finalHeight}，API 实际返回 ${actualW}×${actualH}。\n当前 API 可能不支持所选分辨率，请检查 API 的 imageSize 参数支持情况。`;
                setError(warnMsg);
                setTimeout(() => setError((prev) => prev === warnMsg ? null : prev), 15000);
              }
            }
          };
          img.onerror = () => {};
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
      if (elapsedTimerRef.current) { clearInterval(elapsedTimerRef.current); elapsedTimerRef.current = null; }
      setStatus("idle");
    if (prompt.trim()) {
      setPromptHistory((prev) => [prompt.trim(), ...prev.filter((p) => p !== prompt.trim())].slice(0, 50));
    }
    } finally {
      isGeneratingRef.current = false;
      if (elapsedTimerRef.current) { clearInterval(elapsedTimerRef.current); elapsedTimerRef.current = null; }
      setStatus("idle");
    }
  };

  // runs after every render intentionally — keeps ref pointing to latest closure
  useEffect(() => { handleGenerateRef.current = handleGenerate; });

  // 切换图片选中状态
  const _toggleImageSelection = (id: string) => {
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
  const _handleDownloadSingle = async (img: GeneratedImage) => {
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

  // 删除历史记录
  const _handleDeleteHistory = (id: string) => {
    setGenerationHistory((prev) => {
      const filtered = prev.filter((h) => h.id !== id);
      saveHistory(filtered);
      return filtered;
    });
  };

  // 管理弹窗尺寸
  const [manageModalSize, setManageModalSize] = useState({ w: 640, h: 520 });
  const manageModalResizing = useRef(false);
  const manageModalResizeStart = useRef({ mouseX: 0, mouseY: 0, w: 640, h: 520 });

  const [_isOptimizing, _setIsOptimizing] = useState(false);
  // ── 优化5：提示词优化独立弹窗 ─────────────────────────────────────────────
  const [promptOptimizeDialogOpen, setPromptOptimizeDialogOpen] = useState(false);

  // 折叠状态
  const [_negPromptOpen, setNegPromptOpen] = useState(true);
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
  }, []);

  // 历史+模板合并下拉
  const [historyTemplateValue, setHistoryTemplateValue] = useState("");

  // 反向提示词下拉值（用于重置选择）

  // 历史管理弹窗
  const [manageDialogOpen, setManageDialogOpen] = useState(false);
  // 历史管理标签页
  const [historyTab, setHistoryTab] = useState<"input">("input");
  const [selectedPromptHistory, setSelectedPromptHistory] = useState<Set<number>>(new Set());

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
    <div
      className={`min-h-screen flex flex-col ${themeConfig.textColor}`}
      data-theme={themeConfig.id}
      style={{ "--accent": themeConfig.accentColor } as React.CSSProperties}
    >
      {/* 顶部工具栏 */}
      <header className="fixed top-0 left-0 right-0 z-30 h-14 flex items-center justify-between px-6 glass-header">
        <div className="flex items-center gap-4 text-sm">
          <span className="font-bold text-gradient text-base tracking-tight select-none">Liang007</span>
          <div className="h-4 w-px bg-white/10" />
          <button
              onClick={() => setSettingsOpen(true)}
              className="px-3 py-1.5 rounded-lg glass-button text-xs btn-hover-lift"
              aria-label="打开设置"
            >
              设置
            </button>
            <button
              ref={balanceBtnRef}
              className="px-3 py-1.5 rounded-lg glass-button text-xs btn-hover-lift disabled:opacity-40"
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
                <span className="flex items-center gap-1.5"><svg className="animate-spin w-3 h-3" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>查询中</span>
              ) : "余额"}
            </button>
            <div className="relative">
              <button
                ref={themeBtnRef}
                className={`px-3 py-1.5 rounded-lg text-xs btn-hover-lift transition-all ${
                  themeMenuOpen ? "glass-button ring-1 ring-primary-500/40 text-primary-400" : "glass-button"
                }`}
                onClick={() => setThemeMenuOpen(!themeMenuOpen)}
              >
                主题
              </button>
            </div>
            <button
              className="px-3 py-1.5 rounded-lg text-xs btn-hover-lift glass-button transition-all"
              onClick={() => useUiStore.getState().setShowAbout(true)}
            >
              关于
            </button>
            <button
              className={`px-3 py-1.5 rounded-lg text-xs btn-hover-lift glass-button transition-all ${whiteboardOpen ? "ring-1 ring-primary-500/30 text-primary-400" : ""}`}
              onClick={() => setWhiteboardOpen(!whiteboardOpen)}
              aria-label={whiteboardOpen ? "关闭无限画布" : "打开无限画布"}
            >
              无限画布
            </button>
          </div>
        <button
          ref={perfBtnRef}
          className={`px-3 py-1.5 rounded-lg text-xs btn-hover-lift glass-button transition-all ${
            performanceMonitorOpen ? "ring-1 ring-primary-500/30" : ""
          }`}
          onClick={handleOpenPerformanceMonitor}
        >
          性能
        </button>
      </header>

      {/* 主题菜单 */}
      {themeMenuOpen && themeBtnRef.current && (
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setThemeMenuOpen(false)} />
          <div
            className="fixed glass-popup rounded-xl py-1.5 z-[9999] w-56 popup-enter"
            style={{ left: themeBtnRef.current.getBoundingClientRect().left, top: themeBtnRef.current.getBoundingClientRect().bottom + 8 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-3 pb-2 mb-1 border-b border-white/[0.06]">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Theme</span>
            </div>
            {THEMES.map((t) => {
              const isActive = theme === t.id;
              return (
                <button key={t.id}
                  className={`w-full px-3 py-2 text-left text-xs flex items-center gap-3 transition-colors rounded-lg mx-0 ${
                    isActive ? "bg-white/[0.08]" : "hover:bg-white/[0.04]"
                  }`}
                  style={{ width: 'calc(100% - 8px)', marginLeft: 4 }}
                  onClick={() => { handleThemeChange(t.id); setThemeMenuOpen(false); }}
                >
                  <span
                    className="w-3.5 h-3.5 rounded-full flex-shrink-0 ring-1 ring-white/10"
                    style={{ background: t.dotGradient }}
                  />
                  <div className="flex-1 min-w-0">
                    <span className={`${isActive ? "text-primary-400 font-semibold" : "text-slate-300"}`}>{t.name}</span>
                    <p className="text-[10px] text-slate-400 mt-0.5">{t.description}</p>
                  </div>
                  {isActive && <svg className="w-3.5 h-3.5 text-primary-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>}
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
      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSave={(modelIds, activeModelId) => {
          setModelList(modelIds);
          setModel(activeModelId);
        }}
      />

      {/* 选择模型弹窗：悬浮模式，固定定位，可超出设置弹窗，支持拖拽缩放 */}
      {modelSelectOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center overlay-dark" onClick={(e) => { if (e.target === e.currentTarget) setModelSelectOpen(false); }}>
          <div
            className="glass-popup flex flex-col overflow-hidden popup-enter relative"
            style={{width: modelModalSize.w, height: modelModalSize.h, maxWidth:"95vw", maxHeight:"95vh", minWidth:520, minHeight:400}}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 顶部标题栏 */}
            <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold text-slate-100">选择调用模型</h3>
              </div>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                  <input
                    type="text"
                    className="pl-8 pr-3 py-1.5 border border-white/[0.08] rounded-lg text-sm bg-white/[0.04] focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500/30 text-slate-200 w-48"
                    placeholder="搜索模型 id…"
                    value={modelSearchQuery}
                    onChange={(e) => setModelSearchQuery(e.target.value)}
                  />
                </div>
                <button type="button" className="text-slate-500 hover:text-slate-300 text-2xl leading-none p-1 hover:bg-white/[0.06] rounded-lg transition" onClick={() => setModelSelectOpen(false)}>×</button>
              </div>
            </div>

            {/* 主体：左侧筛选 + 右侧列表 */}
            <div className="flex flex-1 min-h-0 overflow-hidden">
              {/* 左侧筛选面板 */}
              <div className="w-52 flex-shrink-0 border-r border-white/[0.06] flex flex-col overflow-y-auto app-scrollbar">
                {/* 模型标签 */}
                <div className="px-3 py-2.5">
                  <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">模型标签</div>
                  <div className="flex flex-col gap-0.5">
                    <button type="button" className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition ${!filterCategoryTag ? "bg-primary-500/20 text-primary-400 font-medium" : "text-slate-400 hover:bg-white/[0.04]"}`} onClick={() => setFilterCategoryTag(null)}>全部标签</button>
                    {MODEL_CATEGORY_TAGS.map((tag) => (
                      <button key={tag} type="button" className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition flex items-center justify-between ${filterCategoryTag === tag ? "bg-primary-500/20 text-primary-400 font-medium" : "text-slate-400 hover:bg-white/[0.04]"}`} onClick={() => setFilterCategoryTag(filterCategoryTag === tag ? null : tag)}>
                        <span>{tag}</span>
                        {filterCategoryTag === tag && <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                      </button>
                    ))}
                  </div>
                </div>
                {/* 模型厂商 */}
                <div className="px-3 py-2.5 border-t border-white/[0.06]">
                  <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    模型厂商
                    <a href="https://ai.t8star.cn/models" target="_blank" rel="noopener noreferrer" className="text-primary-400 hover:underline normal-case">参考</a>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <button type="button" className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition ${!filterVendorTag ? "bg-primary-500/20 text-primary-400 font-medium" : "text-slate-400 hover:bg-white/[0.04]"}`} onClick={() => setFilterVendorTag(null)}>全部厂商</button>
                    {MODEL_VENDOR_TAGS.map((tag) => (
                      <button key={tag} type="button" className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition flex items-center justify-between ${filterVendorTag === tag ? "bg-primary-500/20 text-primary-400 font-medium" : "text-slate-400 hover:bg-white/[0.04]"}`} onClick={() => setFilterVendorTag(filterVendorTag === tag ? null : tag)}>
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
                    <div className="flex flex-col items-center justify-center py-16 text-slate-500">
                      <svg className="w-12 h-12 text-slate-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      <p className="text-sm">没有匹配的模型</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {filtered.map(({ category, models }) => (
                          <div key={category}>
                          <div className="text-xs font-medium text-slate-500 px-2 py-1.5 mb-1 flex items-center gap-2">
                            <span className="flex-1 border-b border-white/[0.06] pb-1">{category}</span>
                            <span className="text-[10px] text-slate-400 bg-white/[0.06] px-1.5 py-0.5 rounded">{models.length}</span>
                          </div>
                          <div className="grid grid-cols-1 gap-0.5">
                            {models.map((id) => {
                              const info = getModelDisplayInfo(id);
                              const priceInfo = getModelPrice(id);
                              const checked = selectedModelIdsInModal.includes(id);
                              return (
                                <label key={id} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all ${checked ? "bg-primary-500/10 border border-primary-500/20" : "hover:bg-white/[0.04] border border-transparent"}`}>
                                  <input type="checkbox" checked={checked} onChange={() => setSelectedModelIdsInModal((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])} className="text-primary-500 rounded w-4 h-4 flex-shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <div className={`text-sm truncate ${checked ? "text-primary-400 font-medium" : "text-slate-300"}`} title={id}>{id}</div>
                                    <div className="flex items-center gap-1 mt-0.5">
                                      {info.categoryTag && <span className="px-1.5 py-0.5 rounded bg-white/[0.06] text-slate-400 text-[10px]">{info.categoryTag}</span>}
                                      {info.vendorTag && <span className="px-1.5 py-0.5 rounded bg-primary-500/10 text-primary-400 text-[10px]">{info.vendorTag}</span>}
                                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${priceInfo.price === "询价" ? "bg-white/[0.04] text-slate-500" : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"}`}>
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
            <div className="px-5 py-3.5 border-t border-white/[0.06] flex items-center justify-between gap-2 flex-shrink-0">
              {/* 左下角：已选数量 */}
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold transition-all cursor-pointer ${selectedModelIdsInModal.length > 0 ? "gradient-button text-white" : "bg-white/[0.06] text-slate-500 hover:bg-white/[0.1]"}`}
                  title="点击管理已选模型"
                  onClick={() => {
                    // 同步当前勾选到 settingsForm，不关闭选择模型弹窗，叠加打开管理弹窗
                    setSettingsForm((f) => ({ ...f, selectedModelIds: selectedModelIdsInModal, modelList: fetchedModelList }));
                    setSelectedModelManageOpen(true);
                  }}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  已选 <span className={`text-base font-bold leading-none ${selectedModelIdsInModal.length > 0 ? "text-white" : "text-slate-500"}`}>{selectedModelIdsInModal.length}</span> 个模型
                  <svg className="w-3 h-3 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                </button>
                {selectedModelIdsInModal.length > 0 && (
                  <button type="button" className="text-xs text-slate-500 hover:text-red-400 transition px-2 py-1 rounded-lg hover:bg-red-500/10" onClick={() => setSelectedModelIdsInModal([])}>清空选择</button>
                )}
              </div>
              <div className="flex gap-2">
                <button type="button" className="px-4 py-2 rounded-lg glass-button text-slate-300 text-sm transition" onClick={() => setModelSelectOpen(false)}>取消</button>
                <button type="button" className="px-4 py-2 rounded-lg gradient-button text-white text-sm font-medium" onClick={() => { setSettingsForm((f) => ({ ...f, selectedModelIds: selectedModelIdsInModal, modelList: fetchedModelList })); setModelSelectOpen(false); }}>确定</button>
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
              <svg className="w-3 h-3 text-slate-400 group-hover:text-primary-400 transition-colors" viewBox="0 0 10 10" fill="currentColor">
                <path d="M8 2L2 8M10 5L5 10M10 8L8 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
              </svg>
            </div>
          </div>
        </div>
      )}

      {/* 已选模型管理弹窗（叠加在选择模型弹窗之上） */}
      {selectedModelManageOpen && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center overlay-dark" onClick={(e) => { if (e.target === e.currentTarget) { setSelectedModelIdsInModal(settingsForm.selectedModelIds); setSelectedModelManageOpen(false); } }}>
          <div className="bg-white/[0.06] rounded-2xl shadow-2xl border border-white/[0.08] flex flex-col overflow-hidden popup-enter" style={{width:"min(90vw,600px)",maxHeight:"min(90vh,680px)"}}>
            <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between flex-shrink-0 bg-gradient-to-r from-emerald-500/10 to-teal-500/10">
              <div className="flex items-center gap-3">
                <h3 className="text-base font-semibold text-slate-100">已选模型管理</h3>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-xs font-medium">{settingsForm.selectedModelIds.length} 个</span>
              </div>
              <button type="button" className="text-slate-400 hover:text-slate-400 text-2xl leading-none p-1 hover:bg-white/[0.08] rounded-lg transition" onClick={() => { setSelectedModelIdsInModal(settingsForm.selectedModelIds); setSelectedModelManageOpen(false); }}>×</button>
            </div>

            {/* 主体：左列已选 + 右列可添加 */}
            <div className="flex flex-1 min-h-0 overflow-hidden">
              {/* 左：已选列表 */}
              <div className="flex-1 flex flex-col border-r border-white/[0.06] min-w-0">
                <div className="px-4 py-2.5 border-b border-white/[0.04] bg-white/[0.03] flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-400">当前已选</span>
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
                          <div key={id} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.06] hover:border-red-500/20 hover:bg-red-500/[0.04] group transition-all">
                            <span className="w-5 h-5 rounded bg-emerald-500/15 text-emerald-400 flex items-center justify-center text-[9px] font-bold flex-shrink-0">{idx + 1}</span>
                            <div className="flex-1 min-w-0">
                              <div className="text-xs text-slate-300 truncate font-medium" title={id}>{id}</div>
                              <div className="flex items-center gap-1 mt-0.5">
                                {info.vendorTag && <span className="px-1 py-0 rounded bg-primary-500/10 text-primary-400 text-[9px]">{info.vendorTag}</span>}
                                <span className={`px-1 py-0 rounded text-[9px] ${priceInfo.price === "询价" ? "bg-white/[0.08] text-slate-400" : "bg-emerald-500/10 text-emerald-400"}`}>{priceInfo.price}</span>
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
                <div className="px-4 py-2.5 border-b border-white/[0.04] bg-white/[0.03]">
                  <span className="text-xs font-semibold text-slate-400">添加模型</span>
                  {fetchedModelList.length === 0 && <span className="text-[9px] text-slate-400 ml-1.5">请先在设置中获取模型列表</span>}
                </div>
                {fetchedModelList.length > 0 ? (
                  <>
                    <div className="px-3 py-2 border-b border-white/[0.04]">
                      <input
                        type="text"
                        className="w-full text-xs rounded-lg border border-white/[0.08] px-2.5 py-1.5 bg-white/[0.06] focus:outline-none focus:ring-1 focus:ring-primary-500/30"
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
                              <div key={id} className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all ${isAdded ? "bg-emerald-500/10 border-emerald-500/20" : "bg-white/[0.06] border-white/[0.06] hover:border-primary-500/20 hover:bg-primary-500/[0.04]"}`}>
                                <div className="flex-1 min-w-0">
                                  <div className={`text-xs truncate ${isAdded ? "text-emerald-400 font-medium" : "text-slate-300"}`} title={id}>{id}</div>
                                  <div className="flex items-center gap-1 mt-0.5">
                                    {info.categoryTag && <span className="px-1 py-0 rounded bg-white/[0.08] text-slate-500 text-[9px]">{info.categoryTag}</span>}
                                    {info.vendorTag && <span className="px-1 py-0 rounded bg-primary-500/10 text-primary-400 text-[9px]">{info.vendorTag}</span>}
                                    <span className={`px-1 py-0 rounded text-[9px] ${priceInfo.price === "询价" ? "bg-white/[0.08] text-slate-400" : "bg-emerald-500/10 text-emerald-400"}`}>{priceInfo.price}</span>
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

            <div className="px-5 py-3.5 border-t border-white/[0.06] flex items-center justify-between flex-shrink-0 bg-white/[0.06]">
              <span className="text-xs text-slate-400">修改会即时生效</span>
              <button type="button" className="px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm hover:bg-emerald-600 transition font-medium" onClick={() => {
                // 同步到 modelList 状态
                if (settingsForm.selectedModelIds.length) {
                  setModelList(settingsForm.selectedModelIds);
                  const cur = useGenerationStore.getState().model;
                  setModel(settingsForm.selectedModelIds.includes(cur) ? cur : settingsForm.selectedModelIds[0]);
                  setApiSettings({ selectedModelIds: settingsForm.selectedModelIds, modelList: settingsForm.modelList });
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
                    className={`px-1.5 py-0.5 rounded transition ${historyLayout === "list" ? "bg-white/90 text-primary-400" : "text-white/70 hover:text-white"}`}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setHistoryLayout("grid")}
                    title="网格视图"
                    className={`px-1.5 py-0.5 rounded transition ${historyLayout === "grid" ? "bg-white/90 text-primary-400" : "text-white/70 hover:text-white"}`}
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
                  onClick={() => { if (confirm("确定要清空所有历史记录吗？")) { setGenerationHistory([]); saveHistory([]); } }}
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
                                      time: new Date(entry.createdAt || Date.now()).toLocaleTimeString(),
                                      endpoint: `生成图片${elapsedStr}`,
                                      error: entry.error,
                                      request: `[模型] ${entry.model}\n[尺寸] ${entry.width}×${entry.height}\n[批次] ${entry.batchSize}\n[正向提示词]\n${entry.prompt}${entry.negativePrompt ? `\n\n[反向提示词]\n${entry.negativePrompt}` : ""}`,
                                      httpErrorBody: `错误类型: ${entry.error?.includes("超时") ? "生成超时（5分钟）" : "生成失败"}\n记录时间: ${new Date(entry.createdAt || Date.now()).toLocaleString()}${entry.createdAt ? `\n开始时间: ${new Date(entry.createdAt).toLocaleString()}` : ""}${elapsedMs ? `\n总耗时: ${Math.floor(elapsedMs / 60000)}分${Math.floor((elapsedMs % 60000) / 1000)}秒` : ""}`,
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
                                  className="w-full aspect-square object-cover bg-slate-800 cursor-zoom-in hover:opacity-90 transition"
                                  onDoubleClick={() => setHistoryFullPreview(firstImg)}
                                  title="双击查看大图"
                                />
                              ) : (
                            <div className="w-full aspect-square bg-slate-800/60 flex items-center justify-center">
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
                              if (next.has(entry.id)) { next.delete(entry.id); } else { next.add(entry.id); }
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
                                time: new Date(entry.createdAt || Date.now()).toLocaleTimeString(),
                                endpoint: `生成图片${elapsedStr}`,
                                error: entry.error,
                                request: `[模型] ${entry.model}\n[尺寸] ${entry.width}×${entry.height}\n[批次] ${entry.batchSize}\n[正向提示词]\n${entry.prompt}${entry.negativePrompt ? `\n\n[反向提示词]\n${entry.negativePrompt}` : ""}`,
                                httpErrorBody: `错误类型: ${entry.error?.includes("超时") ? "生成超时（5分钟）" : "生成失败"}\n记录时间: ${new Date(entry.createdAt || Date.now()).toLocaleString()}${entry.createdAt ? `\n开始时间: ${new Date(entry.createdAt).toLocaleString()}` : ""}${elapsedMs ? `\n总耗时: ${Math.floor(elapsedMs / 60000)}分${Math.floor((elapsedMs % 60000) / 1000)}秒` : ""}`,
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
                              className="w-14 h-14 rounded-lg object-cover flex-shrink-0 bg-slate-800 cursor-zoom-in hover:ring-2 hover:ring-primary-400 transition"
                              onDoubleClick={() => setHistoryFullPreview(firstImg)}
                              title="双击查看大图"
                            />
                          ) : (
                            <div className="w-14 h-14 rounded-lg bg-slate-800/60 flex items-center justify-center flex-shrink-0">
                              {hasError ? (
                                <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                              ) : (
                                <svg className="w-5 h-5 text-slate-500 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                              )}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] text-slate-400 dark:text-slate-300 line-clamp-2 leading-relaxed">{entry.prompt}</p>
                            <div className="flex items-center gap-1 mt-1 flex-wrap">
                              <span className="text-[9px] text-slate-500">{entry.time}</span>
                              <span className="text-[9px] px-1 bg-white/[0.06] rounded text-slate-500">{entry.model}</span>
                              {entry.results.length > 0 && <span className="text-[9px] text-primary-400">{entry.results.length}张</span>}
                              {isPending && <span className="text-[9px] text-amber-400 animate-pulse">生图中...</span>}
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
                className="px-2 py-1 rounded bg-red-500/70 text-white text-[11px] hover:bg-red-500/100 transition"
              >删除</button>
              <button onClick={() => { setHistoryBatchMode(false); setHistorySelected(new Set()); }}
                className="px-2 py-1 rounded bg-white/20 text-white/80 text-[11px] hover:bg-white/30 transition">取消</button>
            </div>
          )}
        </div>

        {/* 右侧生成结果区 */}
        <section className={`flex-1 min-w-[200px] glass-card rounded-2xl flex flex-col overflow-hidden ${status === "running" ? "generating-pulse" : ""}`}>
          <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2 text-sm text-slate-200">
              <span className="font-semibold">生成结果</span>
              {results.length > 0 && <span className="badge-primary">{results.length} 张</span>}
              {/* 生图完成：显示用时 */}
              {results.length > 0 && lastDuration && (
                <span className="badge-primary/60 text-slate-500 font-mono">用时 {lastDuration}</span>
              )}
              {/* 生成中：显示倒计时 */}
              {storeStatus === "running" && (() => {
                const mins = Math.floor(elapsedSeconds / 60);
                const secs = elapsedSeconds % 60;
                return <span className="badge-warning flex items-center gap-1"><span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />生成中 {mins > 0 ? `(${mins}分${secs}秒)` : `(${secs}秒)`}</span>;
              })()}
              {selectedImageIds.size > 0 && <span className="badge-success">已选 {selectedImageIds.size}</span>}
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              {results.length > 0 && (
                <>
                  <button onClick={toggleSelectAll} className="px-2.5 py-1 rounded-lg glass-button text-xs btn-hover-lift">
                    {selectedImageIds.size === results.length ? "取消全选" : "全选"}
                  </button>
                  <button
                    onClick={handleBatchDownload}
                    disabled={selectedImageIds.size === 0 || downloadStatus === "downloading"}
                    className="px-2.5 py-1 rounded-lg glass-button disabled:opacity-30 disabled:cursor-not-allowed text-xs btn-hover-lift"
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
              <div className="flex flex-col items-center justify-center text-slate-500 h-full px-8 py-12">
                <div className="empty-placeholder w-56 h-40 flex flex-col items-center justify-center mb-6 group cursor-default">
                  <div className="grid grid-cols-3 gap-2 mb-3 opacity-20">
                    {["bg-purple-500/30","bg-blue-500/30","bg-pink-500/30","bg-amber-500/30","bg-emerald-500/30","bg-cyan-500/30"].map((c,i)=>(
                      <div key={i} className={`w-8 h-8 rounded-lg ${c}`} />
                    ))}
                  </div>
                  <p className="text-xs text-slate-500 font-medium">你的作品将在这里展示</p>
                </div>
                <p className="text-sm font-medium text-slate-400 mb-1">暂无生成结果</p>
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
                // 优先用原图 URL（高清），备用缩略图 URL
                const activeImgUrl = extendedImg.originalUrl || activeImg.url;
                const _isSelected = selectedImageIds.has(activeImg.id);
                return (
                  <div className="w-full h-full flex flex-col">
                    {/* 主图区 - 填满结果区 */}
                    <div
                      className="flex-1 relative overflow-hidden cursor-pointer group"
                      onClick={() => { if (status !== "running") setPreviewImage(activeImg); }}
                    >
                      <img
                        src={activeImgUrl}
                        alt=""
                        className={`w-full h-full object-contain ${status === "running" ? "opacity-40 scale-105" : ""} transition-all duration-300`}
                        draggable={false}
                        onError={(e) => {
                          // 缩略图也失败时再提示
                          const parent = e.currentTarget.parentElement;
                          if (parent) {
                            parent.innerHTML = '<div class="flex items-center justify-center w-full h-full text-slate-400">图片加载失败</div>';
                          }
                        }}
                      />

                      {/* 叠层进度遮罩 - 再次生图时显示在旧图上方 */}
                      {status === "running" && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center z-20">
                          {/* 半透明暗色背景 */}
                          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
                          {/* 进度内容 */}
                          <div className="relative z-10 flex flex-col items-center gap-3 w-full px-6 max-w-xs">
                            {/* 旋转图标 + 文字 */}
                            <div className="flex items-center gap-2 text-white">
                              <svg className="animate-spin w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                              </svg>
                              <span className="text-sm font-medium">生成中…</span>
                              <span className="text-xs text-amber-300 font-mono ml-1">
                                {Math.floor(elapsedSeconds / 60) > 0
                                  ? `${Math.floor(elapsedSeconds / 60)}分${elapsedSeconds % 60}秒`
                                  : `${elapsedSeconds}秒`}
                              </span>
                            </div>
                            {/* 进度条 */}
                            <div className="w-full">
                              <div className="w-full h-2 bg-white/20 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-gradient-to-r from-amber-400 to-amber-500 rounded-full transition-all duration-500"
                                  style={{ width: `${progressPct}%` }}
                                />
                              </div>
                              <div className="flex justify-between mt-1">
                                <span className="text-[10px] text-amber-200">正在生成新图…</span>
                                <span className="text-[10px] text-amber-200 font-mono">{progressPct}%</span>
                              </div>
                            </div>
                            {/* 提示文字 */}
                            <p className="text-[10px] text-white/60 text-center">旧图已保留，新图完成后自动切换</p>
                          </div>
                        </div>
                      )}

                      {/* 返回默认界面按钮 */}
                      <button
                        className="absolute top-2 left-2 w-8 h-8 rounded-full bg-black/80 hover:bg-slate-600 text-white flex items-center justify-center transition opacity-0 group-hover:opacity-100 z-30"
                        onClick={(e) => { e.stopPropagation(); setResults([]); setResultActiveIdx(0); setSelectedImageIds(new Set()); }}
                        title="返回默认界面"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
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
                    {/* 缩略图横条 */}
                    {results.length > 1 && (
                      <div className="flex-shrink-0 flex gap-1.5 px-2 py-2 overflow-x-auto app-scrollbar border-t border-white/[0.06]">
                        {results.map((img, idx) => {
                          // 扩展类型，支持 originalUrl（原图 URL）
                          const extImg = img as typeof img & { originalUrl?: string };
                          // 缩略图条：优先用缩略图（快速加载），备用原图
                          const thumbUrl = img.url || extImg.originalUrl;
                          return (
                            <div key={img.id} className="relative flex-shrink-0">
                              <button
                                onClick={() => setResultActiveIdx(idx)}
                                className={`w-12 h-12 rounded-lg overflow-hidden border-2 transition-all ${idx === safeIdx ? "border-primary-400 ring-1 ring-primary-400/30" : "border-transparent hover:border-white/20"}`}
                              >
                                <img src={safeUrl(thumbUrl)} alt="" className="w-full h-full object-cover" />
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

      {/* 无限画布 */}
      {whiteboardOpen && (
        <Suspense fallback={<div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0a0f]"><div className="w-8 h-8 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" /></div>}>
          <InfiniteCanvas onClose={() => setWhiteboardOpen(false)} />
        </Suspense>
      )}










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
            className="fixed inset-0 z-[70] flex items-center justify-center overlay-dark"
            onClick={() => setModelPickerOpen(false)}
          >
            <div
              className="bg-white/[0.06] rounded-2xl shadow-2xl flex flex-col overflow-hidden"
              style={{ width: 860, maxWidth: "96vw", height: 580, maxHeight: "92vh" }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* 头部 */}
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.06] flex-shrink-0">
                <div>
                  <h3 className="text-sm font-semibold text-slate-100">选择模型</h3>
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
                      className="pl-8 pr-3 py-1.5 text-xs border border-white/[0.08] rounded-lg bg-white/[0.04] focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500/30 w-44"
                    />
                  </div>
                  <button onClick={() => setModelPickerOpen(false)} className="p-1.5 rounded-lg hover:bg-white/[0.08] text-slate-400 hover:text-slate-400 transition-colors">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              </div>

              {/* 主体：左侧筛选 + 右侧列表 */}
              <div className="flex flex-1 overflow-hidden">
                {/* 左侧筛选面板 */}
                <div className="w-44 flex-shrink-0 border-r border-white/[0.06] overflow-y-auto py-3 px-2.5 flex flex-col gap-4">
                  {/* 模型类型 */}
                  <div>
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5 px-1">模型类型</p>
                    <div className="flex flex-col gap-0.5">
                      <button
                        onClick={() => setModelPickerCategoryTag(null)}
                        className={`text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors ${modelPickerCategoryTag === null ? "bg-primary-500/10 text-primary-400 font-medium" : "text-slate-400 hover:bg-white/[0.04]"}`}
                      >
                        全部类型
                      </button>
                      {MODEL_CATEGORY_TAGS.map((tag) => (
                        <button
                          key={tag}
                          onClick={() => setModelPickerCategoryTag(modelPickerCategoryTag === tag ? null : tag)}
                          className={`text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors ${modelPickerCategoryTag === tag ? "bg-primary-500/10 text-primary-400 font-medium" : "text-slate-400 hover:bg-white/[0.04]"}`}
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
                          className={`text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors ${modelPickerVendorTag === null ? "bg-violet-50 text-violet-600 font-medium" : "text-slate-400 hover:bg-white/[0.04]"}`}
                        >
                          全部厂商
                        </button>
                        {dynamicVendors.map((tag) => (
                          <button
                            key={tag}
                            onClick={() => setModelPickerVendorTag(modelPickerVendorTag === tag ? null : tag)}
                            className={`text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors ${modelPickerVendorTag === tag ? "bg-violet-50 text-violet-600 font-medium" : "text-slate-400 hover:bg-white/[0.04]"}`}
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
                  <div className="px-4 py-2 border-b border-white/[0.04] flex items-center justify-between flex-shrink-0">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={toggleAll}
                        className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-primary-400 transition-colors"
                      >
                        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors flex-shrink-0 ${
                          filteredModels.length > 0 && filteredModels.every((id) => modelPickerSelected.has(id))
                            ? "bg-primary-500 border-primary-500"
                            : filteredModels.some((id) => modelPickerSelected.has(id))
                            ? "bg-primary-500/15 border-primary-500/30"
                            : "border-white/[0.12] bg-white/[0.06]"
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
                          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-1 mb-1.5 sticky top-0 bg-white/[0.06] py-0.5">{group.category}</p>
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
                                      ? "border-primary-500/30 bg-primary-500/10 shadow-sm"
                                      : "border-white/[0.06] bg-white/[0.06] hover:border-white/[0.08] hover:bg-white/[0.04]"
                                  }`}
                                >
                                  <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                                    selected ? "bg-primary-500 border-primary-500" : "border-white/[0.12] bg-white/[0.06]"
                                  }`}>
                                    {selected && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[11px] font-mono text-slate-300 truncate leading-tight">{mid}</p>
                                    <div className="flex items-center gap-1 mt-0.5">
                                      {info.vendorTag && <span className="text-[9px] text-violet-500 bg-violet-50 px-1 py-0.5 rounded font-medium leading-none">{info.vendorTag}</span>}
                                      <span className="text-[9px] text-emerald-400 font-medium leading-none">{price.price}</span>
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
              <div className="flex items-center justify-between px-5 py-3 border-t border-white/[0.06] flex-shrink-0 bg-white/[0.03]">
                <span className="text-xs text-slate-400">已选 <span className="font-semibold text-slate-300">{modelPickerSelected.size}</span> 个模型，点击确认后同步到 {modelPickerMode === "image" ? "Image" : "Chat"} 模型列表</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setModelPickerOpen(false)}
                    className="px-4 py-1.5 rounded-lg border border-white/[0.08] text-slate-400 text-sm hover:bg-white/[0.08] transition"
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

      {/* 历史按钮 */}
      <div
        className="fixed left-0 z-40 cursor-move"
        style={{ top: historyBtnPosition }}
        onMouseDown={() => setIsDraggingHistory(true)}
      >
        <button
          className={`px-2.5 py-1.5 rounded-r-lg text-white text-[11px] font-medium shadow-lg transition-all flex items-center gap-1.5 ${
            historyPanelOpen
              ? "bg-red-500/80 ring-1 ring-red-400/40"
              : "bg-primary-500/60 backdrop-blur-sm hover:bg-primary-500/80"
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
          setTimeout(() => handleGenerateRef.current(), 100);
        }}
      />

      {/* ── 优化5：主界面模型选择弹窗 ──────────────────────────────────────── */}
      {mainModelPickerOpen && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center overlay-dark"
          onClick={() => setMainModelPickerOpen(false)}
        >
          <div
            className="glass-popup rounded-2xl shadow-2xl flex flex-col overflow-hidden popup-enter"
            style={{ width: 520, maxWidth: "96vw", maxHeight: "80vh" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between flex-shrink-0">
              <div>
                <h3 className="text-sm font-bold text-slate-100">生图模型管理</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">勾选后的模型将参与生图，取消勾选则跳过</p>
              </div>
              <button onClick={() => setMainModelPickerOpen(false)} className="p-1.5 rounded-lg hover:bg-white/[0.06] text-slate-500 hover:text-slate-300 transition-colors">
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
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-all ${isChecked ? "bg-primary-500/10 border-primary-500/20" : "bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.06] hover:border-white/[0.1]"}`}
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
                        <p className={`text-sm font-mono truncate ${isChecked ? "text-primary-400 font-medium" : "text-slate-300"}`}>{m.modelId}</p>
                        {m.label && m.label !== m.modelId && <p className="text-[10px] text-slate-500 truncate">{m.label}</p>}
                        {/* 价格信息 */}
                        <p className="text-[11px] text-slate-500 mt-0.5 leading-tight">
                          {priceInfo.price !== "询价"
                            ? <>单次：<span className="text-emerald-400 font-medium">{priceInfo.price}</span>{priceInfo.note && <span className="ml-1 text-[9px] bg-white/[0.06] text-slate-500 px-1 rounded">{priceInfo.note}</span>}</>
                            : <span className="text-slate-400">暂无定价</span>
                          }
                        </p>
                      </div>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium flex-shrink-0 ${spec === "gemini" ? "bg-purple-500/10 text-purple-400 border border-purple-500/20" : "bg-blue-500/10 text-blue-400 border border-blue-500/20"}`}>
                        {spec === "gemini" ? "Gemini" : "OpenAI"}
                      </span>
                    </label>
                  );
                });
              })()}
            </div>
            <div className="px-5 py-3 border-t border-white/[0.06] flex items-center justify-between flex-shrink-0">
              <span className="text-xs text-slate-400">已勾选 <span className="font-semibold text-slate-200">{mainModelPickerSelected.size}</span> 个</span>
              <div className="flex gap-2">
                <button className="px-4 py-2 rounded-xl glass-button text-slate-300 text-sm transition" onClick={() => setMainModelPickerOpen(false)}>取消</button>
                <button
                  className="px-5 py-2 rounded-xl gradient-button text-white text-sm font-medium"
                  onClick={() => {
                    const cfg = getApiConfig();
                    const selectedModels = cfg.imageModels.filter((m) => mainModelPickerSelected.has(m.id) && m.modelId.trim());
                    if (selectedModels.length > 0) {
                      const ids = selectedModels.map((m) => m.modelId);
                      setModelList(ids);
                      const cur = useGenerationStore.getState().model;
                      setModel(ids.includes(cur) ? cur : ids[0]);
                    }
                    setMainModelPickerOpen(false);
                  }}
                >确认</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 供应商管理弹窗 ── */}
      <VendorManager
        open={vendorDialogOpen}
        onClose={() => setVendorDialogOpen(false)}
        cfgDraft={cfgDraft}
        setCfgDraft={setCfgDraft}
      />


      {/* ── 优化5：提示词优化弹窗 ────────────────────────────────────────────── */}
      <Suspense fallback={<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"><div className="w-8 h-8 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" /></div>}>
        <PromptOptimizerDialog
          open={promptOptimizeDialogOpen}
          onClose={() => setPromptOptimizeDialogOpen(false)}
          originalPrompt={prompt.trim()}
          onAdopt={(optimized) => setPrompt(optimized)}
        />
      </Suspense>

      {/* ── 历史记录管理弹窗 ─────────────────────────────────────────────── */}
      {manageDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overlay-dark" onClick={() => { setManageDialogOpen(false); setSelectedPromptHistory(new Set()); }}>
          <div
            className="glass-popup rounded-2xl overflow-hidden flex flex-col popup-enter"
            style={{ width: manageModalSize.w, height: manageModalSize.h, minHeight: 420, minWidth: 560 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 标题栏 */}
            <div className="px-5 py-3 border-b border-white/[0.05] flex items-center justify-between bg-white/40">
              <h3 className="text-sm font-semibold text-slate-100">📋 历史记录管理</h3>
              <button
                type="button"
                className="p-1.5 rounded-lg hover:bg-white/[0.08] text-slate-400 hover:text-slate-400 transition-colors"
                onClick={() => { setManageDialogOpen(false); setSelectedPromptHistory(new Set()); }}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* 标签页切换 */}
            <div className="px-5 pt-3 pb-0 flex items-center gap-1 bg-white/20">
              <button
                type="button"
                className={`px-3 py-1.5 rounded-t-lg text-xs font-medium transition-all ${historyTab === "input" ? "bg-white/[0.06] text-primary-400 border border-white/[0.08] border-b-white -mb-px" : "text-slate-500 hover:text-slate-300 hover:bg-white/[0.04]"}`}
                onClick={() => { setHistoryTab("input"); }}
              >
                📝 输入历史 <span className="ml-1 text-[10px] opacity-70">{promptHistory.length}</span>
              </button>
            </div>

            {/* 批量操作工具栏 */}
            {(() => {
              const selCount = selectedPromptHistory.size;
              return selCount > 0 ? (
                <div className="px-5 py-2 bg-blue-500/10 border-b border-blue-500/15 flex items-center gap-2">
                  <span className="text-xs text-blue-600 font-medium">已选择 {selCount} 项</span>
                  <button
                    type="button"
                    className="px-2 py-1 rounded-lg text-[11px] border border-blue-500/20 text-blue-600 hover:bg-blue-500/15 transition"
                    onClick={() => {
                      setSelectedPromptHistory(new Set(promptHistory.map((_, i) => i)));
                    }}
                  >
                    全选
                  </button>
                  <button
                    type="button"
                    className="px-2 py-1 rounded-lg text-[11px] border border-blue-500/20 text-blue-600 hover:bg-blue-500/15 transition"
                    onClick={() => {
                      setSelectedPromptHistory(prev => {
                        const all = new Set(promptHistory.map((_, i) => i));
                        return new Set([...all].filter(i => !prev.has(i)));
                      });
                    }}
                  >
                    反选
                  </button>
                  <div className="flex-1" />
                  <button
                    type="button"
                    className="px-3 py-1 rounded-lg text-[11px] bg-red-500 text-white hover:bg-red-600 transition"
                    onClick={() => {
                      const _toDel = [...selectedPromptHistory].sort((a, b) => b - a);
                      setPromptHistory(prev => prev.filter((_, i) => !selectedPromptHistory.has(i)));
                      setSelectedPromptHistory(new Set());
                    }}
                  >
                    删除所选
                  </button>
                </div>
              ) : null;
            })()}

            {/* 内容区（标签页切换） */}
            <div className="flex-1 overflow-auto px-5 py-3">
              {/* ── 输入历史 ── */}
              {promptHistory.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-slate-400 py-12">
                    <svg className="w-12 h-12 mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    <p className="text-sm">暂无输入历史</p>
                    <p className="text-xs mt-1">每次生成后会保存提示词到历史</p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {promptHistory.map((p, i) => (
                      <div
                        key={i}
                        className={`group flex items-start gap-2 bg-white/50 rounded-lg border transition-all p-2.5 hover:border-primary-500/20 ${selectedPromptHistory.has(i) ? "border-blue-300 bg-blue-500/[0.04]" : "border-white/[0.06]"}`}
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5 w-4 h-4 rounded border-white/[0.12] text-primary-500 focus:ring-primary-500/30 cursor-pointer flex-shrink-0"
                          checked={selectedPromptHistory.has(i)}
                          onChange={(e) => {
                            setSelectedPromptHistory(prev => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(i); else next.delete(i);
                              return next;
                            });
                          }}
                        />
                        <div
                          className="flex-1 text-[11px] text-slate-400 line-clamp-2 cursor-pointer hover:text-primary-400 min-w-0"
                          onClick={() => { setPrompt(p); setManageDialogOpen(false); }}
                          title="点击应用此提示词"
                        >
                          {p}
                        </div>
                        <button
                          type="button"
                          className="p-1 rounded hover:bg-red-500/10 text-slate-300 hover:text-red-500 transition-colors flex-shrink-0"
                          title="删除"
                          onClick={() => {
                            setPromptHistory(prev => prev.filter((_, idx) => idx !== i));
                            setSelectedPromptHistory(prev => { const s = new Set(prev); s.delete(i); return s; });
                          }}
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
            </div>

            {/* 底部状态栏 */}
            <div className="px-5 py-2.5 border-t border-white/[0.05] bg-white/[0.03] flex items-center justify-end flex-shrink-0">
              <div className="flex items-center gap-3 text-[10px] text-slate-400">
                <span>📝 输入历史 {promptHistory.length}</span>
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

      {/* ── 关于弹窗 ─────────────────────────────────────────────────────── */}
      <AboutDialog />

      {/* 拖动条 */}
        <div
          className="w-2 flex-shrink-0 cursor-col-resize flex items-center justify-center group hover:bg-white/[0.04]"
          onMouseDown={() => setIsDragging(true)}
          title="拖动调节宽度"
        >
          <div className="w-0.5 h-12 bg-white/[0.08] group-hover:bg-primary-500/60 rounded-full transition-colors" />
        </div>


        {/* 右侧控制栏 */}
        <ControlPanel
          prompt={prompt} setPrompt={setPrompt}
          negativePrompt={negativePrompt} setNegativePrompt={setNegativePrompt}
          promptHistory={promptHistory}
          referenceSlots={referenceSlots} setReferenceSlots={setReferenceSlots}
          referencePreviewUrls={referencePreviewUrls} setReferencePreviewUrls={setReferencePreviewUrls}
          setReferenceSize={setReferenceSize}
          model={model} setModel={setModel}
          modelList={modelList}
          resolutionPreset={resolutionPreset} setResolutionPreset={setResolutionPreset}
          sizeTier={sizeTier} setSizeTier={setSizeTier}
          batchSize={batchSize} setBatchSize={setBatchSize}
          width={width} height={height}
          status={status}
          handleGenerate={handleGenerate}
          onOpenModelPicker={() => {
            const cfg = getApiConfig();
            const activeIds = new Set(cfg.imageModels.filter((m) => modelList.includes(m.modelId)).map((m) => m.id));
            setMainModelPickerSelected(activeIds);
            setMainModelPickerOpen(true);
          }}
        />

        <aside className="flex-shrink-0 flex flex-col gap-2 overflow-hidden" style={{ width: rightPanelWidth, height: "100%", maxHeight: "100%" }}>

          {/* ── 日志 ── */}
          <div className="glass-card rounded-xl flex flex-col overflow-hidden flex-1 min-h-0" style={{ maxHeight: 160 }}>
            {/* 标题栏 */}
            <div className="flex items-center justify-between px-3 py-2 flex-shrink-0 border-b border-white/[0.06]">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
                <span className={`w-1.5 h-1.5 rounded-full transition-colors ${
                  status === "running" ? "bg-green-400 animate-pulse"
                  : generationHistory.length > 0 && generationHistory[0]?.error ? "bg-red-400"
                  : generationHistory.length > 0 ? "bg-primary-400"
                  : "bg-slate-600"
                }`} />
                日志
                {generationHistory.length > 0 && <span className="text-[10px] text-slate-400">({generationHistory.length})</span>}
              </span>
              <div className="flex items-center gap-1">
                {/* 详情按钮 */}
                <button
                  type="button"
                  title="查看详细日志"
                  className="p-1 rounded hover:bg-white/[0.06] text-slate-500 hover:text-slate-300 transition-colors"
                  onClick={() => useUiStore.getState().setShowDetailedLog(true)}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h10" />
                  </svg>
                </button>
                {/* 清空按钮 */}
                {generationHistory.length > 0 && (
                  <button
                    type="button"
                    title="清空日志"
                    className="p-1 rounded hover:bg-red-500/10 text-slate-500 hover:text-red-400 transition-colors"
                    onClick={() => { setGenerationHistory([]); saveHistory([]); }}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
            {/* 日志内容 - 统一使用 generationHistory 作为数据源 */}
            <div className="flex-1 min-h-0 overflow-y-auto app-scrollbar p-2 text-[11px] font-mono text-slate-400 space-y-2">
              {generationHistory.length === 0 ? (
                <p className="text-slate-400 italic">生图后将显示请求与返回信息…</p>
              ) : (
                generationHistory.slice(0, 50).map((entry) => (
                  <div
                    key={entry.id}
                    className="border-b border-white/[0.06] pb-1.5 last:border-0 cursor-pointer rounded px-1 hover:bg-white/[0.04] transition-colors"
                    title="双击查看详情"
                    onDoubleClick={() => {
                      useUiStore.getState().setSelectedLogEntry({
                        time: entry.time,
                        request: JSON.stringify({ prompt: entry.prompt?.slice(0, 100), model: entry.model, width: entry.width, height: entry.height, batchSize: entry.batchSize }, null, 2),
                        response: entry.results?.length > 0 ? `成功，返回 ${entry.results.length} 张图` : undefined,
                        error: entry.error,
                      });
                      useUiStore.getState().setShowDetailedLog(true);
                    }}
                  >
                    <span className="text-slate-400">[{entry.time}]</span>
                    {entry.model && <p className="mt-0.5 text-primary-400 truncate text-[10px]">→ {entry.model} · {entry.width}×{entry.height}</p>}
                    {entry.results?.length > 0 && <p className="mt-0.5 text-emerald-400">✓ 成功，返回 {entry.results.length} 张图</p>}
                    {entry.error && <p className="mt-0.5 text-red-400">✗ {entry.error.slice(0, 120)}</p>}
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>
      </main>

      {/* 重复的提示词模板管理弹窗已删除，使用统一管理弹窗 */}

      {/* 全局错误/提示 Toast */}
      {error && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] max-w-xl w-full px-4"
          onClick={() => setError(null)}
        >
          <div className="glass-popup rounded-xl px-4 py-3 flex items-start gap-3 border border-red-500/20 bg-red-500/10 cursor-pointer shadow-xl">
            <svg className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <p className="text-xs text-red-300 whitespace-pre-wrap flex-1">{error}</p>
            <div className="flex items-center gap-2 flex-shrink-0">
              {status !== "running" && prompt.trim() && (
                <button
                  onClick={(e) => { e.stopPropagation(); setError(null); handleGenerateRef.current(); }}
                  className="text-xs text-primary-400 hover:text-primary-300 px-2 py-0.5 rounded bg-primary-500/10 hover:bg-primary-500/20 transition"
                  aria-label="重试生成"
                >重试</button>
              )}
              <button
                className="text-slate-500 hover:text-slate-300 text-sm leading-none"
                onClick={(e) => { e.stopPropagation(); setError(null); }}
                aria-label="关闭提示"
              >×</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;

