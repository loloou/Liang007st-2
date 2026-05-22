// ─────────────────────────────────────────────────────────────────────────────
//  uiStore.ts — 全局 UI 状态（弹窗开关、面板布局、拖拽、主题）
//
//  职责：
//    - 右侧面板宽度 & 拖拽状态
//    - 主题切换
//    - 顶部弹窗（余额、ComfyUI、绘图引擎、性能监控）
//    - 图片预览（大图 + 缩放/拖动）
//    - 历史面板（全屏预览 + 批量选择 + 错误详情）
//    - 管理弹窗（模板/历史管理 + 内联编辑）
//    - 提示词优化弹窗
//    - 关于弹窗
//    - 日志面板
//    - 主模型选择弹窗（主界面）
//    - 可拖动历史按钮位置
// ─────────────────────────────────────────────────────────────────────────────

import { create } from 'zustand'
import { getTheme, setTheme as persistTheme, type ThemeMode } from '../utils/theme'
import type { GeneratedImage } from '../api/imageClient'
import { getApiConfig } from '../api/settings'

// ── 常量 ─────────────────────────────────────────────────────────────────────

export const RIGHT_PANEL_MIN = 280
export const RIGHT_PANEL_MAX = 640
export const RIGHT_PANEL_DEFAULT = 360

// ── 类型 ─────────────────────────────────────────────────────────────────────

interface InlineEditingState {
  index?: number
  id?: string
  name?: string
  prompt?: string
  negative?: string
}

interface UiState {
  // 右侧面板
  rightPanelWidth: number
  isDraggingPanel: boolean

  // 主题
  theme: ThemeMode
  themeMenuOpen: boolean

  // 顶部弹窗
  balanceStatus: 'idle' | 'loading' | 'ok' | 'fail'
  balanceMessage: string
  balancePopupOpen: boolean
  comfyPopupOpen: boolean
  enginePopupOpen: boolean

  // 性能监控
  performanceMonitorOpen: boolean
  perfPanelOffset: { x: number; y: number }
  isDraggingPerf: boolean
  performanceData: {
    fps: number
    renderTime: number
    memory: number
    gpuUsage: number
    networkLatency: number
  }

  // 图片大图预览
  previewImage: GeneratedImage | null
  imgZoom: number
  imgOffset: { x: number; y: number }
  isDraggingImg: boolean

  // 历史面板
  historyPanelOpen: boolean
  historyFullPreview: GeneratedImage | null
  historyBatchMode: boolean
  historySelected: Set<string>
  errorDetailDialog: string | null
  histPreviewZoom: number
  histPreviewOffset: { x: number; y: number }
  isDraggingHistPreview: boolean
  histPreviewDownloading: boolean

  // 历史按钮位置（可拖动）
  historyBtnPosition: number
  isDraggingHistoryBtn: boolean

  // 模型选择弹窗（主界面）
  mainModelPickerOpen: boolean
  mainModelPickerSelected: Set<string>

  // 选模型弹窗尺寸（可拖拽调整）
  modelModalSize: { w: number; h: number }

  // 管理弹窗（模板/历史管理）
  manageDialogOpen: boolean
  manageDialogType: 'history' | 'template'
  manageModalSize: { w: number; h: number }

  // 内联编辑（在管理弹窗中）
  inlineEditing: InlineEditingState | null
  inlineEditName: string
  inlineEditPrompt: string
  inlineEditNegative: string
  showNewTemplateForm: boolean
  newTplName: string
  newTplPrompt: string

  // 提示词模板保存表单
  templateNameInput: string
  showTemplateSave: boolean

  // 历史 & 模板 下拉
  historyTemplateValue: string

  // 参考图折叠
  refImgOpen: boolean

  // 提示词优化弹窗
  promptOptimizeDialogOpen: boolean
  isOptimizing: boolean

  // 详细日志弹窗
  showDetailedLog: boolean
  /** 主界面日志列表 */
  logEntries: LogEntry[]
  /** 弹窗中当前选中的单条日志 */
  selectedLogEntry: LogEntry | null

  // 关于弹窗
  showAbout: boolean

  // 图片编辑器
  imageEditorUrl: string | null

  // ── 补充：未映射的状态 ────────────────────────────────────────────────────

  // 提示词预览弹窗
  promptPreviewOpen: boolean
  promptPreviewOffset: { x: number; y: number }
  isDraggingPromptPreview: boolean

  // ── actions ────────────────────────────────────────────────────────────────

  // 右侧面板
  setRightPanelWidth: (w: number) => void
  setIsDraggingPanel: (v: boolean) => void

