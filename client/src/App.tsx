import { useState, useEffect, useRef, lazy, Suspense } from 'react'
import { useUiStore } from './store/uiStore'
import { useGenerationStore, STORAGE_KEYS } from './store/generationStore'
import { generateImages, GeneratedImage } from './api/imageClient'
import { downloadImage, downloadImages } from './utils/download'
const PromptOptimizerDialog = lazy(() => import('./components/PromptOptimizerDialog'))
const InfiniteCanvas = lazy(() => import('./components/InfiniteCanvas'))
import AboutDialog from './components/Dialogs/AboutDialog'
import DetailedLogDialog from './components/Dialogs/DetailedLogDialog'
import RatioMismatchDialog from './components/Dialogs/RatioMismatchDialog'
import BalancePopup from './components/BalancePopup'
import PerformanceMonitor from './components/PerformanceMonitor'
import ImagePreviewModal from './components/ImagePreviewModal'
import HistoryFullPreview from './components/HistoryFullPreview'
import {
  getApiSettings,
  setApiSettings,
  getApiConfig,
  resolveApiSpec,
  type ApiConfig,
  type ChatModel,
  type ImageModel,
} from './api/settings'
import {
  getResolution,
  loadImageDimensions,
  type ResolutionPresetId,
  type SizeTierId,
} from './utils/resolutionPresets'
import { resolveGenerationSize } from './utils/generationSize'
import { checkImageRatio } from './utils/ratioCheck'
import {
  groupModelsByCategory,
  filterGroupsBySearch,
  filterGroupsByTags,
  getModelDisplayInfo,
  getModelPrice,
  MODEL_CATEGORY_TAGS,
  MODEL_VENDOR_TAGS,
} from './utils/modelCategories'
import { fetchBalance, fetchAllBalances, type MultiBalanceResult } from './api/balance'
import {
  THEMES,
  getTheme,
  setTheme,
  getThemeConfig,
  type ThemeMode,
  injectThemeVars,
} from './utils/theme'
import { createThumbnail } from './utils/imageUtils'
import SettingsDialog from './components/SettingsDialog'
import VendorManager from './components/VendorManager'
import ControlPanel from './components/ControlPanel'
import ResultPanel from './components/ResultPanel'
import { getRealPerformanceData, FPSCalculator } from './utils/performanceMonitor'

type GenerationStatus = 'idle' | 'running'

type GenerationRequestSnapshot = {
  prompt: string
  negativePrompt: string
  batchSize: number
  width: number
  height: number
  model: string
  resolutionPreset: ResolutionPresetId
  sizeTier: SizeTierId
  referenceImages: File[]
}

type GenerationSlot = {
  id: string
  request: GenerationRequestSnapshot
  status: 'running' | 'success' | 'error'
  elapsedSeconds: number
  progressPct: number
  lastDuration: string | null
  results: GeneratedImage[]
  error?: string
  createdAt: number
  hidden?: boolean
}

const RIGHT_PANEL_MIN = 280
const RIGHT_PANEL_MAX = 640
const RIGHT_PANEL_DEFAULT = 340