  // 主题
  setTheme: (t: ThemeMode) => void
  setThemeMenuOpen: (v: boolean) => void

  // 顶部弹窗
  setBalanceStatus: (s: 'idle' | 'loading' | 'ok' | 'fail') => void
  setBalanceMessage: (m: string) => void
  setBalancePopupOpen: (v: boolean) => void
  setComfyPopupOpen: (v: boolean) => void
  setEnginePopupOpen: (v: boolean) => void

  // 性能监控
  setPerformanceMonitorOpen: (v: boolean) => void
  setPerfPanelOffset: (o: { x: number; y: number }) => void
  setIsDraggingPerf: (v: boolean) => void
  setPerformanceData: (d: UiState['performanceData']) => void

  // 图片预览
  setPreviewImage: (img: GeneratedImage | null) => void
  setImgZoom: (z: number) => void
  setImgOffset: (o: { x: number; y: number }) => void
  setIsDraggingImg: (v: boolean) => void
  resetImagePreview: () => void

  // 历史面板
  setHistoryPanelOpen: (v: boolean) => void
  setHistoryFullPreview: (img: GeneratedImage | null) => void
  setHistoryBatchMode: (v: boolean) => void
  toggleHistorySelected: (id: string) => void
  clearHistorySelected: () => void
  setErrorDetailDialog: (msg: string | null) => void
  setHistPreviewZoom: (z: number) => void
  setHistPreviewOffset: (o: { x: number; y: number }) => void
  setIsDraggingHistPreview: (v: boolean) => void
  setHistPreviewDownloading: (v: boolean) => void
  setHistoryBtnPosition: (y: number) => void
  setIsDraggingHistoryBtn: (v: boolean) => void

  // 主界面模型选择弹窗
  setMainModelPickerOpen: (v: boolean) => void
  toggleMainModelPicker: (id: string) => void
  setMainModelPickerSelected: (ids: Set<string>) => void
  setModelModalSize: (s: { w: number; h: number }) => void

  // 管理弹窗
  openManageDialog: (type: 'history' | 'template') => void
  closeManageDialog: () => void
  setManageModalSize: (s: { w: number; h: number }) => void

  // 内联编辑
  setInlineEditing: (v: InlineEditingState | null) => void
  setInlineEditName: (v: string) => void
  setInlineEditPrompt: (v: string) => void
  setInlineEditNegative: (v: string) => void
  setShowNewTemplateForm: (v: boolean) => void
  setNewTplName: (v: string) => void
  setNewTplPrompt: (v: string) => void

  // 模板保存表单
  setTemplateNameInput: (v: string) => void
  setShowTemplateSave: (v: boolean) => void

  // 历史下拉
  setHistoryTemplateValue: (v: string) => void

  // 参考图折叠
  setRefImgOpen: (v: boolean) => void

  // 提示词优化
  setPromptOptimizeDialogOpen: (v: boolean) => void
  setIsOptimizing: (v: boolean) => void

  // 日志
  setShowDetailedLog: (v: boolean) => void
  setLogEntries: (entries: LogEntry[] | ((prev: LogEntry[]) => LogEntry[])) => void
  setSelectedLogEntry: (entry: LogEntry | null) => void
  appendLogEntry: (entry: LogEntry) => void
  updateLastLogEntry: (patch: Partial<LogEntry>) => void
  clearLogs: () => void

  // 关于
  setShowAbout: (v: boolean) => void

  // 图片编辑器
  setImageEditorUrl: (url: string | null) => void

  // ── 补充：未映射状态的 actions ──────────────────────────────────────────

  // 提示词预览弹窗
  setPromptPreviewOpen: (v: boolean) => void
  setPromptPreviewOffset: (o: { x: number; y: number }) => void
  setIsDraggingPromptPreview: (v: boolean) => void
}

// ── 日志条目类型（从 App.tsx 提取，集中定义）────────────────────────────────

export type LogEntry = {
  time: string
  request?: string
  response?: string
  error?: string
  endpoint?: string
  spec?: string
  requestBody?: string
  responseBody?: string
  httpStatus?: number
  jsonValid?: boolean
  /** 失败时的 HTTP 响应体原始文本 */
  httpErrorBody?: string
}

// ── Store 实现 ────────────────────────────────────────────────────────────────

export const useUiStore = create<UiState>()((set, get) => ({
  // ── 初始值 ────────────────────────────────────────────────────────────────
  rightPanelWidth: RIGHT_PANEL_DEFAULT,
  isDraggingPanel: false,

  theme: getTheme(),
  themeMenuOpen: false,

  balanceStatus: 'idle',
  balanceMessage: '',
  balancePopupOpen: false,
  comfyPopupOpen: false,
  enginePopupOpen: false,

  performanceMonitorOpen: false,
  perfPanelOffset: { x: 0, y: 0 },
  isDraggingPerf: false,
  performanceData: { fps: 60, renderTime: 16, memory: 45, gpuUsage: 30, networkLatency: 25 },

  previewImage: null,
  imgZoom: 1,
  imgOffset: { x: 0, y: 0 },
  isDraggingImg: false,

  historyPanelOpen: false,
  historyFullPreview: null,
  historyBatchMode: false,
  historySelected: new Set(),
  errorDetailDialog: null,
  histPreviewZoom: 1,
  histPreviewOffset: { x: 0, y: 0 },
  isDraggingHistPreview: false,
  histPreviewDownloading: false,
  historyBtnPosition: Math.round(window.innerHeight * 0.65),
  isDraggingHistoryBtn: false,

  mainModelPickerOpen: false,
  mainModelPickerSelected: (() => {
    try {
      const cfg = getApiConfig()
      return new Set<string>(cfg.imageModels.map(m => m.id))
    } catch {
      return new Set<string>()
    }
  })(),
  modelModalSize: { w: 880, h: 620 },

  manageDialogOpen: false,
  manageDialogType: 'history',
  manageModalSize: { w: 640, h: 520 },

  inlineEditing: null,
  inlineEditName: '',
  inlineEditPrompt: '',
  inlineEditNegative: '',
  showNewTemplateForm: false,
  newTplName: '',
  newTplPrompt: '',

  templateNameInput: '',
  showTemplateSave: false,
  historyTemplateValue: '',

  refImgOpen: window.innerWidth >= 1280,

  promptOptimizeDialogOpen: false,
  isOptimizing: false,

  showDetailedLog: false,
  logEntries: [],
  selectedLogEntry: null,

  showAbout: false,
  imageEditorUrl: null,

  // ── 右侧面板 ──────────────────────────────────────────────────────────────
  setRightPanelWidth: w =>
    set({ rightPanelWidth: Math.min(RIGHT_PANEL_MAX, Math.max(RIGHT_PANEL_MIN, w)) }),
  setIsDraggingPanel: v => set({ isDraggingPanel: v }),

  // ── 主题 ──────────────────────────────────────────────────────────────────
  setTheme: t => {
    persistTheme(t)
    set({ theme: t, themeMenuOpen: false })
  },
  setThemeMenuOpen: v => set({ themeMenuOpen: v }),

  // ── 顶部弹窗 ──────────────────────────────────────────────────────────────
  setBalanceStatus: s => set({ balanceStatus: s }),
  setBalanceMessage: m => set({ balanceMessage: m }),
  setBalancePopupOpen: v => set({ balancePopupOpen: v }),
  setComfyPopupOpen: v =>
    set({ comfyPopupOpen: v, enginePopupOpen: v ? false : get().enginePopupOpen }),
  setEnginePopupOpen: v =>
    set({ enginePopupOpen: v, comfyPopupOpen: v ? false : get().comfyPopupOpen }),

  // ── 性能监控 ──────────────────────────────────────────────────────────────
  setPerformanceMonitorOpen: v => {
    if (v) set({ performanceMonitorOpen: true, perfPanelOffset: { x: 0, y: 0 } })
    else set({ performanceMonitorOpen: false })
  },
  setPerfPanelOffset: o => set({ perfPanelOffset: o }),
  setIsDraggingPerf: v => set({ isDraggingPerf: v }),
  setPerformanceData: d => set({ performanceData: d }),

  // ── 图片预览 ──────────────────────────────────────────────────────────────
  setPreviewImage: img => set({ previewImage: img, imgZoom: 1, imgOffset: { x: 0, y: 0 } }),
  setImgZoom: z => set({ imgZoom: z }),
  setImgOffset: o => set({ imgOffset: o }),
  setIsDraggingImg: v => set({ isDraggingImg: v }),
  resetImagePreview: () => set({ imgZoom: 1, imgOffset: { x: 0, y: 0 }, isDraggingImg: false }),

  // ── 历史面板 ──────────────────────────────────────────────────────────────
  setHistoryPanelOpen: v => set({ historyPanelOpen: v }),
  setHistoryFullPreview: img =>
    set({ historyFullPreview: img, histPreviewZoom: 1, histPreviewOffset: { x: 0, y: 0 } }),
  setHistoryBatchMode: v =>
    set({ historyBatchMode: v, historySelected: v ? get().historySelected : new Set() }),
  toggleHistorySelected: id => {
    const next = new Set(get().historySelected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    set({ historySelected: next })
  },
  clearHistorySelected: () => set({ historySelected: new Set() }),
  setErrorDetailDialog: msg => set({ errorDetailDialog: msg }),
  setHistPreviewZoom: z => set({ histPreviewZoom: z }),
  setHistPreviewOffset: o => set({ histPreviewOffset: o }),
  setIsDraggingHistPreview: v => set({ isDraggingHistPreview: v }),
  setHistPreviewDownloading: v => set({ histPreviewDownloading: v }),
  setHistoryBtnPosition: y => set({ historyBtnPosition: y }),
  setIsDraggingHistoryBtn: v => set({ isDraggingHistoryBtn: v }),

  // ── 主界面模型选择弹窗 ────────────────────────────────────────────────────
  setMainModelPickerOpen: v => set({ mainModelPickerOpen: v }),
  toggleMainModelPicker: id => {
    const next = new Set(get().mainModelPickerSelected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    set({ mainModelPickerSelected: next })
  },
  setMainModelPickerSelected: ids => set({ mainModelPickerSelected: ids }),
  setModelModalSize: s => set({ modelModalSize: s }),

  // ── 管理弹窗 ──────────────────────────────────────────────────────────────
  openManageDialog: type =>
    set({ manageDialogOpen: true, manageDialogType: type, inlineEditing: null }),
  closeManageDialog: () => set({ manageDialogOpen: false, inlineEditing: null }),
  setManageModalSize: s => set({ manageModalSize: s }),

  // ── 内联编辑 ──────────────────────────────────────────────────────────────
  setInlineEditing: v => set({ inlineEditing: v }),
  setInlineEditName: v => set({ inlineEditName: v }),
  setInlineEditPrompt: v => set({ inlineEditPrompt: v }),
  setInlineEditNegative: v => set({ inlineEditNegative: v }),
  setShowNewTemplateForm: v => set({ showNewTemplateForm: v }),
  setNewTplName: v => set({ newTplName: v }),
  setNewTplPrompt: v => set({ newTplPrompt: v }),

  // ── 模板保存 ──────────────────────────────────────────────────────────────
  setTemplateNameInput: v => set({ templateNameInput: v }),
  setShowTemplateSave: v => set({ showTemplateSave: v }),

  // ── 历史下拉 ──────────────────────────────────────────────────────────────
  setHistoryTemplateValue: v => set({ historyTemplateValue: v }),

  // ── 参考图折叠 ────────────────────────────────────────────────────────────
  setRefImgOpen: v => set({ refImgOpen: v }),

  // ── 提示词优化 ────────────────────────────────────────────────────────────
  setPromptOptimizeDialogOpen: v => set({ promptOptimizeDialogOpen: v }),
  setIsOptimizing: v => set({ isOptimizing: v }),

  // ── 日志 ──────────────────────────────────────────────────────────────────
  setShowDetailedLog: v => set({ showDetailedLog: v }),
  setSelectedLogEntry: entry => set({ selectedLogEntry: entry }),
  setLogEntries: entries =>
    set(s => ({
      logEntries: typeof entries === 'function' ? entries(s.logEntries) : entries,
    })),
  appendLogEntry: entry => set(s => ({ logEntries: [...s.logEntries.slice(-99), entry] })),
  updateLastLogEntry: patch =>
    set(s => {
      if (s.logEntries.length === 0) return s
      const last = { ...s.logEntries[s.logEntries.length - 1], ...patch }
      return { logEntries: [...s.logEntries.slice(0, -1), last] }
    }),
  clearLogs: () => set({ logEntries: [] }),

  // ── 关于 ──────────────────────────────────────────────────────────────────
  setShowAbout: v => set({ showAbout: v }),

  // ── 图片编辑器 ────────────────────────────────────────────────────────────
  setImageEditorUrl: url => set({ imageEditorUrl: url }),

  // ── 补充：未映射状态的初始值 ─────────────────────────────────────────────

  // 提示词预览弹窗
  promptPreviewOpen: false,
  promptPreviewOffset: { x: 0, y: 0 },
  isDraggingPromptPreview: false,

  // ── 补充：未映射状态的 setters ───────────────────────────────────────────

  setPromptPreviewOpen: (v: boolean) => set({ promptPreviewOpen: v }),
  setPromptPreviewOffset: (o: { x: number; y: number }) => set({ promptPreviewOffset: o }),
  setIsDraggingPromptPreview: (v: boolean) => set({ isDraggingPromptPreview: v }),
}))