function App() {
  const [prompt, setPrompt] = useState('')
  const [negativePrompt, setNegativePrompt] = useState('')
  const batchSize = useGenerationStore(s => s.batchSize)
  const setBatchSize = (v: number) => useGenerationStore.getState().setBatchSize(v)
  const [width, setWidth] = useState(768)
  const [height, setHeight] = useState(768)
  const resolutionPreset = useGenerationStore(s => s.resolutionPreset)
  const setResolutionPreset = (v: ResolutionPresetId) =>
    useGenerationStore.getState().setResolutionPreset(v)
  const sizeTier = useGenerationStore(s => s.sizeTier)
  const setSizeTier = (v: SizeTierId) => useGenerationStore.getState().setSizeTier(v)
  const [referenceSlots, setReferenceSlots] = useState<(File | null)[]>(() => [
    null,
    null,
    null,
    null,
  ])
  const [referencePreviewUrls, setReferencePreviewUrls] = useState<(string | null)[]>(() => [
    null,
    null,
    null,
    null,
  ])
  const [referenceSize, setReferenceSize] = useState<{ width: number; height: number } | null>(null)
  const model = useGenerationStore(s => s.model)
  const setModel = (v: string) => useGenerationStore.getState().setModel(v)
  const modelList = useGenerationStore(s => s.modelList)
  const setModelList = (v: string[] | ((prev: string[]) => string[])) => {
    const store = useGenerationStore.getState()
    const next = typeof v === 'function' ? v(store.modelList) : v
    store.setModelList(next)
  }
  const [results, setResults] = useState<GeneratedImage[]>([])
  const [status, setStatus] = useState<GenerationStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [parallelCount, setParallelCount] = useState(1)
  const [generationSlots, setGenerationSlots] = useState<GenerationSlot[]>([])
  const [slotViewMode, setSlotViewMode] = useState<'grid' | 'focus'>('focus')
  const [activeSlotId, setActiveSlotId] = useState<string | null>(null)
  const elapsedSeconds = useGenerationStore(s => s.elapsedSeconds)
  const storeStatus = useGenerationStore(s => s.status)
  const lastDuration = useGenerationStore(s => s.lastDuration)
  const progressPct = useGenerationStore(s => s.progressPct)
  const [selectedImageIds, setSelectedImageIds] = useState<Set<string>>(new Set())
  const [previewImage, setPreviewImage] = useState<GeneratedImage | null>(null)
  const [downloadStatus, setDownloadStatus] = useState<'idle' | 'downloading'>('idle')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [modelSelectOpen, setModelSelectOpen] = useState(false)
  const [modelPickerOpen, setModelPickerOpen] = useState(false)
  const [modelPickerMode, _setModelPickerMode] = useState<'image' | 'chat'>('image')
  const [modelPickerList, _setModelPickerList] = useState<string[]>([])
  const [modelPickerSelected, setModelPickerSelected] = useState<Set<string>>(new Set())
  const [modelPickerSearch, setModelPickerSearch] = useState('')
  const [modelPickerCategoryTag, setModelPickerCategoryTag] = useState<string | null>(null)
  const [modelPickerVendorTag, setModelPickerVendorTag] = useState<string | null>(null)
  // 共享配置草稿（供应商管理、模型选择器等内联弹窗使用，SettingsDialog 有独立副本）
  const [cfgDraft, setCfgDraft] = useState<ApiConfig>(() => getApiConfig())
  // model-select modal 需要的 settingsForm（后续提取 ModelPicker 时移除）
  const [settingsForm, setSettingsForm] = useState(() => {
    const s = getApiSettings()
    const active = s.channels?.find(c => c.id === s.activeChannelId) ?? s.channels?.[0]
    return {
      activeChannelId: s.activeChannelId || active?.id || '',
      channelName: active?.name ?? '默认渠道',
      baseUrl: active?.baseUrl ?? s.baseUrl ?? '',
      apiKey: active?.apiKey ?? s.apiKey ?? '',
      selectedModelIds: s.selectedModelIds ?? [],
      modelList: s.modelList ?? [],
      apiValidateJson: s.apiValidateJson ?? true,
    }
  })
  const [fetchedModelList, _setFetchedModelList] = useState<string[]>([])
  const [selectedModelIdsInModal, setSelectedModelIdsInModal] = useState<string[]>([])
  const [modelSearchQuery, setModelSearchQuery] = useState('')
  const [rightPanelWidth, setRightPanelWidth] = useState(RIGHT_PANEL_DEFAULT)
  const [isDragging, setIsDragging] = useState(false)
  const [promptHistory, setPromptHistory] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.PROMPT_HISTORY)
      return raw ? JSON.parse(raw) : []
    } catch {
      return []
    }
  })
  const [filterCategoryTag, setFilterCategoryTag] = useState<string | null>(null)
  const [filterVendorTag, setFilterVendorTag] = useState<string | null>(null)
  const [_filterMode, _setFilterMode] = useState<'union' | 'intersect'>('union')
  const [selectedModelManageOpen, setSelectedModelManageOpen] = useState(false)
  // 选择模型弹窗可拖拽缩放尺寸
  const [modelModalSize, setModelModalSize] = useState({ w: 880, h: 620 })
  const modelModalResizing = useRef(false)
  const modelModalResizeStart = useRef({ mouseX: 0, mouseY: 0, w: 880, h: 620 })
  const [_logEntries, setLogEntries] = useState<
    {
      time: string
      request?: string
      response?: string
      error?: string
      /** 完整请求 endpoint */
      endpoint?: string
      /** 接口规范 */
      spec?: string
      /** 完整请求体 JSON */
      requestBody?: string
      /** 响应体摘要 */
      responseBody?: string
      /** HTTP 状态码 */
      httpStatus?: number
      /** 响应是否为有效 JSON */
      jsonValid?: boolean
      /** HTTP 错误响应体 */
      httpErrorBody?: string
    }[]
  >([])
  const [balanceStatus, setBalanceStatus] = useState<'idle' | 'loading' | 'ok' | 'fail'>('idle')
  const [balanceMessage, setBalanceMessage] = useState('')
  const [multiBalanceResult, setMultiBalanceResult] = useState<MultiBalanceResult | null>(null)
  const [_showAbout, _setShowAbout] = useState(false)
  const [theme, setThemeState] = useState<ThemeMode>(() => getTheme())
  const [themeMenuOpen, setThemeMenuOpen] = useState(false)
  const [performanceMonitorOpen, setPerformanceMonitorOpen] = useState(false)
  const themeBtnRef = useRef<HTMLButtonElement>(null)
  const perfBtnRef = useRef<HTMLButtonElement>(null)
  const balanceBtnRef = useRef<HTMLButtonElement>(null)
  const [historyPanelOpen, setHistoryPanelOpen] = useState(false)
  const [balancePopupOpen, setBalancePopupOpen] = useState(false)
  const [whiteboardOpen, setWhiteboardOpen] = useState(false)

  const [generationHistory, setGenerationHistory] = useState<
    {
      id: string
      slotId?: string
      time: string
      prompt: string
      negativePrompt?: string
      model: string
      width: number
      height: number
      batchSize: number
      results: GeneratedImage[]
      error?: string // 失败时的错误信息
      createdAt?: number // 创建时间戳，用于清理超时条目
    }[]
  >(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.GENERATION_HISTORY)
      return raw ? JSON.parse(raw) : []
    } catch {
      return []
    }
  })
  const themeConfig = getThemeConfig(theme)

  // ── Electron 环境检测：在 <html> 上添加 electron 类 ──────────────────────────
  useEffect(() => {
    if (window.electronAPI) {
      document.documentElement.classList.add('electron')
    }
  }, [])

  // ── 清理超时的"生图中..."条目（超过12分钟自动标记为失败）──────────────
  useEffect(() => {
    const now = Date.now()
    const TIMEOUT = 12 * 60 * 1000 // 12分钟超时
    const hasStuck = generationHistory.some(
      entry =>
        entry.results.length === 0 &&
        !entry.error &&
        entry.createdAt &&
        now - entry.createdAt > TIMEOUT,
    )
    if (hasStuck) {
      setGenerationHistory(prev =>
        prev.map(entry => {
          if (
            entry.results.length === 0 &&
            !entry.error &&
            entry.createdAt &&
            now - entry.createdAt > TIMEOUT
          ) {
            return { ...entry, error: '生成超时（超过12分钟）' }
          }
          return entry
        }),
      )
    }
  }, [generationHistory])

  // ── localStorage 配额管理：清理旧数据 ─────────────────────────────────────
  useEffect(() => {
    try {
      // 清理历史记录，只保留最近 50 条（与 promptHistory effect 保持一致，避免双写冲突）
      const promptHistory = JSON.parse(localStorage.getItem(STORAGE_KEYS.PROMPT_HISTORY) || '[]')
      if (promptHistory.length > 50) {
        localStorage.setItem(
          STORAGE_KEYS.PROMPT_HISTORY,
          JSON.stringify(promptHistory.slice(0, 50)),
        )
      }
    } catch (error) {
      console.error('清理 localStorage 数据失败:', error)
    }
  }, [])

  // ── 优化：history debounced 持久化（避免频繁 JSON.stringify 阻塞主线程）───
  const historySaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 比例不匹配弹窗防重入标记：用户点"重新生成"后，下一次结果不再触发弹窗
  const ratioMismatchRetried = useRef(false)
  // 多槽位计时器
  const slotTimersRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map())
  const slotSeqRef = useRef(0)
  // 存储最新的 handleGenerate 函数引用，避免闭包陷阱
  const handleGenerateRef = useRef<() => Promise<void>>(() => Promise.resolve())
  const saveHistory = (history: typeof generationHistory) => {
    if (historySaveTimer.current) clearTimeout(historySaveTimer.current)
    historySaveTimer.current = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEYS.GENERATION_HISTORY, JSON.stringify(history))
      } catch {
        /* 配额超出静默 */
      }
    }, 500)
  }

  // ── 优化2：历史全屏预览 & 批量删除 ────────────────────────────────────────
  const [historyFullPreview, setHistoryFullPreview] = useState<{
    images: GeneratedImage[]
    index: number
  } | null>(null)
  const openHistoryPreview = (images: GeneratedImage[], index = 0, entryId?: string) => {
    if (images.length === 0) return
    if (entryId) {
      setViewedHistoryIds(prev => new Set(prev).add(entryId))
    }
    setHistoryFullPreview({
      images,
      index: Math.min(Math.max(index, 0), images.length - 1),
    })
  }
  const [historyBatchMode, setHistoryBatchMode] = useState(false)
  const [historySelected, setHistorySelected] = useState<Set<string>>(new Set())
  const [historyLayout, setHistoryLayout] = useState<'list' | 'grid'>('list')
  const [viewedHistoryIds, setViewedHistoryIds] = useState<Set<string>>(new Set())

  // ── 优化3：尺寸比例不一致弹窗 ─────────────────────────────────────────────
  const [ratioMismatchDialog, setRatioMismatchDialog] = useState<{
    actualRatio: string
    expectedRatio: string
    onConfirm: () => void
  } | null>(null)

  // ── 供应商管理弹窗 ─────────────────────────────────────────────────
  const [vendorDialogOpen, setVendorDialogOpen] = useState(false)

  // ── 优化5：主界面模型管理弹窗（重新设计） ─────────────────────────────────
  const [mainModelPickerOpen, setMainModelPickerOpen] = useState(false)
  const [mainModelPickerSelected, setMainModelPickerSelected] = useState<Set<string>>(new Set())

  // ── 优化1：生成结果区当前预览图索引 ──────────────────────────────────────
  const [resultActiveIdx, setResultActiveIdx] = useState(0)

  // results 更新时，自动指向最新（第一张）
  useEffect(() => {
    if (results.length > 0 && resultActiveIdx >= results.length) {
      setResultActiveIdx(0)
    }
  }, [results, resultActiveIdx])

  // 槽位关闭或新增后，保持聚焦槽位有效
  useEffect(() => {
    const visibleSlots = generationSlots.filter(slot => !('hidden' in slot && slot.hidden))
    if (visibleSlots.length === 0) {
      if (activeSlotId) setActiveSlotId(null)
      return
    }
    if (!activeSlotId || !visibleSlots.some(slot => slot.id === activeSlotId)) {
      const nextSlot = visibleSlots[0]
      setActiveSlotId(nextSlot.id)
      if (nextSlot.results.length > 0) {
        setResults(nextSlot.results)
        setResultActiveIdx(0)
        setSelectedImageIds(new Set())
      }
    }
  }, [generationSlots, activeSlotId])

  const referenceImages = referenceSlots.filter((f): f is File => f != null)

  // 参考图预览 URL 与回收
  useEffect(() => {
    const urls: (string | null)[] = referenceSlots.map(f => (f ? URL.createObjectURL(f) : null))
    setReferencePreviewUrls(urls)
    return () => {
      urls.forEach(u => u && URL.revokeObjectURL(u))
    }
  }, [referenceSlots])

  // 参考图尺寸：以第一张为主（用于原比例）
  useEffect(() => {
    const first = referenceSlots.find(Boolean) as File | undefined
    if (!first) {
      setReferenceSize(null)
      return
    }
    let cancelled = false
    loadImageDimensions(first)
      .then(size => {
        if (!cancelled) setReferenceSize(size)
      })
      .catch(() => {
        if (!cancelled) setReferenceSize(null)
      })
    return () => {
      cancelled = true
    }
  }, [referenceSlots])

  // 根据预设与尺寸档位同步宽高（国家标准 1K/2K/4K）
  useEffect(() => {
    const { width: w, height: h } = getResolution(resolutionPreset, sizeTier, referenceSize)
    setWidth(w)
    setHeight(h)
  }, [resolutionPreset, sizeTier, referenceSize])

  useEffect(() => {
    const runningCount = generationSlots.filter(slot => slot.status === 'running').length
    setStatus(runningCount > 0 ? 'running' : 'idle')
  }, [generationSlots])

  useEffect(() => {
    return () => {
      slotTimersRef.current.forEach(timer => clearInterval(timer))
      slotTimersRef.current.clear()
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.PROMPT_HISTORY, JSON.stringify(promptHistory.slice(0, 50)))
  }, [promptHistory])

  // 当前生成结果持久化（关闭页面后可在历史中找到）
  useEffect(() => {
    if (results.length > 0) {
      try {
        // 只保存元数据和外部 URL 图片，过滤掉 base64 和 blob URL 避免超出 localStorage 配额
        const validResults = results.filter(img => {
          if (!img || !img.url) return false
          // 跳过 base64 和 blob URL，只保存外部 URL
          if (img.url.startsWith('data:') || img.url.startsWith('blob:')) return false
          return true
        })

        // 只有当有有效的外部 URL 图片时才保存
        if (validResults.length > 0) {
          const currentSession = {
            id: 'current',
            time: new Date().toLocaleString('zh-CN'),
            prompt,
            negativePrompt: negativePrompt || undefined,
            model,
            width,
            height,
            batchSize,
            results: validResults,
          }
          localStorage.setItem(STORAGE_KEYS.CURRENT_GENERATION, JSON.stringify(currentSession))
        }
      } catch (error) {
        console.error('保存当前生成结果失败:', error)
        // 配额超出时静默失败，不影响应用使用
      }
    } else {
      localStorage.removeItem(STORAGE_KEYS.CURRENT_GENERATION)
    }
  }, [results, prompt, negativePrompt, model, width, height, batchSize])

  // 页面加载时恢复上次的结果
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.CURRENT_GENERATION)
      if (saved) {
        const currentSession = JSON.parse(saved)
        if (currentSession.results && currentSession.results.length > 0) {
          // 验证图片数据完整性，过滤掉失效的 blob: URL 和 base64 URL
          const validResults = currentSession.results.filter((img: GeneratedImage) => {
            if (!img || !img.url) return false
            // blob: 和 data: URL 可能已失效，跳过
            if (img.url.startsWith('blob:') || img.url.startsWith('data:')) return false
            return true
          })
          if (validResults.length > 0) {
            setResults(validResults)
            setPrompt(currentSession.prompt || '')
            setNegativePrompt(currentSession.negativePrompt || '')
            setModel(currentSession.model || '')
            setBatchSize(currentSession.batchSize || 1)
            setResultActiveIdx(0)
          }
        }
      }
    } catch (err) {
      console.error('恢复上次结果失败:', err)
      // 忽略解析错误或配额错误，继续正常运行
      localStorage.removeItem(STORAGE_KEYS.CURRENT_GENERATION)
    }
  }, [])

  // 左右拖动调节宽度
  useEffect(() => {
    if (!isDragging) return
    const onMove = (e: MouseEvent) => {
      const newWidth = window.innerWidth - e.clientX
      setRightPanelWidth(_w => Math.min(RIGHT_PANEL_MAX, Math.max(RIGHT_PANEL_MIN, newWidth)))
    }
    const onUp = () => setIsDragging(false)
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isDragging])

  const handleGenerate = async () => {
    try {
      if (parallelCount <= 1 && status === 'running') {
        const time = new Date().toLocaleTimeString('zh-CN')
        setLogEntries(prev => [
          ...prev.slice(-99),
          { time, error: '正在生图中，请等待当前任务完成。' },
        ])
        return
      }
      if (!prompt.trim()) {
        const time = new Date().toLocaleTimeString('zh-CN')
        setLogEntries(prev => [...prev.slice(-99), { time, error: '请输入提示词再开始生成。' }])
        return
      }
      if (!model.trim()) {
        const time = new Date().toLocaleTimeString('zh-CN')
        setLogEntries(prev => [
          ...prev.slice(-99),
          {
            time,
            error: '请先在「设置 → Image」中添加模型，然后在右侧「已选模型」中勾选后再生图。',
          },
        ])
        setError('未选择模型：请点击右侧「点击选择模型」，在设置中添加并勾选 Image 模型。')
        return
      }
      const cfg = getApiConfig()
      if (!cfg.globalBaseUrl.trim() && cfg.imageModels.every(m => !m.baseUrl?.trim())) {
        const time = new Date().toLocaleTimeString('zh-CN')
        setLogEntries(prev => [
          ...prev.slice(-99),
          { time, error: '请先在「设置 → Global Config」中填写 Base URL 后再生图。' },
        ])
        return
      }

      setError(null)
      setPreviewImage(null)
      const parallel = Math.max(1, Math.min(4, parallelCount))
      const requestBase = {
        prompt,
        negativePrompt: negativePrompt || undefined,
        batchSize,
        width,
        height,
        model,
        resolutionPreset,
        sizeTier,
      }
      const snapshot: GenerationRequestSnapshot = {
        prompt,
        negativePrompt: negativePrompt || '',
        batchSize,
        width,
        height,
        model,
        resolutionPreset,
        sizeTier,
        referenceImages,
      }

      const slotIds = Array.from(
        { length: parallel },
        () => `${Date.now()}-${++slotSeqRef.current}`,
      )
      if (parallel > 1) {
        setActiveSlotId(prev => prev || slotIds[0] || null)
      }
      const slotCreatedAt = new Map<string, number>()
      slotIds.forEach(id => slotCreatedAt.set(id, Date.now()))
      const newSlots = slotIds.map(id => ({
        id,
        request: snapshot,
        status: 'running' as const,
        elapsedSeconds: 0,
        progressPct: 0,
        lastDuration: null,
        results: [],
        createdAt: Date.now(),
        hidden: parallel <= 1,
      }))
      setGenerationSlots(prev => (parallel > 1 ? [...newSlots, ...prev] : newSlots))
      setResults([])
      setResultActiveIdx(0)
      setSelectedImageIds(new Set())

      const reqInfo = { ...requestBase, parallelCount: parallel }
      const time = new Date().toLocaleTimeString('zh-CN')
      setLogEntries(prev => [
        ...prev.slice(-99),
        { time, request: JSON.stringify(reqInfo, null, 2) },
      ])

      const makeSlotTimer = (slotId: string) => {
        const timer = setInterval(() => {
          setGenerationSlots(prev =>
            prev.map(slot =>
              slot.id === slotId && slot.status === 'running'
                ? {
                    ...slot,
                    elapsedSeconds: Math.min(slot.elapsedSeconds + 1, 720),
                    progressPct: Math.min(slot.progressPct + 1, 99),
                  }
                : slot,
            ),
          )
        }, 1000)
        slotTimersRef.current.set(slotId, timer)
      }

      const clearSlotTimer = (slotId: string) => {
        const timer = slotTimersRef.current.get(slotId)
        if (timer) {
          clearInterval(timer)
          slotTimersRef.current.delete(slotId)
        }
      }

      const updateSlot = (slotId: string, patch: Partial<GenerationSlot>) => {
        setGenerationSlots(prev =>
          prev.map(slot => (slot.id === slotId ? { ...slot, ...patch } : slot)),
        )
      }

      const runSlot = async (slotId: string) => {
        makeSlotTimer(slotId)
        const isRatioRetry = ratioMismatchRetried.current
        ratioMismatchRetried.current = false
        const createdAt = slotCreatedAt.get(slotId) ?? Date.now()
        try {
          let result = await generateImages({ ...requestBase, referenceImages })
          if (result.error && referenceImages.length > 0) {
            const errMsg = result.error.toLowerCase()
            const isImageUnsupported =
              errMsg.includes('does not support image input') ||
              errMsg.includes('does not support image') ||
              errMsg.includes('image input is not supported') ||
              errMsg.includes('cannot read') ||
              errMsg.includes("can't read") ||
              errMsg.includes('unable to read') ||
              errMsg.includes('inform the user') ||
              errMsg.includes('this model does not') ||
              errMsg.includes('model does not support') ||
              (errMsg.includes('vision') && errMsg.includes('not support')) ||
              (errMsg.includes('multimodal') && errMsg.includes('not support')) ||
              (errMsg.includes('invalid') && errMsg.includes('image_url')) ||
              (errMsg.includes('unsupported') && errMsg.includes('image')) ||
              (errMsg.includes('cannot read') && errMsg.includes('does not support'))
            if (isImageUnsupported) {
              result = await generateImages({ ...requestBase, referenceImages: [] })
              if (!result.error) {
                const warnMsg =
                  '⚠️ 当前模型不支持参考图输入，已自动切换为纯文生图模式。如需使用参考图，请在设置中选择支持图片输入的模型。'
                setError(warnMsg)
                setTimeout(() => setError(prev => (prev === warnMsg ? null : prev)), 10000)
              }
            }
          }

          if (result.error) {
            const message = result.error
            const duration = `${Math.floor((Date.now() - createdAt) / 60000)}分${Math.floor(((Date.now() - createdAt) % 60000) / 1000)}秒`
            updateSlot(slotId, {
              status: 'error',
              error: message,
              progressPct: 100,
              lastDuration: duration,
            })
            setLogEntries(prev => {
              const last = prev[prev.length - 1]
              return prev.slice(0, -1).concat([
                {
                  ...last,
                  error: message,
                  endpoint: result.endpoint,
                  requestBody: result.requestBodyJson,
                  httpStatus: result.httpStatus,
                  httpErrorBody: result.httpErrorBody,
                },
              ])
            })
            setGenerationHistory(prev => {
              const updated = [
                {
                  id: `${slotId}-${Date.now()}`,
                  slotId,
                  time: new Date().toLocaleString('zh-CN'),
                  prompt,
                  negativePrompt: negativePrompt || undefined,
                  model,
                  width,
                  height,
                  batchSize,
                  results: [],
                  error: message,
                  createdAt: Date.now(),
                },
                ...prev,
              ].slice(0, 50)
              saveHistory(updated)
              return updated
            })
            return
          }

          const images = result.images
          const imagesWithThumbnails = await Promise.all(
            images.map(async img => {
              if (!img || !img.url) return img
              if (img.url.startsWith('data:image/jpeg;base64,') && img.url.length < 2000) return img
              try {
                const thumbnail = await createThumbnail(img.url, 150)
                return { ...img, url: thumbnail, originalUrl: img.url }
              } catch (error) {
                console.error('生成缩略图失败:', error)
                return { ...img, url: img.url, originalUrl: img.url }
              }
            }),
          )
          const validImages = imagesWithThumbnails.filter(img => img && img.url)
          setResults(prev => {
            if (parallelCount <= 1) return validImages
            if (activeSlotId === slotId || (!activeSlotId && prev.length === 0)) return validImages
            return prev.length > 0 ? prev : validImages
          })
          setResultActiveIdx(0)

          if (validImages.length > 0) {
            const firstUrl = validImages[0].url
            if (firstUrl) {
              const img = new Image()
              img.crossOrigin = 'anonymous'
              img.onload = () => {
                const actualW = img.naturalWidth
                const actualH = img.naturalHeight
                if (actualW > 0 && actualH > 0) {
                  const ratioCheck = checkImageRatio(actualW, actualH, width, height)
                  if (ratioCheck.mismatch && !isRatioRetry) {
                    setRatioMismatchDialog({
                      actualRatio: ratioCheck.actualRatio,
                      expectedRatio: ratioCheck.expectedRatio,
                      onConfirm: () => {
                        setRatioMismatchDialog(null)
                        ratioMismatchRetried.current = true
                        setTimeout(() => handleGenerateRef.current(), 100)
                      },
                    })
                  }
                }
              }
              img.onerror = () => {}
              img.src = firstUrl
            }
          }
          updateSlot(slotId, {
            status: 'success',
            results: validImages,
            progressPct: 100,
            lastDuration: `${Math.floor((Date.now() - createdAt) / 60000)}分${Math.floor(((Date.now() - createdAt) % 60000) / 1000)}秒`,
          })
          setLogEntries(prev => {
            const last = prev[prev.length - 1]
            return prev.slice(0, -1).concat([
              {
                ...last,
                response: `成功，返回 ${images.length} 张图`,
                endpoint: result.endpoint,
                spec: result.spec,
                requestBody: result.requestBodyJson,
                responseBody: result.responseSummary,
                httpStatus: result.httpStatus,
                jsonValid: result.jsonValid,
              },
            ])
          })
          setGenerationHistory(prev => {
            const updated = [
              {
                id: `${slotId}-${Date.now()}`,
                slotId,
                time: new Date().toLocaleString('zh-CN'),
                prompt,
                negativePrompt: negativePrompt || undefined,
                model,
                width,
                height,
                batchSize,
                results: validImages,
                createdAt: Date.now(),
              },
              ...prev,
            ].slice(0, 50)
            saveHistory(updated)
            return updated
          })
        } finally {
          clearSlotTimer(slotId)
        }
      }

      await Promise.all(slotIds.map(id => runSlot(id)))
      if (prompt.trim()) {
        setPromptHistory(prev =>
          [prompt.trim(), ...prev.filter(p => p !== prompt.trim())].slice(0, 50),
        )
      }
    } finally {
      // 独立槽位并发运行，不再使用全局生成锁
    }
  }

  // runs after every render intentionally — keeps ref pointing to latest closure
  useEffect(() => {
    handleGenerateRef.current = handleGenerate
  })

  // 切换图片选中状态
  const _toggleImageSelection = (id: string) => {
    setSelectedImageIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  // 全选/取消全选
  const toggleSelectAll = () => {
    if (selectedImageIds.size === results.length) {
      setSelectedImageIds(new Set())
    } else {
      setSelectedImageIds(new Set(results.map(r => r.id)))
    }
  }

  // 下载单张图片
  const _handleDownloadSingle = async (img: GeneratedImage) => {
    try {
      setDownloadStatus('downloading')
      await downloadImage(img.url)
    } catch (e) {
      setError(`下载失败: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setDownloadStatus('idle')
    }
  }

  // 批量下载选中图片
  const handleBatchDownload = async () => {
    const selectedImages = results.filter(r => selectedImageIds.has(r.id))
    if (selectedImages.length === 0) {
      setError('请先选择要下载的图片')
      return
    }
    try {
      setDownloadStatus('downloading')
      await downloadImages(selectedImages, 'generated')
    } catch (e) {
      setError(`批量下载失败: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setDownloadStatus('idle')
    }
  }

  // 切换主题
  const handleThemeChange = (newTheme: ThemeMode) => {
    setThemeState(newTheme)
    setTheme(newTheme)
    setThemeMenuOpen(false)
  }

  // 打开性能监控
  const handleOpenPerformanceMonitor = () => {
    setPerformanceMonitorOpen(!performanceMonitorOpen)
  }

  // 选择模型弹窗拖拽缩放
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!modelModalResizing.current) return
      const { mouseX, mouseY, w, h } = modelModalResizeStart.current
      const newW = Math.max(520, Math.min(window.innerWidth * 0.95, w + e.clientX - mouseX))
      const newH = Math.max(400, Math.min(window.innerHeight * 0.95, h + e.clientY - mouseY))
      setModelModalSize({ w: newW, h: newH })
    }
    const onUp = () => {
      if (modelModalResizing.current) {
        modelModalResizing.current = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [])

  // 性能监控数据
  const [performanceData, setPerformanceData] = useState({
    fps: 60,
    renderTime: 16,
    memory: null as number | null,
    gpuUsage: null as number | null, // Electron 不直接提供 GPU 使用率
    networkLatency: null as number | null,
  })

  // 真正的性能数据更新
  useEffect(() => {
    if (!performanceMonitorOpen) return

    // FPS 计算器
    const fpsCalculator = new FPSCalculator()
    let currentFps = 60

    fpsCalculator.start(fps => {
      currentFps = fps
      // 获取真正的性能数据
      const realData = getRealPerformanceData()
      setPerformanceData({
        fps: currentFps,
        renderTime: Math.round(1000 / currentFps),
        memory: realData.memory,
        gpuUsage: null, // Electron 不直接提供 GPU 使用率 API
        networkLatency: null, // 网络延迟需要主动测量
      })
    })

    // 定期更新其他指标
    const interval = setInterval(() => {
      const realData = getRealPerformanceData()
      setPerformanceData(prev => ({
        ...prev,
        memory: realData.memory,
        renderTime: Math.round(1000 / currentFps),
      }))
    }, 5000)

    return () => {
      fpsCalculator.stop()
      clearInterval(interval)
    }
  }, [performanceMonitorOpen])

  // 历史按钮位置状态（用于拖动）
  // 默认居中，使用固定值避免随机抖动
  const [historyBtnPosition, setHistoryBtnPosition] = useState(() => {
    return Math.round(window.innerHeight / 2)
  })
  const [isDraggingHistory, setIsDraggingHistory] = useState(false)

  // 历史按钮拖动
  useEffect(() => {
    if (!isDraggingHistory) return
    const onMove = (e: MouseEvent) => {
      const newY = Math.max(80, Math.min(window.innerHeight - 200, e.clientY))
      setHistoryBtnPosition(newY)
    }
    const onUp = () => setIsDraggingHistory(false)
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [isDraggingHistory])

  // 删除历史记录
  const _handleDeleteHistory = (id: string) => {
    setGenerationHistory(prev => {
      const filtered = prev.filter(h => h.id !== id)
      saveHistory(filtered)
      return filtered
    })
  }

  // 管理弹窗尺寸
  const [manageModalSize, setManageModalSize] = useState({ w: 640, h: 520 })
  const manageModalResizing = useRef(false)
  const manageModalResizeStart = useRef({ mouseX: 0, mouseY: 0, w: 640, h: 520 })

  const [_isOptimizing, _setIsOptimizing] = useState(false)
  // ── 优化5：提示词优化独立弹窗 ─────────────────────────────────────────────
  const [promptOptimizeDialogOpen, setPromptOptimizeDialogOpen] = useState(false)

  // 折叠状态
  const [_negPromptOpen, setNegPromptOpen] = useState(true)
  const [_refImgOpen, setRefImgOpen] = useState(true)

  // 小屏响应式：窗口宽度 < 1280px 时折叠参考图和反向提示词
  useEffect(() => {
    const checkSize = () => {
      const compact = window.innerWidth < 1280
      if (compact) {
        setRefImgOpen(false)
        setNegPromptOpen(false)
      } else {
        setRefImgOpen(true)
        setNegPromptOpen(true)
      }
    }
    checkSize()
    window.addEventListener('resize', checkSize)
    return () => window.removeEventListener('resize', checkSize)
  }, [])

  // 历史管理弹窗
  const [manageDialogOpen, setManageDialogOpen] = useState(false)
  // 历史管理标签页
  const [historyTab, setHistoryTab] = useState<'input'>('input')
  const [selectedPromptHistory, setSelectedPromptHistory] = useState<Set<number>>(new Set())

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!manageModalResizing.current) return
      const { mouseX, mouseY, w, h } = manageModalResizeStart.current
      const newW = Math.max(520, Math.min(window.innerWidth * 0.95, w + e.clientX - mouseX))
      const newH = Math.max(400, Math.min(window.innerHeight * 0.95, h + e.clientY - mouseY))
      setManageModalSize({ w: newW, h: newH })
    }
    const onUp = () => {
      manageModalResizing.current = false
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [])

  // 注入主题 CSS 变量
  useEffect(() => {
    injectThemeVars(themeConfig)
  }, [themeConfig])

  // 编辑弹窗拖动调整尺寸已删除（改为内联编辑）

  return (
    <div
      className={`app-shell-bg dragon-shell flex h-screen flex-col overflow-hidden ${themeConfig.textColor}`}
      data-theme={themeConfig.id}
    >
      <div className="dragon-orb dragon-orb-top" />
      <div className="dragon-orb dragon-orb-left" />
      <div className="dragon-orb dragon-orb-right" />
      {/* 顶部工具栏（Electron 无边框模式下兼作标题栏，支持拖拽） */}
      <header
        className="glass-header scanlines z-30 mx-2 mt-2 flex h-10 flex-shrink-0 items-center justify-between rounded-xl px-3"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div
          className="flex items-center gap-3 text-sm"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-amber-500/15 text-[10px] font-black text-amber-100 ring-1 ring-amber-200/30">
              L7
            </span>
            <div className="flex flex-col leading-none">
              <span className="text-gradient-gold select-none text-sm font-black tracking-tight">
                Liang007
              </span>
              <span className="mt-0.5 text-[8px] font-semibold uppercase tracking-[0.28em] text-amber-100/70">
                天地龙鳞 · v{__APP_VERSION__}
              </span>
            </div>
          </div>

          <div className="h-5 w-px bg-white/10" />
          <button
            onClick={() => setSettingsOpen(true)}
            className="glass-button btn-hover-lift rounded-lg px-3 py-1.5 text-xs"
            aria-label="打开设置"
          >
            设置
          </button>
          <button
            ref={balanceBtnRef}
            className="glass-button btn-hover-lift rounded-lg px-3 py-1.5 text-xs disabled:opacity-40"
            disabled={balanceStatus === 'loading'}
            onClick={async () => {
              setBalanceStatus('loading')
              setBalanceMessage('')
              setMultiBalanceResult(null)
              setBalancePopupOpen(false)
              try {
                const multi = await fetchAllBalances()
                setMultiBalanceResult(multi)
                const hasSome = multi.stations.some(s => s.ok)
                setBalanceStatus(hasSome ? 'ok' : 'fail')
                setBalanceMessage(
                  hasSome
                    ? ''
                    : multi.stations[0]?.ok === false
                      ? (multi.stations[0] as { message: string }).message
                      : '查询失败',
                )
              } catch (err) {
                setBalanceStatus('fail')
                setBalanceMessage(`查询失败: ${err instanceof Error ? err.message : String(err)}`)
              }
              setBalancePopupOpen(true)
            }}
          >
            {balanceStatus === 'loading' ? (
              <span className="flex items-center gap-1.5">
                <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                查询中
              </span>
            ) : (
              '余额'
            )}
          </button>
          <div className="relative">
            <button
              ref={themeBtnRef}
              className={`btn-hover-lift rounded-lg px-3 py-1.5 text-xs transition-all ${
                themeMenuOpen
                  ? 'glass-button text-primary-400 ring-1 ring-primary-500/40'
                  : 'glass-button'
              }`}
              onClick={() => setThemeMenuOpen(!themeMenuOpen)}
            >
              主题
            </button>
          </div>
          <button
            className="btn-hover-lift glass-button rounded-lg px-3 py-1.5 text-xs transition-all"
            onClick={() => useUiStore.getState().setShowAbout(true)}
          >
            关于
          </button>
        </div>
        <div
          className="flex items-center gap-2"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <button
            className={`btn-hover-lift glass-button rounded-lg px-3 py-1.5 text-xs transition-all ${whiteboardOpen ? 'text-primary-400 ring-1 ring-primary-500/30' : ''}`}
            onClick={() => setWhiteboardOpen(!whiteboardOpen)}
            aria-label={whiteboardOpen ? '关闭无限画布' : '打开无限画布'}
          >
            无限画布
          </button>
          <button
            ref={perfBtnRef}
            className={`btn-hover-lift glass-button rounded-lg px-3 py-1.5 text-xs transition-all ${
              performanceMonitorOpen ? 'ring-1 ring-primary-500/30' : ''
            }`}
            onClick={handleOpenPerformanceMonitor}
          >
            性能
          </button>
          {window.electronAPI && (
            <div
              className="ml-1 flex items-center"
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            >
              <div className="mx-1 h-4 w-px bg-white/10" />
              <button
                className="flex h-7 w-7 items-center justify-center rounded text-slate-400 transition hover:bg-white/[0.08] hover:text-slate-200"
                onClick={() => window.electronAPI?.minimize()}
                title="最小化"
              >
                <svg
                  className="h-3 w-3"
                  viewBox="0 0 12 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.2"
                >
                  <line x1="2" y1="6" x2="10" y2="6" />
                </svg>
              </button>
              <button
                className="flex h-7 w-7 items-center justify-center rounded text-slate-400 transition hover:bg-white/[0.08] hover:text-slate-200"
                onClick={() => window.electronAPI?.toggleMaximize()}
                title="最大化"
              >
                <svg
                  className="h-3 w-3"
                  viewBox="0 0 12 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.2"
                >
                  <rect x="2" y="2" width="8" height="8" rx="1" />
                </svg>
              </button>
              <button
                className="flex h-7 w-7 items-center justify-center rounded text-slate-400 transition hover:bg-red-500/80 hover:text-white"
                onClick={() => window.electronAPI?.close()}
                title="关闭"
              >
                <svg
                  className="h-3 w-3"
                  viewBox="0 0 12 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <line x1="3" y1="3" x2="9" y2="9" />
                  <line x1="9" y1="3" x2="3" y2="9" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </header>

      {/* 主题菜单 */}
      {themeMenuOpen && themeBtnRef.current && (
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setThemeMenuOpen(false)} />
          <div
            className="glass-popup popup-enter fixed z-[9999] w-60 rounded-xl py-1.5"
            style={{
              left: themeBtnRef.current.getBoundingClientRect().left,
              top: themeBtnRef.current.getBoundingClientRect().bottom + 8,
            }}
            onClick={e => e.stopPropagation()}
          >
            <div className="mb-1 border-b border-white/[0.06] px-3 pb-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                    Theme
                  </div>
                  <div className="mt-0.5 text-[11px] font-medium text-amber-100">
                    龙鳞帝铸 / Dragon Scale Console
                  </div>
                </div>
                <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-[9px] uppercase tracking-[0.2em] text-slate-400">
                  HUD
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-1.5 px-2.5 pb-2">
              {THEMES.map((t, index) => {
                const isActive = theme === t.id
                const code = String(index + 1).padStart(2, '0')
                const shortCode = t.id === 'dragon' ? t.name : t.name.replace(/^星域-\d+\s*/, '')
                return (
                  <button
                    key={t.id}
                    className={`flex min-h-[56px] w-full items-stretch gap-2 overflow-hidden rounded-lg text-left text-xs transition-all ${
                      isActive
                        ? 'bg-white/[0.09] ring-1 ring-primary-400/20'
                        : 'hover:bg-white/[0.04] hover:ring-1 hover:ring-white/[0.04]'
                    }`}
                    onClick={() => {
                      handleThemeChange(t.id)
                      setThemeMenuOpen(false)
                    }}
                  >
                    <div
                      className="w-1 flex-shrink-0"
                      style={{
                        background: t.accentColor,
                        boxShadow: `0 0 14px ${t.accentColor}55`,
                      }}
                    />
                    <div className="flex flex-shrink-0 flex-col items-center justify-center gap-0.5 py-0.5 pl-0.5">
                      <span
                        className="h-2.5 w-2.5 rounded-full ring-1 ring-white/10"
                        style={{
                          background: t.accentColor,
                          boxShadow: `0 0 10px ${t.accentColor}44`,
                        }}
                      />
                      <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-1 py-0.5 text-[7px] font-semibold tracking-[0.16em] text-slate-400">
                        {code}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1 py-1.5 pr-2">
                      <div className="flex items-center gap-1">
                        <span
                          className={`text-[11px] ${isActive ? 'font-semibold text-amber-300' : 'text-slate-300'}`}
                        >
                          {shortCode}
                        </span>
                        <span className="rounded-full bg-white/[0.04] px-1 py-0.5 text-[7px] uppercase tracking-[0.16em] text-slate-500">
                          {t.id}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-1">
                        <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-1 py-0.5 text-[7px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                          {t.tag}
                        </span>
                      </div>
                    </div>
                    {isActive && (
                      <svg
                        className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-300"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2.5}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </>
      )}

      {/* 余额弹窗 */}
      <BalancePopup
        open={balancePopupOpen}
        multiResult={multiBalanceResult}
        balanceStatus={balanceStatus}
        balanceMessage={balanceMessage}
        buttonRef={balanceBtnRef}
        onClose={() => setBalancePopupOpen(false)}
        onRefresh={async () => {
          setBalanceStatus('loading')
          setMultiBalanceResult(null)
          try {
            const multi = await fetchAllBalances()
            setMultiBalanceResult(multi)
            const hasSome = multi.stations.some(s => s.ok)
            setBalanceStatus(hasSome ? 'ok' : 'fail')
            setBalanceMessage(
              hasSome
                ? ''
                : multi.stations[0]?.ok === false
                  ? (multi.stations[0] as { message: string }).message
                  : '查询失败',
            )
          } catch (err) {
            setBalanceStatus('fail')
            setBalanceMessage(`查询失败: ${err instanceof Error ? err.message : String(err)}`)
          }
        }}
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
          setModelList(modelIds)
          setModel(activeModelId)
        }}
      />

      {/* 选择模型弹窗：悬浮模式，固定定位，可超出设置弹窗，支持拖拽缩放 */}
      {modelSelectOpen && (
        <div
          className="overlay-dark fixed inset-0 z-[9999] flex items-center justify-center"
          onClick={e => {
            if (e.target === e.currentTarget) setModelSelectOpen(false)
          }}
        >
          <div
            className="glass-popup popup-enter relative flex flex-col overflow-hidden"
            style={{
              width: modelModalSize.w,
              height: modelModalSize.h,
              maxWidth: '95vw',
              maxHeight: '95vh',
              minWidth: 520,
              minHeight: 400,
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* 顶部标题栏 */}
            <div className="flex flex-shrink-0 items-center justify-between border-b border-white/[0.06] px-5 py-4">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold text-slate-100">选择调用模型</h3>
              </div>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <svg
                    className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                  <input
                    type="text"
                    className="w-48 rounded-lg border border-white/[0.08] bg-white/[0.04] py-1.5 pl-8 pr-3 text-sm text-slate-200 focus:border-primary-500/30 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                    placeholder="搜索模型 id…"
                    value={modelSearchQuery}
                    onChange={e => setModelSearchQuery(e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  className="rounded-lg p-1 text-2xl leading-none text-slate-500 transition hover:bg-white/[0.06] hover:text-slate-300"
                  onClick={() => setModelSelectOpen(false)}
                >
                  ×
                </button>
              </div>
            </div>

            {/* 主体：左侧筛选 + 右侧列表 */}
            <div className="flex min-h-0 flex-1 overflow-hidden">
              {/* 左侧筛选面板 */}
              <div className="app-scrollbar flex w-52 flex-shrink-0 flex-col overflow-y-auto border-r border-white/[0.06]">
                {/* 模型标签 */}
                <div className="px-3 py-2.5">
                  <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    模型标签
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <button
                      type="button"
                      className={`w-full rounded-lg px-2.5 py-1.5 text-left text-xs transition ${!filterCategoryTag ? 'bg-primary-500/20 font-medium text-primary-400' : 'text-slate-400 hover:bg-white/[0.04]'}`}
                      onClick={() => setFilterCategoryTag(null)}
                    >
                      全部标签
                    </button>
                    {MODEL_CATEGORY_TAGS.map(tag => (
                      <button
                        key={tag}
                        type="button"
                        className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs transition ${filterCategoryTag === tag ? 'bg-primary-500/20 font-medium text-primary-400' : 'text-slate-400 hover:bg-white/[0.04]'}`}
                        onClick={() => setFilterCategoryTag(filterCategoryTag === tag ? null : tag)}
                      >
                        <span>{tag}</span>
                        {filterCategoryTag === tag && (
                          <svg
                            className="h-3 w-3"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={3}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
                {/* 模型厂商 */}
                <div className="border-t border-white/[0.06] px-3 py-2.5">
                  <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    模型厂商
                    <a
                      href="https://ai.t8star.cn/models"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="normal-case text-primary-400 hover:underline"
                    >
                      参考
                    </a>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <button
                      type="button"
                      className={`w-full rounded-lg px-2.5 py-1.5 text-left text-xs transition ${!filterVendorTag ? 'bg-primary-500/20 font-medium text-primary-400' : 'text-slate-400 hover:bg-white/[0.04]'}`}
                      onClick={() => setFilterVendorTag(null)}
                    >
                      全部厂商
                    </button>
                    {MODEL_VENDOR_TAGS.map(tag => (
                      <button
                        key={tag}
                        type="button"
                        className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs transition ${filterVendorTag === tag ? 'bg-primary-500/20 font-medium text-primary-400' : 'text-slate-400 hover:bg-white/[0.04]'}`}
                        onClick={() => setFilterVendorTag(filterVendorTag === tag ? null : tag)}
                      >
                        <span>{tag}</span>
                        {filterVendorTag === tag && (
                          <svg
                            className="h-3 w-3"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={3}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* 右侧模型列表 */}
              <div className="app-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
                {fetchedModelList.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-500">暂无模型</p>
                ) : (
                  (() => {
                    const baseGroups = filterGroupsBySearch(
                      groupModelsByCategory(fetchedModelList),
                      modelSearchQuery,
                    )
                    const filtered = filterGroupsByTags(
                      baseGroups,
                      filterCategoryTag,
                      filterVendorTag,
                    )
                    return filtered.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-16 text-slate-500">
                        <svg
                          className="mb-3 h-12 w-12 text-slate-300"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.5}
                            d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                        <p className="text-sm">没有匹配的模型</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {filtered.map(({ category, models }) => (
                          <div key={category}>
                            <div className="mb-1 flex items-center gap-2 px-2 py-1.5 text-xs font-medium text-slate-500">
                              <span className="flex-1 border-b border-white/[0.06] pb-1">
                                {category}
                              </span>
                              <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-slate-400">
                                {models.length}
                              </span>
                            </div>
                            <div className="grid grid-cols-1 gap-0.5">
                              {models.map(id => {
                                const info = getModelDisplayInfo(id)
                                const priceInfo = getModelPrice(id)
                                const checked = selectedModelIdsInModal.includes(id)
                                return (
                                  <label
                                    key={id}
                                    className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 transition-all ${checked ? 'border border-primary-500/20 bg-primary-500/10' : 'border border-transparent hover:bg-white/[0.04]'}`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() =>
                                        setSelectedModelIdsInModal(prev =>
                                          prev.includes(id)
                                            ? prev.filter(x => x !== id)
                                            : [...prev, id],
                                        )
                                      }
                                      className="h-4 w-4 flex-shrink-0 rounded text-primary-500"
                                    />
                                    <div className="min-w-0 flex-1">
                                      <div
                                        className={`truncate text-sm ${checked ? 'font-medium text-primary-400' : 'text-slate-300'}`}
                                        title={id}
                                      >
                                        {id}
                                      </div>
                                      <div className="mt-0.5 flex items-center gap-1">
                                        {info.categoryTag && (
                                          <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-slate-400">
                                            {info.categoryTag}
                                          </span>
                                        )}
                                        {info.vendorTag && (
                                          <span className="rounded bg-primary-500/10 px-1.5 py-0.5 text-[10px] text-primary-400">
                                            {info.vendorTag}
                                          </span>
                                        )}
                                        <span
                                          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${priceInfo.price === '询价' ? 'bg-white/[0.04] text-slate-500' : 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-400'}`}
                                        >
                                          {priceInfo.price}
                                          {priceInfo.note && (
                                            <span className="ml-0.5 opacity-70">
                                              {priceInfo.note}
                                            </span>
                                          )}
                                        </span>
                                      </div>
                                    </div>
                                  </label>
                                )
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  })()
                )}
              </div>
            </div>

            {/* 底部操作栏 */}
            <div className="flex flex-shrink-0 items-center justify-between gap-2 border-t border-white/[0.06] px-5 py-3.5">
              {/* 左下角：已选数量 */}
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  className={`flex cursor-pointer items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-semibold transition-all ${selectedModelIdsInModal.length > 0 ? 'gradient-button text-white' : 'bg-white/[0.06] text-slate-500 hover:bg-white/[0.1]'}`}
                  title="点击管理已选模型"
                  onClick={() => {
                    // 同步当前勾选到 settingsForm，不关闭选择模型弹窗，叠加打开管理弹窗
                    setSettingsForm(f => ({
                      ...f,
                      selectedModelIds: selectedModelIdsInModal,
                      modelList: fetchedModelList,
                    }))
                    setSelectedModelManageOpen(true)
                  }}
                >
                  <svg
                    className="h-3.5 w-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2.5}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  已选{' '}
                  <span
                    className={`text-base font-bold leading-none ${selectedModelIdsInModal.length > 0 ? 'text-white' : 'text-slate-500'}`}
                  >
                    {selectedModelIdsInModal.length}
                  </span>{' '}
                  个模型
                  <svg
                    className="h-3 w-3 opacity-70"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2.5}
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                    />
                  </svg>
                </button>
                {selectedModelIdsInModal.length > 0 && (
                  <button
                    type="button"
                    className="rounded-lg px-2 py-1 text-xs text-slate-500 transition hover:bg-red-500/10 hover:text-red-400"
                    onClick={() => setSelectedModelIdsInModal([])}
                  >
                    清空选择
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="glass-button rounded-lg px-4 py-2 text-sm text-slate-300 transition"
                  onClick={() => setModelSelectOpen(false)}
                >
                  取消
                </button>
                <button
                  type="button"
                  className="gradient-button rounded-lg px-4 py-2 text-sm font-medium text-white"
                  onClick={() => {
                    setSettingsForm(f => ({
                      ...f,
                      selectedModelIds: selectedModelIdsInModal,
                      modelList: fetchedModelList,
                    }))
                    setModelSelectOpen(false)
                  }}
                >
                  确定
                </button>
              </div>
            </div>

            {/* 右下角拖拽缩放把手 */}
            <div
              className="group absolute bottom-0 right-0 z-10 flex h-5 w-5 cursor-se-resize items-end justify-end pb-1 pr-1"
              onMouseDown={e => {
                e.preventDefault()
                e.stopPropagation()
                modelModalResizing.current = true
                modelModalResizeStart.current = {
                  mouseX: e.clientX,
                  mouseY: e.clientY,
                  w: modelModalSize.w,
                  h: modelModalSize.h,
                }
                document.body.style.cursor = 'se-resize'
                document.body.style.userSelect = 'none'
              }}
            >
              <svg
                className="h-3 w-3 text-slate-400 transition-colors group-hover:text-primary-400"
                viewBox="0 0 10 10"
                fill="currentColor"
              >
                <path
                  d="M8 2L2 8M10 5L5 10M10 8L8 10"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  fill="none"
                />
              </svg>
            </div>
          </div>
        </div>
      )}

      {/* 已选模型管理弹窗（叠加在选择模型弹窗之上） */}
      {selectedModelManageOpen && (
        <div
          className="overlay-dark fixed inset-0 z-[10000] flex items-center justify-center"
          onClick={e => {
            if (e.target === e.currentTarget) {
              setSelectedModelIdsInModal(settingsForm.selectedModelIds)
              setSelectedModelManageOpen(false)
            }
          }}
        >
          <div
            className="popup-enter flex flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.06] shadow-2xl"
            style={{ width: 'min(90vw,600px)', maxHeight: 'min(90vh,680px)' }}
          >
            <div className="flex flex-shrink-0 items-center justify-between border-b border-white/[0.06] bg-gradient-to-r from-emerald-500/10 to-teal-500/10 px-5 py-4">
              <div className="flex items-center gap-3">
                <h3 className="text-base font-semibold text-slate-100">已选模型管理</h3>
                <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-400">
                  {settingsForm.selectedModelIds.length} 个
                </span>
              </div>
              <button
                type="button"
                className="rounded-lg p-1 text-2xl leading-none text-slate-400 transition hover:bg-white/[0.08] hover:text-slate-400"
                onClick={() => {
                  setSelectedModelIdsInModal(settingsForm.selectedModelIds)
                  setSelectedModelManageOpen(false)
                }}
              >
                ×
              </button>
            </div>

            {/* 主体：左列已选 + 右列可添加 */}
            <div className="flex min-h-0 flex-1 overflow-hidden">
              {/* 左：已选列表 */}
              <div className="flex min-w-0 flex-1 flex-col border-r border-white/[0.06]">
                <div className="flex items-center justify-between border-b border-white/[0.04] bg-white/[0.03] px-4 py-2.5">
                  <span className="text-xs font-semibold text-slate-400">当前已选</span>
                  <button
                    type="button"
                    className="text-[10px] text-slate-400 transition hover:text-red-500"
                    onClick={() => {
                      // eslint-disable-next-line no-alert
                      if (confirm('确定清空所有已选模型吗？'))
                        setSettingsForm(f => ({ ...f, selectedModelIds: [] }))
                    }}
                  >
                    清空全部
                  </button>
                </div>
                <div className="app-scrollbar min-h-0 flex-1 overflow-y-auto p-3">
                  {settingsForm.selectedModelIds.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                      <svg
                        className="mb-2 h-10 w-10 text-slate-200"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
                        />
                      </svg>
                      <p className="text-xs">暂无已选模型</p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {settingsForm.selectedModelIds.map((id, idx) => {
                        const info = getModelDisplayInfo(id)
                        const priceInfo = getModelPrice(id)
                        return (
                          <div
                            key={id}
                            className="group flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.04] px-3 py-2 transition-all hover:border-red-500/20 hover:bg-red-500/[0.04]"
                          >
                            <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded bg-emerald-500/15 text-[9px] font-bold text-emerald-400">
                              {idx + 1}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div
                                className="truncate text-xs font-medium text-slate-300"
                                title={id}
                              >
                                {id}
                              </div>
                              <div className="mt-0.5 flex items-center gap-1">
                                {info.vendorTag && (
                                  <span className="rounded bg-primary-500/10 px-1 py-0 text-[9px] text-primary-400">
                                    {info.vendorTag}
                                  </span>
                                )}
                                <span
                                  className={`rounded px-1 py-0 text-[9px] ${priceInfo.price === '询价' ? 'bg-white/[0.08] text-slate-400' : 'bg-emerald-500/10 text-emerald-400'}`}
                                >
                                  {priceInfo.price}
                                </span>
                              </div>
                            </div>
                            <button
                              type="button"
                              className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg text-slate-300 opacity-0 transition-all hover:bg-red-100 hover:text-red-500 group-hover:opacity-100"
                              title="移除"
                              onClick={() =>
                                setSettingsForm(f => ({
                                  ...f,
                                  selectedModelIds: f.selectedModelIds.filter(x => x !== id),
                                }))
                              }
                            >
                              <svg
                                className="h-3.5 w-3.5"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M6 18L18 6M6 6l12 12"
                                />
                              </svg>
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* 右：从已获取列表中添加 */}
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="border-b border-white/[0.04] bg-white/[0.03] px-4 py-2.5">
                  <span className="text-xs font-semibold text-slate-400">添加模型</span>
                  {fetchedModelList.length === 0 && (
                    <span className="ml-1.5 text-[9px] text-slate-400">
                      请先在设置中获取模型列表
                    </span>
                  )}
                </div>
                {fetchedModelList.length > 0 ? (
                  <>
                    <div className="border-b border-white/[0.04] px-3 py-2">
                      <input
                        type="text"
                        className="w-full rounded-lg border border-white/[0.08] bg-white/[0.06] px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary-500/30"
                        placeholder="搜索模型 id…"
                        value={modelSearchQuery}
                        onChange={e => setModelSearchQuery(e.target.value)}
                      />
                    </div>
                    <div className="app-scrollbar min-h-0 flex-1 overflow-y-auto p-3">
                      <div className="space-y-0.5">
                        {fetchedModelList
                          .filter(
                            id =>
                              !modelSearchQuery.trim() ||
                              id.toLowerCase().includes(modelSearchQuery.toLowerCase()),
                          )
                          .map(id => {
                            const isAdded = settingsForm.selectedModelIds.includes(id)
                            const info = getModelDisplayInfo(id)
                            const priceInfo = getModelPrice(id)
                            return (
                              <div
                                key={id}
                                className={`flex items-center gap-2 rounded-xl border px-3 py-2 transition-all ${isAdded ? 'border-emerald-500/20 bg-emerald-500/10' : 'border-white/[0.06] bg-white/[0.06] hover:border-primary-500/20 hover:bg-primary-500/[0.04]'}`}
                              >
                                <div className="min-w-0 flex-1">
                                  <div
                                    className={`truncate text-xs ${isAdded ? 'font-medium text-emerald-400' : 'text-slate-300'}`}
                                    title={id}
                                  >
                                    {id}
                                  </div>
                                  <div className="mt-0.5 flex items-center gap-1">
                                    {info.categoryTag && (
                                      <span className="rounded bg-white/[0.08] px-1 py-0 text-[9px] text-slate-500">
                                        {info.categoryTag}
                                      </span>
                                    )}
                                    {info.vendorTag && (
                                      <span className="rounded bg-primary-500/10 px-1 py-0 text-[9px] text-primary-400">
                                        {info.vendorTag}
                                      </span>
                                    )}
                                    <span
                                      className={`rounded px-1 py-0 text-[9px] ${priceInfo.price === '询价' ? 'bg-white/[0.08] text-slate-400' : 'bg-emerald-500/10 text-emerald-400'}`}
                                    >
                                      {priceInfo.price}
                                    </span>
                                  </div>
                                </div>
                                {isAdded ? (
                                  <span className="flex-shrink-0 text-[9px] text-emerald-500">
                                    已添加
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg bg-primary-500 text-white transition hover:bg-primary-600"
                                    title="添加"
                                    onClick={() =>
                                      setSettingsForm(f => ({
                                        ...f,
                                        selectedModelIds: [...f.selectedModelIds, id],
                                      }))
                                    }
                                  >
                                    <svg
                                      className="h-3.5 w-3.5"
                                      fill="none"
                                      viewBox="0 0 24 24"
                                      stroke="currentColor"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2.5}
                                        d="M12 4v16m8-8H4"
                                      />
                                    </svg>
                                  </button>
                                )}
                              </div>
                            )
                          })}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-1 flex-col items-center justify-center p-6 text-center text-slate-400">
                    <svg
                      className="mb-3 h-12 w-12 text-slate-200"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"
                      />
                    </svg>
                    <p className="text-xs">暂无可用模型库</p>
                    <p className="mt-1 text-[10px] text-slate-300">
                      请先在设置中点击「自动获取模型」
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-shrink-0 items-center justify-between border-t border-white/[0.06] bg-white/[0.06] px-5 py-3.5">
              <span className="text-xs text-slate-400">修改会即时生效</span>
              <button
                type="button"
                className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600"
                onClick={() => {
                  // 同步到 modelList 状态
                  if (settingsForm.selectedModelIds.length) {
                    setModelList(settingsForm.selectedModelIds)
                    const cur = useGenerationStore.getState().model
                    setModel(
                      settingsForm.selectedModelIds.includes(cur)
                        ? cur
                        : settingsForm.selectedModelIds[0],
                    )
                    setApiSettings({
                      selectedModelIds: settingsForm.selectedModelIds,
                      modelList: settingsForm.modelList,
                    })
                  }
                  // 同步回选择弹窗的勾选状态
                  setSelectedModelIdsInModal(settingsForm.selectedModelIds)
                  setSelectedModelManageOpen(false)
                }}
              >
                完成
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 主体区域 - 适配固定header */}
      <main
        className="grid-veil relative z-10 flex flex-1 gap-2 overflow-hidden px-2 pb-2 pt-2"
        style={{ minHeight: 0 }}
      >
        {/* 左侧历史栏 - 靠左停靠，展开时与生成结果并排 */}
        <div
          className={`glass-card workspace-panel flex flex-shrink-0 flex-col overflow-hidden transition-all duration-300 ${
            historyPanelOpen ? 'w-[300px] opacity-100' : 'pointer-events-none w-0 opacity-0'
          }`}
          style={{ borderRadius: '1rem' }}
        >
          {/* 头部 */}
          <div
            className="panel-titlebar relative flex flex-shrink-0 items-center justify-between border-b border-white/[0.06] px-3 py-2.5"
            style={historyPanelOpen ? {} : { display: 'none' }}
          >
            <div className="flex items-center gap-2">
              <svg
                className="h-4 w-4 text-white/80"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <h2 className="text-sm font-bold text-slate-100">生图历史</h2>
              {generationHistory.length > 0 && (
                <span className="rounded-full bg-white/25 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white">
                  {generationHistory.length}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {/* 排版切换：列表 / 网格 */}
              {generationHistory.length > 0 && (
                <div className="flex items-center rounded-lg bg-white/20 p-0.5">
                  <button
                    onClick={() => setHistoryLayout('list')}
                    title="列表视图"
                    className={`rounded px-1.5 py-0.5 transition ${historyLayout === 'list' ? 'bg-white/90 text-primary-400' : 'text-white/70 hover:text-white'}`}
                  >
                    <svg
                      className="h-3.5 w-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M4 6h16M4 10h16M4 14h16M4 18h16"
                      />
                    </svg>
                  </button>
                  <button
                    onClick={() => setHistoryLayout('grid')}
                    title="网格视图"
                    className={`rounded px-1.5 py-0.5 transition ${historyLayout === 'grid' ? 'bg-white/90 text-primary-400' : 'text-white/70 hover:text-white'}`}
                  >
                    <svg
                      className="h-3.5 w-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M3.75 6A.75.75 0 016 .75v3a.75.75 0 01-1.5 0V6.75A.75.75 0 013.75 6zm10.5 0A.75.75 0 0114.5 6v3a.75.75 0 01-1.5 0V6.75A.75.75 0 0114.25 6zM3.75 15.75a.75.75 0 01.75-.75h3a.75.75 0 010 1.5h-3a.75.75 0 01-.75-.75zM14.25 15a.75.75 0 00.75-.75h-3a.75.75 0 000 1.5h3a.75.75 0 00.75-.75z"
                      />
                    </svg>
                  </button>
                </div>
              )}
              {generationHistory.length > 0 && (
                <button
                  onClick={() => {
                    setHistoryBatchMode(!historyBatchMode)
                    setHistorySelected(new Set())
                  }}
                  className={`rounded-lg px-2 py-1 text-[11px] font-medium text-white transition ${historyBatchMode ? 'bg-white/30 ring-1 ring-white/40' : 'text-white/80 hover:bg-white/20'}`}
                >
                  {historyBatchMode ? '退出批量' : '批量'}
                </button>
              )}
              {generationHistory.length > 0 && !historyBatchMode && (
                <button
                  onClick={() => {
                    // eslint-disable-next-line no-alert
                    if (confirm('确定要清空所有历史记录吗？')) {
                      setGenerationHistory([])
                      saveHistory([])
                    }
                  }}
                  className="rounded-lg px-1.5 py-1 text-[11px] text-white/60 transition hover:bg-red-500/40 hover:text-white"
                >
                  清空
                </button>
              )}
            </div>
          </div>

          {/* 历史列表 */}
          <div
            className="app-scrollbar flex-1 overflow-y-auto"
            style={historyPanelOpen ? {} : { display: 'none' }}
          >
            {generationHistory.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center px-4 text-slate-400">
                <svg
                  className="mb-2 h-10 w-10 opacity-30"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <p className="text-xs">暂无历史记录</p>
              </div>
            ) : (
              <>
                {/* 网格视图 */}
                {historyLayout === 'grid' ? (
                  <div className="grid grid-cols-2 gap-2 p-2">
                    {generationHistory.map(entry => {
                      const hasError = !!entry.error
                      const isPending = entry.results.length === 0 && !hasError
                      const firstImg = entry.results[0]
                      return (
                        <div
                          key={entry.id}
                          className={`group relative cursor-pointer overflow-hidden rounded-xl transition hover:ring-2 hover:ring-primary-400/50 ${
                            historySelected.has(entry.id) ? 'ring-2 ring-primary-500' : ''
                          } ${viewedHistoryIds.has(entry.id) ? 'ring-1 ring-emerald-400/40' : ''}`}
                          onClick={() => {
                            if (historyBatchMode) {
                              setHistorySelected(prev => {
                                const next = new Set(prev)
                                if (next.has(entry.id)) {
                                  next.delete(entry.id)
                                } else {
                                  next.add(entry.id)
                                }
                                return next
                              })
                            } else if (firstImg) {
                              if (status !== 'running') {
                                setResults(entry.results)
                                setResultActiveIdx(0)
                              }
                              setViewedHistoryIds(prev => new Set(prev).add(entry.id))
                            }
                          }}
                          onDoubleClick={e => {
                            if (!historyBatchMode) {
                              e.stopPropagation()
                              if (hasError) {
                                // 打开错误详情
                                const elapsedMs = entry.createdAt
                                  ? Date.now() - entry.createdAt
                                  : null
                                const elapsedStr = elapsedMs
                                  ? `（耗时 ${Math.floor(elapsedMs / 60000)}分${Math.floor((elapsedMs % 60000) / 1000)}秒）`
                                  : ''
                                const errorLog = {
                                  time: new Date(
                                    entry.createdAt || Date.now(),
                                  ).toLocaleTimeString(),
                                  endpoint: `生成图片${elapsedStr}`,
                                  error: entry.error,
                                  request: `[模型] ${entry.model}\n[尺寸] ${entry.width}×${entry.height}\n[批次] ${entry.batchSize}\n[正向提示词]\n${entry.prompt}${entry.negativePrompt ? `\n\n[反向提示词]\n${entry.negativePrompt}` : ''}`,
                                  httpErrorBody: `错误类型: ${entry.error?.includes('超时') ? '生成超时（12分钟）' : '生成失败'}\n记录时间: ${new Date(entry.createdAt || Date.now()).toLocaleString()}${entry.createdAt ? `\n开始时间: ${new Date(entry.createdAt).toLocaleString()}` : ''}${elapsedMs ? `\n总耗时: ${Math.floor(elapsedMs / 60000)}分${Math.floor((elapsedMs % 60000) / 1000)}秒` : ''}`,
                                }
                                useUiStore.getState().setSelectedLogEntry(errorLog)
                                useUiStore.getState().setShowDetailedLog(true)
                              } else if (firstImg) {
                                openHistoryPreview(entry.results, 0, entry.id)
                              }
                            }
                          }}
                        >
                          {firstImg ? (
                            <img
                              src={firstImg.url}
                              alt=""
                              className="aspect-square w-full cursor-zoom-in bg-white/[0.06] object-cover transition hover:opacity-90"
                              onDoubleClick={() => openHistoryPreview(entry.results, 0, entry.id)}
                              title="双击查看大图"
                            />
                          ) : (
                            <div className="flex aspect-square w-full items-center justify-center bg-white/[0.04]">
                              {hasError ? (
                                <svg
                                  className="h-6 w-6 text-red-400"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                                  />
                                </svg>
                              ) : (
                                <svg
                                  className="h-6 w-6 animate-spin text-slate-500"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                >
                                  <circle
                                    className="opacity-25"
                                    cx="12"
                                    cy="12"
                                    r="10"
                                    stroke="currentColor"
                                    strokeWidth="4"
                                  />
                                  <path
                                    className="opacity-75"
                                    fill="currentColor"
                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                                  />
                                </svg>
                              )}
                            </div>
                          )}
                          {/* 悬停遮罩 */}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 transition group-hover:opacity-100" />
                          {/* 底部信息 */}
                          <div className="absolute bottom-0 left-0 right-0 p-1.5">
                            <p className="truncate text-[9px] text-white/80">{entry.prompt}</p>
                            <div className="mt-0.5 flex items-center gap-1">
                              {entry.results.length > 0 && (
                                <span className="text-[8px] text-primary-300">
                                  {entry.results.length}张
                                </span>
                              )}
                              {isPending && (
                                <span className="animate-pulse text-[8px] text-amber-300">
                                  生图中
                                </span>
                              )}
                              {hasError && (
                                <span className="truncate text-[8px] text-red-300">
                                  {entry.error}
                                </span>
                              )}
                            </div>
                          </div>
                          {/* 批量选择 */}
                          {historyBatchMode && (
                            <div className="absolute left-1 top-1">
                              <div
                                className={`flex h-4 w-4 items-center justify-center rounded border transition ${
                                  historySelected.has(entry.id)
                                    ? 'border-primary-500 bg-primary-500'
                                    : 'border-white/50 bg-black/40'
                                }`}
                              >
                                {historySelected.has(entry.id) && (
                                  <svg
                                    className="h-3 w-3 text-white"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={3}
                                      d="M5 13l4 4L19 7"
                                    />
                                  </svg>
                                )}
                              </div>
                            </div>
                          )}
                          {viewedHistoryIds.has(entry.id) && !historyBatchMode && (
                            <div className="absolute right-1 top-1 rounded bg-emerald-500/80 px-1 py-0.5 text-[7px] font-bold text-white shadow">
                              已查看
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  /* 列表视图 */
                  generationHistory.map(entry => {
                    const hasError = !!entry.error
                    const isPending = entry.results.length === 0 && !hasError
                    const firstImg = entry.results[0]
                    return (
                      <div
                        key={entry.id}
                        className={`group cursor-pointer border-b border-white/20 p-2.5 transition hover:bg-white/10 ${
                          historySelected.has(entry.id)
                            ? 'bg-primary-500/20 ring-1 ring-primary-400/40'
                            : viewedHistoryIds.has(entry.id)
                              ? 'border-l-2 border-l-emerald-400/60'
                              : ''
                        } ${historyBatchMode ? 'pl-3' : ''}`}
                        onClick={() => {
                          if (historyBatchMode) {
                            setHistorySelected(prev => {
                              const next = new Set(prev)
                              if (next.has(entry.id)) {
                                next.delete(entry.id)
                              } else {
                                next.add(entry.id)
                              }
                              return next
                            })
                          } else if (firstImg) {
                            if (status !== 'running') {
                              setResults(entry.results)
                              setResultActiveIdx(0)
                            }
                            setViewedHistoryIds(prev => new Set(prev).add(entry.id))
                          }
                        }}
                        onDoubleClick={() => {
                          if (!historyBatchMode) {
                            if (hasError) {
                              const elapsedMs = entry.createdAt
                                ? Date.now() - entry.createdAt
                                : null
                              const elapsedStr = elapsedMs
                                ? `（耗时 ${Math.floor(elapsedMs / 60000)}分${Math.floor((elapsedMs % 60000) / 1000)}秒）`
                                : ''
                              const errorLog = {
                                time: new Date(entry.createdAt || Date.now()).toLocaleTimeString(),
                                endpoint: `生成图片${elapsedStr}`,
                                error: entry.error,
                                request: `[模型] ${entry.model}\n[尺寸] ${entry.width}×${entry.height}\n[批次] ${entry.batchSize}\n[正向提示词]\n${entry.prompt}${entry.negativePrompt ? `\n\n[反向提示词]\n${entry.negativePrompt}` : ''}`,
                                httpErrorBody: `错误类型: ${entry.error?.includes('超时') ? '生成超时（5分钟）' : '生成失败'}\n记录时间: ${new Date(entry.createdAt || Date.now()).toLocaleString()}${entry.createdAt ? `\n开始时间: ${new Date(entry.createdAt).toLocaleString()}` : ''}${elapsedMs ? `\n总耗时: ${Math.floor(elapsedMs / 60000)}分${Math.floor((elapsedMs % 60000) / 1000)}秒` : ''}`,
                              }
                              useUiStore.getState().setSelectedLogEntry(errorLog)
                              useUiStore.getState().setShowDetailedLog(true)
                            } else if (firstImg) {
                              openHistoryPreview(entry.results, 0, entry.id)
                            }
                          }
                        }}
                      >
                        <div className="flex items-start gap-2">
                          {firstImg ? (
                            <img
                              src={firstImg.url}
                              alt=""
                              className="h-14 w-14 flex-shrink-0 cursor-zoom-in rounded-lg bg-white/[0.06] object-cover transition hover:ring-2 hover:ring-primary-400"
                              onDoubleClick={() => openHistoryPreview(entry.results, 0, entry.id)}
                              title="双击查看大图"
                            />
                          ) : (
                            <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-lg bg-white/[0.04]">
                              {hasError ? (
                                <svg
                                  className="h-5 w-5 text-red-400"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                                  />
                                </svg>
                              ) : (
                                <svg
                                  className="h-5 w-5 animate-spin text-slate-500"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                >
                                  <circle
                                    className="opacity-25"
                                    cx="12"
                                    cy="12"
                                    r="10"
                                    stroke="currentColor"
                                    strokeWidth="4"
                                  />
                                  <path
                                    className="opacity-75"
                                    fill="currentColor"
                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                                  />
                                </svg>
                              )}
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-2 text-[11px] leading-relaxed text-slate-400 dark:text-slate-300">
                              {entry.prompt}
                            </p>
                            <div className="mt-1 flex flex-wrap items-center gap-1">
                              <span className="text-[9px] text-slate-500">{entry.time}</span>
                              <span className="rounded bg-white/[0.06] px-1 text-[9px] text-slate-500">
                                {entry.model}
                              </span>
                              {entry.results.length > 0 && (
                                <span className="text-[9px] text-primary-400">
                                  {entry.results.length}张
                                </span>
                              )}
                              {isPending && (
                                <span className="animate-pulse text-[9px] text-amber-400">
                                  生图中...
                                </span>
                              )}
                              {hasError && (
                                <span className="line-clamp-1 text-[9px] text-red-400">
                                  {entry.error}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </>
            )}
          </div>

          {/* 批量操作栏 */}
          {historyBatchMode && historySelected.size > 0 && (
            <div className="flex flex-shrink-0 items-center gap-2 border-t border-white/20 bg-white/10 px-3 py-2">
              <span className="text-xs text-white/80">已选 {historySelected.size}</span>
              <button
                onClick={() => {
                  setGenerationHistory(prev => {
                    const filtered = prev.filter(h => !historySelected.has(h.id))
                    saveHistory(filtered)
                    return filtered
                  })
                  setHistorySelected(new Set())
                }}
                className="rounded bg-red-500/70 px-2 py-1 text-[11px] text-white transition hover:bg-red-500/100"
              >
                删除
              </button>
              <button
                onClick={() => {
                  setHistoryBatchMode(false)
                  setHistorySelected(new Set())
                }}
                className="rounded bg-white/20 px-2 py-1 text-[11px] text-white/80 transition hover:bg-white/30"
              >
                取消
              </button>
            </div>
          )}
        </div>

        {/* 生成结果区 */}
        <div className="flex-1 overflow-hidden">
          <ResultPanel
            results={results}
            setResults={setResults}
            resultActiveIdx={resultActiveIdx}
            setResultActiveIdx={setResultActiveIdx}
            selectedImageIds={selectedImageIds}
            setSelectedImageIds={setSelectedImageIds}
            status={status}
            storeStatus={storeStatus}
            elapsedSeconds={elapsedSeconds}
            progressPct={progressPct}
            lastDuration={lastDuration}
            batchSize={batchSize}
            downloadStatus={downloadStatus}
            toggleSelectAll={toggleSelectAll}
            handleBatchDownload={handleBatchDownload}
            setPreviewImage={setPreviewImage}
            generationSlots={generationSlots.filter(slot => !('hidden' in slot && slot.hidden))}
            parallelCount={parallelCount}
            slotViewMode={slotViewMode}
            setSlotViewMode={setSlotViewMode}
            activeSlotId={activeSlotId}
            setActiveSlotId={setActiveSlotId}
            onSelectSlot={slot => {
              setActiveSlotId(slot.id)
              setResults(slot.results)
              setResultActiveIdx(0)
              setSelectedImageIds(new Set())
            }}
            onCloseSlot={slotId => {
              const timer = slotTimersRef.current.get(slotId)
              if (timer) {
                clearInterval(timer)
                slotTimersRef.current.delete(slotId)
              }
              setGenerationSlots(prev => {
                const next = prev.filter(slot => slot.id !== slotId)
                if (activeSlotId === slotId) {
                  const nextSlot = next[0]
                  setActiveSlotId(nextSlot?.id ?? null)
                  setResults(nextSlot?.results ?? [])
                  setResultActiveIdx(0)
                  setSelectedImageIds(new Set())
                }
                return next
              })
            }}
            onRetrySlot={slot => {
              setPrompt(slot.request.prompt)
              setNegativePrompt(slot.request.negativePrompt)
              setModel(slot.request.model)
              setBatchSize(slot.request.batchSize)
              setResolutionPreset(slot.request.resolutionPreset)
              setSizeTier(slot.request.sizeTier)
              setTimeout(() => handleGenerateRef.current(), 0)
            }}
          />
        </div>

        {/* 图片预览模态框 */}
        <ImagePreviewModal
          image={previewImage}
          onClose={() => {
            setPreviewImage(null)
            if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
          }}
        />

        {/* 详细日志弹窗 */}
        <DetailedLogDialog />

        {/* 无限画布 */}
        {whiteboardOpen && (
          <Suspense
            fallback={
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0a0f]">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-400 border-t-transparent" />
              </div>
            }
          >
            <InfiniteCanvas onClose={() => setWhiteboardOpen(false)} />
          </Suspense>
        )}

        {/* ── 模型选择弹窗（获取模型列表后弹出）────────────────────── */}
        {modelPickerOpen &&
          (() => {
            // 计算经过筛选+搜索后的模型列表
            const allGroups = groupModelsByCategory(modelPickerList)
            const searchedGroups = filterGroupsBySearch(allGroups, modelPickerSearch)
            const filteredGroups = filterGroupsByTags(
              searchedGroups,
              modelPickerCategoryTag,
              modelPickerVendorTag,
            )
            const filteredModels = filteredGroups.flatMap(g => g.models)

            // 厂商列表（动态，基于当前拉取到的模型）
            const dynamicVendors = Array.from(
              new Set(
                modelPickerList
                  .map(id => {
                    const info = getModelDisplayInfo(id)
                    return info.vendorTag
                  })
                  .filter(Boolean),
              ),
            )

            const toggleModel = (mid: string) => {
              setModelPickerSelected(prev => {
                const next = new Set(prev)
                if (next.has(mid)) next.delete(mid)
                else next.add(mid)
                return next
              })
            }

            const toggleAll = () => {
              const allSelected = filteredModels.every(id => modelPickerSelected.has(id))
              setModelPickerSelected(prev => {
                const next = new Set(prev)
                if (allSelected) filteredModels.forEach(id => next.delete(id))
                else filteredModels.forEach(id => next.add(id))
                return next
              })
            }

            return (
              <div
                className="overlay-dark fixed inset-0 z-[70] flex items-center justify-center"
                onClick={() => setModelPickerOpen(false)}
              >
                <div
                  className="flex flex-col overflow-hidden rounded-2xl bg-white/[0.06] shadow-2xl"
                  style={{ width: 860, maxWidth: '96vw', height: 580, maxHeight: '92vh' }}
                  onClick={e => e.stopPropagation()}
                >
                  {/* 头部 */}
                  <div className="flex flex-shrink-0 items-center justify-between border-b border-white/[0.06] px-5 py-3.5">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-100">选择模型</h3>
                      <p className="mt-0.5 text-[11px] text-slate-400">
                        共 {modelPickerList.length} 个模型 · 已选 {modelPickerSelected.size} 个
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* 搜索框 */}
                      <div className="relative">
                        <svg
                          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                          />
                        </svg>
                        <input
                          type="text"
                          placeholder="搜索模型…"
                          value={modelPickerSearch}
                          onChange={e => setModelPickerSearch(e.target.value)}
                          className="w-44 rounded-lg border border-white/[0.08] bg-white/[0.04] py-1.5 pl-8 pr-3 text-xs focus:border-primary-500/30 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                        />
                      </div>
                      <button
                        onClick={() => setModelPickerOpen(false)}
                        className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/[0.08] hover:text-slate-400"
                      >
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* 主体：左侧筛选 + 右侧列表 */}
                  <div className="flex flex-1 overflow-hidden">
                    {/* 左侧筛选面板 */}
                    <div className="flex w-44 flex-shrink-0 flex-col gap-4 overflow-y-auto border-r border-white/[0.06] px-2.5 py-3">
                      {/* 模型类型 */}
                      <div>
                        <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                          模型类型
                        </p>
                        <div className="flex flex-col gap-0.5">
                          <button
                            onClick={() => setModelPickerCategoryTag(null)}
                            className={`rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors ${modelPickerCategoryTag === null ? 'bg-primary-500/10 font-medium text-primary-400' : 'text-slate-400 hover:bg-white/[0.04]'}`}
                          >
                            全部类型
                          </button>
                          {MODEL_CATEGORY_TAGS.map(tag => (
                            <button
                              key={tag}
                              onClick={() =>
                                setModelPickerCategoryTag(
                                  modelPickerCategoryTag === tag ? null : tag,
                                )
                              }
                              className={`rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors ${modelPickerCategoryTag === tag ? 'bg-primary-500/10 font-medium text-primary-400' : 'text-slate-400 hover:bg-white/[0.04]'}`}
                            >
                              {tag}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* 模型厂商 */}
                      {dynamicVendors.length > 0 && (
                        <div>
                          <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                            模型厂商
                          </p>
                          <div className="flex flex-col gap-0.5">
                            <button
                              onClick={() => setModelPickerVendorTag(null)}
                              className={`rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors ${modelPickerVendorTag === null ? 'bg-violet-50 font-medium text-violet-600' : 'text-slate-400 hover:bg-white/[0.04]'}`}
                            >
                              全部厂商
                            </button>
                            {dynamicVendors.map(tag => (
                              <button
                                key={tag}
                                onClick={() =>
                                  setModelPickerVendorTag(modelPickerVendorTag === tag ? null : tag)
                                }
                                className={`rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors ${modelPickerVendorTag === tag ? 'bg-violet-50 font-medium text-violet-600' : 'text-slate-400 hover:bg-white/[0.04]'}`}
                              >
                                {tag}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 右侧模型列表 */}
                    <div className="flex flex-1 flex-col overflow-hidden">
                      {/* 列表头部：全选 + 计数 */}
                      <div className="flex flex-shrink-0 items-center justify-between border-b border-white/[0.04] px-4 py-2">
                        <div
                          className="flex items-center gap-2"
                          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                        >
                          <button
                            onClick={toggleAll}
                            className="flex items-center gap-1.5 text-xs text-slate-500 transition-colors hover:text-primary-400"
                          >
                            <div
                              className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border-2 transition-colors ${
                                filteredModels.length > 0 &&
                                filteredModels.every(id => modelPickerSelected.has(id))
                                  ? 'border-primary-500 bg-primary-500'
                                  : filteredModels.some(id => modelPickerSelected.has(id))
                                    ? 'border-primary-500/30 bg-primary-500/15'
                                    : 'border-white/[0.12] bg-white/[0.06]'
                              }`}
                            >
                              {filteredModels.length > 0 &&
                                filteredModels.every(id => modelPickerSelected.has(id)) && (
                                  <svg
                                    className="h-2.5 w-2.5 text-white"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={3}
                                      d="M5 13l4 4L19 7"
                                    />
                                  </svg>
                                )}
                            </div>
                            全选当前视图
                          </button>
                          <span className="text-[11px] text-slate-400">
                            （显示 {filteredModels.length} 个）
                          </span>
                        </div>
                        {modelPickerSelected.size > 0 && (
                          <button
                            onClick={() => setModelPickerSelected(new Set())}
                            className="text-[11px] text-slate-400 transition-colors hover:text-red-400"
                          >
                            清除全选
                          </button>
                        )}
                      </div>

                      {/* 模型列表（按分类分组） */}
                      <div className="flex-1 overflow-y-auto px-3 py-2">
                        {filteredGroups.length === 0 ? (
                          <div className="flex h-40 flex-col items-center justify-center text-slate-400">
                            <svg
                              className="mb-2 h-10 w-10 text-slate-200"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={1.5}
                                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                              />
                            </svg>
                            <p className="text-xs">无匹配结果</p>
                          </div>
                        ) : (
                          filteredGroups.map(group => (
                            <div key={group.category} className="mb-3">
                              <p className="sticky top-0 mb-1.5 bg-white/[0.06] px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                                {group.category}
                              </p>
                              <div className="grid grid-cols-2 gap-1">
                                {group.models.map(mid => {
                                  const info = getModelDisplayInfo(mid)
                                  const price = getModelPrice(mid)
                                  const selected = modelPickerSelected.has(mid)
                                  return (
                                    <button
                                      key={mid}
                                      onClick={() => toggleModel(mid)}
                                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition-all ${
                                        selected
                                          ? 'border-primary-500/30 bg-primary-500/10 shadow-sm'
                                          : 'border-white/[0.06] bg-white/[0.06] hover:border-white/[0.08] hover:bg-white/[0.04]'
                                      }`}
                                    >
                                      <div
                                        className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border-2 transition-colors ${
                                          selected
                                            ? 'border-primary-500 bg-primary-500'
                                            : 'border-white/[0.12] bg-white/[0.06]'
                                        }`}
                                      >
                                        {selected && (
                                          <svg
                                            className="h-2.5 w-2.5 text-white"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                          >
                                            <path
                                              strokeLinecap="round"
                                              strokeLinejoin="round"
                                              strokeWidth={3}
                                              d="M5 13l4 4L19 7"
                                            />
                                          </svg>
                                        )}
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <p className="truncate font-mono text-[11px] leading-tight text-slate-300">
                                          {mid}
                                        </p>
                                        <div className="mt-0.5 flex items-center gap-1">
                                          {info.vendorTag && (
                                            <span className="rounded bg-violet-50 px-1 py-0.5 text-[9px] font-medium leading-none text-violet-500">
                                              {info.vendorTag}
                                            </span>
                                          )}
                                          <span className="text-[9px] font-medium leading-none text-emerald-400">
                                            {price.price}
                                          </span>
                                        </div>
                                      </div>
                                    </button>
                                  )
                                })}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 底部操作栏 */}
                  <div className="flex flex-shrink-0 items-center justify-between border-t border-white/[0.06] bg-white/[0.03] px-5 py-3">
                    <span className="text-xs text-slate-400">
                      已选{' '}
                      <span className="font-semibold text-slate-300">
                        {modelPickerSelected.size}
                      </span>{' '}
                      个模型，点击确认后同步到 {modelPickerMode === 'image' ? 'Image' : 'Chat'}{' '}
                      模型列表
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setModelPickerOpen(false)}
                        className="rounded-lg border border-white/[0.08] px-4 py-1.5 text-sm text-slate-400 transition hover:bg-white/[0.08]"
                      >
                        取消
                      </button>
                      <button
                        onClick={() => {
                          const selectedArr = Array.from(modelPickerSelected)
                          const pickerModelIds = new Set(modelPickerList)

                          if (modelPickerMode === 'image') {
                            // ── 写入 imageModels ──
                            const existingMap = new Map(
                              cfgDraft.imageModels.map(m => [m.modelId, m]),
                            )
                            const manualModels = cfgDraft.imageModels.filter(
                              m => !pickerModelIds.has(m.modelId),
                            )
                            const pickerModels: ImageModel[] = selectedArr.map(mid => {
                              const existing = existingMap.get(mid)
                              if (existing) return existing
                              return {
                                id: Math.random().toString(36).slice(2) + Date.now().toString(36),
                                modelId: mid,
                                label: mid,
                                apiKey: '',
                                baseUrl: '',
                              }
                            })
                            const nextModels = [...manualModels, ...pickerModels]
                            const activeStillExists = nextModels.find(
                              m => m.id === cfgDraft.activeImageModelId,
                            )
                            setCfgDraft(d => ({
                              ...d,
                              imageModels: nextModels,
                              activeImageModelId: activeStillExists
                                ? d.activeImageModelId
                                : (nextModels[0]?.id ?? ''),
                            }))
                          } else {
                            // ── 写入 chatModels ──
                            const existingMap = new Map(
                              cfgDraft.chatModels.map(m => [m.modelId, m]),
                            )
                            const manualModels = cfgDraft.chatModels.filter(
                              m => !pickerModelIds.has(m.modelId),
                            )
                            const pickerModels: ChatModel[] = selectedArr.map(mid => {
                              const existing = existingMap.get(mid)
                              if (existing) return existing
                              return {
                                id: Math.random().toString(36).slice(2) + Date.now().toString(36),
                                modelId: mid,
                                label: mid,
                                apiKey: '',
                                baseUrl: '',
                              }
                            })
                            const nextModels = [...manualModels, ...pickerModels]
                            setCfgDraft(d => ({ ...d, chatModels: nextModels }))
                          }

                          setModelPickerOpen(false)
                        }}
                        className="rounded-lg bg-primary-500 px-5 py-1.5 text-sm font-medium text-white transition hover:bg-primary-600"
                      >
                        确认（{modelPickerSelected.size}）
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })()}

        {/* ── 历史记录全屏预览弹窗（完整缩放/拖动/保存） ─────────────────────── */}
        <HistoryFullPreview
          image={historyFullPreview?.images[historyFullPreview.index] ?? null}
          images={historyFullPreview?.images ?? []}
          index={historyFullPreview?.index ?? 0}
          onIndexChange={next =>
            setHistoryFullPreview(prev => (prev ? { ...prev, index: next } : prev))
          }
          onClose={() => setHistoryFullPreview(null)}
        />

        {/* 历史按钮 */}
        <div
          className="fixed left-0 z-40 cursor-move"
          style={{ top: historyBtnPosition }}
          onMouseDown={() => setIsDraggingHistory(true)}
        >
          <button
            className={`flex items-center gap-1.5 rounded-r-lg px-2.5 py-1.5 text-[11px] font-medium text-white shadow-lg transition-all ${
              historyPanelOpen
                ? 'bg-red-500/80 ring-1 ring-red-400/40'
                : 'bg-primary-500/60 backdrop-blur-sm hover:bg-primary-500/80'
            }`}
            onClick={e => {
              e.stopPropagation()
              setHistoryPanelOpen(!historyPanelOpen)
            }}
          >
            <svg
              className="h-2.5 w-2.5 opacity-90"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>历史</span>
          </button>
        </div>

        {/* ── 优化3：生成比例不一致确认弹窗 ─────────────────────────────────── */}
        <RatioMismatchDialog
          data={ratioMismatchDialog}
          onDismiss={() => setRatioMismatchDialog(null)}
          onRegenerate={() => {
            setRatioMismatchDialog(null)
            setTimeout(() => handleGenerateRef.current(), 100)
          }}
        />

        {/* ── 优化5：主界面模型选择弹窗 ──────────────────────────────────────── */}
        {mainModelPickerOpen && (
          <div
            className="overlay-dark fixed inset-0 z-[9999] flex items-center justify-center"
            onClick={() => setMainModelPickerOpen(false)}
          >
            <div
              className="glass-popup popup-enter flex flex-col overflow-hidden rounded-2xl shadow-2xl"
              style={{ width: 520, maxWidth: '96vw', maxHeight: '80vh' }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex flex-shrink-0 items-center justify-between border-b border-white/[0.06] px-5 py-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-100">生图模型管理</h3>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    勾选后的模型将参与生图，取消勾选则跳过
                  </p>
                </div>
                <button
                  onClick={() => setMainModelPickerOpen(false)}
                  className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-slate-300"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
              <div className="app-scrollbar flex-1 space-y-1 overflow-y-auto p-3">
                {(() => {
                  const cfg = getApiConfig()
                  const imgModels = cfg.imageModels.filter(m => m.modelId.trim())
                  if (imgModels.length === 0) {
                    return (
                      <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                        <svg
                          className="mb-2 h-10 w-10 text-slate-200"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.5}
                            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                          />
                        </svg>
                        <p className="text-sm">暂无可用模型</p>
                        <p className="mt-1 text-xs text-slate-300">
                          请先在「设置 → Image」中添加模型
                        </p>
                      </div>
                    )
                  }
                  return imgModels.map(m => {
                    const isChecked = mainModelPickerSelected.has(m.id)
                    const spec = resolveApiSpec(m, cfg)
                    const priceInfo = getModelPrice(m.modelId)
                    return (
                      <label
                        key={m.id}
                        className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition-all ${isChecked ? 'border-primary-500/20 bg-primary-500/10' : 'border-white/[0.06] bg-white/[0.03] hover:border-white/[0.1] hover:bg-white/[0.06]'}`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            setMainModelPickerSelected(prev => {
                              const next = new Set(prev)
                              if (next.has(m.id)) next.delete(m.id)
                              else next.add(m.id)
                              return next
                            })
                          }}
                          className="h-4 w-4 flex-shrink-0 rounded text-primary-500"
                        />
                        <div className="min-w-0 flex-1">
                          <p
                            className={`truncate font-mono text-sm ${isChecked ? 'font-medium text-primary-400' : 'text-slate-300'}`}
                          >
                            {m.modelId}
                          </p>
                          {m.label && m.label !== m.modelId && (
                            <p className="truncate text-[10px] text-slate-500">{m.label}</p>
                          )}
                          {/* 价格信息 */}
                          <p className="mt-0.5 text-[11px] leading-tight text-slate-500">
                            {priceInfo.price !== '询价' ? (
                              <>
                                单次：
                                <span className="font-medium text-emerald-400">
                                  {priceInfo.price}
                                </span>
                                {priceInfo.note && (
                                  <span className="ml-1 rounded bg-white/[0.06] px-1 text-[9px] text-slate-500">
                                    {priceInfo.note}
                                  </span>
                                )}
                              </>
                            ) : (
                              <span className="text-slate-400">暂无定价</span>
                            )}
                          </p>
                        </div>
                        <span
                          className={`flex-shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium ${spec === 'gemini' ? 'border border-purple-500/20 bg-purple-500/10 text-purple-400' : 'border border-blue-500/20 bg-blue-500/10 text-blue-400'}`}
                        >
                          {spec === 'gemini' ? 'Gemini' : 'OpenAI'}
                        </span>
                      </label>
                    )
                  })
                })()}
              </div>
              <div className="flex flex-shrink-0 items-center justify-between border-t border-white/[0.06] px-5 py-3">
                <span className="text-xs text-slate-400">
                  已勾选{' '}
                  <span className="font-semibold text-slate-200">
                    {mainModelPickerSelected.size}
                  </span>{' '}
                  个
                </span>
                <div className="flex gap-2">
                  <button
                    className="glass-button rounded-xl px-4 py-2 text-sm text-slate-300 transition"
                    onClick={() => setMainModelPickerOpen(false)}
                  >
                    取消
                  </button>
                  <button
                    className="gradient-button rounded-xl px-5 py-2 text-sm font-medium text-white"
                    onClick={() => {
                      const cfg = getApiConfig()
                      const selectedModels = cfg.imageModels.filter(
                        m => mainModelPickerSelected.has(m.id) && m.modelId.trim(),
                      )
                      if (selectedModels.length > 0) {
                        const ids = selectedModels.map(m => m.modelId)
                        setModelList(ids)
                        const cur = useGenerationStore.getState().model
                        setModel(ids.includes(cur) ? cur : ids[0])
                      }
                      setMainModelPickerOpen(false)
                    }}
                  >
                    确认
                  </button>
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
        <Suspense
          fallback={
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-400 border-t-transparent" />
            </div>
          }
        >
          <PromptOptimizerDialog
            open={promptOptimizeDialogOpen}
            onClose={() => setPromptOptimizeDialogOpen(false)}
            originalPrompt={prompt.trim()}
            onAdopt={optimized => setPrompt(optimized)}
          />
        </Suspense>

        {/* ── 历史记录管理弹窗 ─────────────────────────────────────────────── */}
        {manageDialogOpen && (
          <div
            className="overlay-dark fixed inset-0 z-50 flex items-center justify-center"
            onClick={() => {
              setManageDialogOpen(false)
              setSelectedPromptHistory(new Set())
            }}
          >
            <div
              className="glass-popup popup-enter flex flex-col overflow-hidden rounded-2xl"
              style={{
                width: manageModalSize.w,
                height: manageModalSize.h,
                minHeight: 420,
                minWidth: 560,
              }}
              onClick={e => e.stopPropagation()}
            >
              {/* 标题栏 */}
              <div className="flex items-center justify-between border-b border-white/[0.05] bg-white/40 px-5 py-3">
                <h3 className="text-sm font-semibold text-slate-100">📋 历史记录管理</h3>
                <button
                  type="button"
                  className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/[0.08] hover:text-slate-400"
                  onClick={() => {
                    setManageDialogOpen(false)
                    setSelectedPromptHistory(new Set())
                  }}
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>

              {/* 标签页切换 */}
              <div className="flex items-center gap-1 bg-white/20 px-5 pb-0 pt-3">
                <button
                  type="button"
                  className={`rounded-t-lg px-3 py-1.5 text-xs font-medium transition-all ${historyTab === 'input' ? '-mb-px border border-white/[0.08] border-b-white bg-white/[0.06] text-primary-400' : 'text-slate-500 hover:bg-white/[0.04] hover:text-slate-300'}`}
                  onClick={() => {
                    setHistoryTab('input')
                  }}
                >
                  📝 输入历史{' '}
                  <span className="ml-1 text-[10px] opacity-70">{promptHistory.length}</span>
                </button>
              </div>

              {/* 批量操作工具栏 */}
              {(() => {
                const selCount = selectedPromptHistory.size
                return selCount > 0 ? (
                  <div className="flex items-center gap-2 border-b border-blue-500/15 bg-blue-500/10 px-5 py-2">
                    <span className="text-xs font-medium text-blue-600">已选择 {selCount} 项</span>
                    <button
                      type="button"
                      className="rounded-lg border border-blue-500/20 px-2 py-1 text-[11px] text-blue-600 transition hover:bg-blue-500/15"
                      onClick={() => {
                        setSelectedPromptHistory(new Set(promptHistory.map((_, i) => i)))
                      }}
                    >
                      全选
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-blue-500/20 px-2 py-1 text-[11px] text-blue-600 transition hover:bg-blue-500/15"
                      onClick={() => {
                        setSelectedPromptHistory(prev => {
                          const all = new Set(promptHistory.map((_, i) => i))
                          return new Set([...all].filter(i => !prev.has(i)))
                        })
                      }}
                    >
                      反选
                    </button>
                    <div className="flex-1" />
                    <button
                      type="button"
                      className="rounded-lg bg-red-500 px-3 py-1 text-[11px] text-white transition hover:bg-red-600"
                      onClick={() => {
                        const _toDel = [...selectedPromptHistory].sort((a, b) => b - a)
                        setPromptHistory(prev =>
                          prev.filter((_, i) => !selectedPromptHistory.has(i)),
                        )
                        setSelectedPromptHistory(new Set())
                      }}
                    >
                      删除所选
                    </button>
                  </div>
                ) : null
              })()}

              {/* 内容区（标签页切换） */}
              <div className="flex-1 overflow-auto px-5 py-3">
                {/* ── 输入历史 ── */}
                {promptHistory.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center py-12 text-slate-400">
                    <svg
                      className="mb-3 h-12 w-12 opacity-30"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                      />
                    </svg>
                    <p className="text-sm">暂无输入历史</p>
                    <p className="mt-1 text-xs">每次生成后会保存提示词到历史</p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {promptHistory.map((p, i) => (
                      <div
                        key={i}
                        className={`group flex items-start gap-2 rounded-lg border bg-white/50 p-2.5 transition-all hover:border-primary-500/20 ${selectedPromptHistory.has(i) ? 'border-blue-300 bg-blue-500/[0.04]' : 'border-white/[0.06]'}`}
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5 h-4 w-4 flex-shrink-0 cursor-pointer rounded border-white/[0.12] text-primary-500 focus:ring-primary-500/30"
                          checked={selectedPromptHistory.has(i)}
                          onChange={e => {
                            setSelectedPromptHistory(prev => {
                              const next = new Set(prev)
                              if (e.target.checked) next.add(i)
                              else next.delete(i)
                              return next
                            })
                          }}
                        />
                        <div
                          className="line-clamp-2 min-w-0 flex-1 cursor-pointer text-[11px] text-slate-400 hover:text-primary-400"
                          onClick={() => {
                            setPrompt(p)
                            setManageDialogOpen(false)
                          }}
                          title="点击应用此提示词"
                        >
                          {p}
                        </div>
                        <button
                          type="button"
                          className="flex-shrink-0 rounded p-1 text-slate-300 transition-colors hover:bg-red-500/10 hover:text-red-500"
                          title="删除"
                          onClick={() => {
                            setPromptHistory(prev => prev.filter((_, idx) => idx !== i))
                            setSelectedPromptHistory(prev => {
                              const s = new Set(prev)
                              s.delete(i)
                              return s
                            })
                          }}
                        >
                          <svg
                            className="h-3 w-3"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 底部状态栏 */}
              <div className="flex flex-shrink-0 items-center justify-end border-t border-white/[0.05] bg-white/[0.03] px-5 py-2.5">
                <div className="flex items-center gap-3 text-[10px] text-slate-400">
                  <span>📝 输入历史 {promptHistory.length}</span>
                </div>
              </div>

              {/* 拖动调整尺寸手柄 */}
              <div
                className="absolute bottom-0 right-0 h-4 w-4 cursor-se-resize transition-colors hover:bg-primary-200/50"
                onMouseDown={e => {
                  e.preventDefault()
                  manageModalResizing.current = true
                  manageModalResizeStart.current = {
                    mouseX: e.clientX,
                    mouseY: e.clientY,
                    w: manageModalSize.w,
                    h: manageModalSize.h,
                  }
                }}
              >
                <svg className="h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="currentColor">
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
          className="group flex w-2 flex-shrink-0 cursor-col-resize items-center justify-center hover:bg-white/[0.04]"
          onMouseDown={() => setIsDragging(true)}
          title="拖动调节宽度"
        >
          <div className="h-12 w-0.5 rounded-full bg-white/[0.08] transition-colors group-hover:bg-primary-500/60" />
        </div>

        {/* 右侧控制栏 */}
        <ControlPanel
          prompt={prompt}
          setPrompt={setPrompt}
          negativePrompt={negativePrompt}
          setNegativePrompt={setNegativePrompt}
          promptHistory={promptHistory}
          setPromptHistory={setPromptHistory}
          referenceSlots={referenceSlots}
          setReferenceSlots={setReferenceSlots}
          referencePreviewUrls={referencePreviewUrls}
          model={model}
          setModel={setModel}
          modelList={modelList}
          resolutionPreset={resolutionPreset}
          setResolutionPreset={setResolutionPreset}
          sizeTier={sizeTier}
          setSizeTier={setSizeTier}
          batchSize={batchSize}
          setBatchSize={setBatchSize}
          parallelCount={parallelCount}
          setParallelCount={setParallelCount}
          width={width}
          height={height}
          status={status}
          isRegularGenerating={parallelCount <= 1 && status === 'running'}
          handleGenerate={handleGenerate}
          onOpenModelPicker={() => {
            const cfg = getApiConfig()
            const activeIds = new Set(
              cfg.imageModels.filter(m => modelList.includes(m.modelId)).map(m => m.id),
            )
            setMainModelPickerSelected(activeIds)
            setMainModelPickerOpen(true)
          }}
          onOptimize={() => {
            if (!prompt.trim()) return
            setPromptOptimizeDialogOpen(true)
          }}
          generationHistory={generationHistory}
          onClearHistory={() => {
            setGenerationHistory([])
            saveHistory([])
          }}
          onOpenDetailedLog={() => useUiStore.getState().setShowDetailedLog(true)}
          onSelectLogEntry={entry => {
            useUiStore.getState().setSelectedLogEntry(entry)
            useUiStore.getState().setShowDetailedLog(true)
          }}
          onDeletePromptHistory={index => {
            setPromptHistory(prev => prev.filter((_, i) => i !== index))
          }}
          rightPanelWidth={rightPanelWidth}
        />
      </main>

      {/* 全局错误/提示 Toast */}
      {error && (
        <div
          className="fixed bottom-6 left-1/2 z-[9999] w-full max-w-xl -translate-x-1/2 px-4"
          onClick={() => setError(null)}
        >
          <div className="toast-error glass-popup flex cursor-pointer items-start gap-3 rounded-xl px-4 py-3 shadow-xl">
            <svg
              className="toast-error-icon mt-0.5 h-4 w-4 flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
              />
            </svg>
            <p className="toast-error-msg flex-1 whitespace-pre-wrap text-xs">{error}</p>
            <div className="flex flex-shrink-0 items-center gap-2">
              {status !== 'running' && prompt.trim() && (
                <button
                  onClick={e => {
                    e.stopPropagation()
                    setError(null)
                    handleGenerateRef.current()
                  }}
                  className="toast-error-retry rounded px-2 py-0.5 text-xs transition"
                  aria-label="重试生成"
                >
                  重试
                </button>
              )}
              <button
                className="toast-error-close text-sm leading-none"
                onClick={e => {
                  e.stopPropagation()
                  setError(null)
                }}
                aria-label="关闭提示"
              >
                ×
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
