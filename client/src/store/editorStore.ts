// ═══════════════════════════════════════════════════════════
// AI 图片编辑器 v2 — Zustand 状态管理
// ═══════════════════════════════════════════════════════════
import { create } from 'zustand'
import {
  EditorTool,
  MaskLayer,
  MaskPath,
  PinMarker,
  TextAddition,
  TextReplacement,
  EraseRegion,
  BackgroundEdit,
  CropConfig,
  FilterState,
  OutpaintConfig,
  EditorSnapshot,
  EditorLayer,
  ReferenceImage,
  FilterAdjustments,
} from '../types/editor'

// ─── 默认值工厂 ──────────────────────────────────────────────
const defaultFilter = (): FilterState => ({
  preset: 'original',
  presetStrength: 100,
  adjustments: {
    brightness: 0,
    contrast: 0,
    saturation: 0,
    warmth: 0,
    tint: 0,
    highlights: 0,
    shadows: 0,
    clarity: 0,
    grain: 0,
    vignette: 0,
    fade: 0,
  },
})

const defaultBg = (): BackgroundEdit => ({
  action: 'remove',
})

const emptySnapshot = (): EditorSnapshot => ({
  maskLayers: [],
  pins: [],
  textAdditions: [],
  textReplacements: [],
  eraseRegions: [],
  bgEdit: null,
  crop: null,
  filter: defaultFilter(),
  outpaint: null,
  timestamp: Date.now(),
})

// ─── Store 接口 ──────────────────────────────────────────────
interface EditorStore {
  // ── 图像数据 ──────────────────────────────────────────────
  imageUrl: string
  imageBase64: string
  imageSize: { w: number; h: number }

  // ── 工具与视图 ─────────────────────────────────────────────
  activeTool: EditorTool
  activeSubTab: string
  scale: number // 缩放 0.1 ~ 8.0
  panX: number
  panY: number
  isPanning: boolean

  // ── 蒙版层 ─────────────────────────────────────────────────
  maskLayers: MaskLayer[]
  activeMaskLayerId: string | null

  // ── 标记点 ─────────────────────────────────────────────────
  pins: PinMarker[]
  selectedPinId: string | null
  pinConnecting: boolean // 连线模式

  // ── 文字 ───────────────────────────────────────────────────
  textAdditions: TextAddition[]
  textReplacements: TextReplacement[]
  selectedTextId: string | null
  activeTextMode: 'add' | 'replace'

  // ── 擦除 ───────────────────────────────────────────────────
  eraseRegions: EraseRegion[]
  eraseMode: 'brush' | 'rect'

  // ── 背景 ───────────────────────────────────────────────────
  bgEdit: BackgroundEdit | null

  // ── 裁剪 ───────────────────────────────────────────────────
  crop: CropConfig | null

  // ── 滤镜 ───────────────────────────────────────────────────
  filter: FilterState

  // ── 扩图 ───────────────────────────────────────────────────
  outpaint: OutpaintConfig | null

  // ── 参考图 ─────────────────────────────────────────────────
  references: ReferenceImage[]

  // ── 图层面板 ───────────────────────────────────────────────
  layers: EditorLayer[]
  leftPanelOpen: boolean
  rightPanelOpen: boolean

  // ── 历史 ───────────────────────────────────────────────────
  past: EditorSnapshot[]
  future: EditorSnapshot[]
  historyOpen: boolean

  // ── 提交汇总 ───────────────────────────────────────────────
  submitPanelOpen: boolean
  advancedOpen: boolean

  // ── UI 状态 ────────────────────────────────────────────────
  maskPromptVisible: boolean
  previewMode: 'edit' | 'original' // 对比预览

  // ── 画布工具参数 ────────────────────────────────────────────
  brushSize: number
  brushHardness: number
  brushColor: string
  brushFlow: number
  brushEraser: boolean
  eraserSize: number
  smartEdge: boolean
  lassoMode: boolean
  rectSelectMode: boolean
  magicWandTolerance: number

  // ── 标记工具参数 ────────────────────────────────────────────
  pinStyle: 'dot' | 'numbered' | 'arrow' | 'pin'
  pinColor: string
  pinSize: number

  // ── 文字工具参数 ────────────────────────────────────────────
  fontFamily: string
  fontSize: number
  fontColor: string
  fontWeight: string
  letterSpacing: number
  lineHeight: number
  textOpacity: number
  textAlign: 'left' | 'center' | 'right'
  textDirection: 'horizontal' | 'vertical'
  textRotation: number
  textStroke: { color: string; width: number } | null
  textShadow: { x: number; y: number; blur: number; color: string } | null
  textBgColor: string
  textBgRadius: number

  // ── 擦除参数 ────────────────────────────────────────────────
  smartDetect: boolean
  fillMethod: 'ai' | 'solid' | 'blur'

  // ── 滤镜预设列表 ────────────────────────────────────────────
  filterPresets: Array<{ id: string; name: string; thumbnail: string }>

  // ── 高级参数 ────────────────────────────────────────────────
  advancedParams: {
    strength: number
    guidance_scale: number
    steps: number
    seed: number
    batchSize: number
    outputWidth: number
    outputHeight: number
  }

  // ── Actions ─────────────────────────────────────────────────

  // 图像
  setImage: (url: string, base64: string, w: number, h: number) => void

  // 工具
  setTool: (tool: EditorTool) => void
  setActiveSubTab: (tab: string) => void

  // 视图
  setScale: (scale: number) => void
  setPan: (x: number, y: number) => void
  setPanning: (p: boolean) => void
  resetView: () => void
  fitToWindow: (containerW: number, containerH: number) => void

  // 蒙版
  addMaskLayer: () => string
  removeMaskLayer: (id: string) => void
  addPathToMask: (layerId: string, path: MaskPath) => void
  clearMaskLayer: (id: string) => void
  setMaskPrompt: (layerId: string, prompt: string, negPrompt: string) => void
  setMaskLayerVisibility: (id: string, v: boolean) => void
  setMaskLayerOpacity: (id: string, opacity: number) => void
  mergeMaskLayers: () => void

  // 标记点
  addPin: (pin: Omit<PinMarker, 'id' | 'timestamp'>) => string
  updatePin: (id: string, updates: Partial<PinMarker>) => void
  removePin: (id: string) => void
  setSelectedPin: (id: string | null) => void
  clearPins: () => void

  // 文字
  addText: (text: Omit<TextAddition, 'id' | 'visible' | 'locked'>) => string
  updateText: (id: string, updates: Partial<TextAddition>) => void
  removeText: (id: string) => void
  setSelectedText: (id: string | null) => void
  clearTexts: () => void
  addTextReplacement: (rep: Omit<TextReplacement, 'id' | 'visible' | 'locked'>) => string
  removeTextReplacement: (id: string) => void

  // 擦除
  addEraseRegion: (region: Omit<EraseRegion, 'id' | 'visible' | 'locked'>) => string
  updateEraseRegion: (id: string, updates: Partial<EraseRegion>) => void
  removeEraseRegion: (id: string) => void
  clearEraseRegions: () => void

  // 背景
  setBgEdit: (bg: BackgroundEdit | null) => void

  // 裁剪
  setCrop: (crop: CropConfig | null) => void

  // 滤镜
  setFilterPreset: (preset: string, strength: number) => void
  setFilterAdjustments: (adj: Partial<FilterAdjustments>) => void
  resetFilter: () => void

  // 扩图
  setOutpaint: (cfg: OutpaintConfig | null) => void

  // 参考图
  setReferences: (refs: ReferenceImage[]) => void

  // 图层
  toggleLeftPanel: () => void
  toggleRightPanel: () => void
  rebuildLayers: () => void
  toggleLayerVisibility: (id: string) => void
  toggleLayerLock: (id: string) => void
  setLayerOpacity: (id: string, opacity: number) => void

  // 历史
  pushHistory: () => void
  undo: () => void
  redo: () => void
  resetAll: () => void
  toggleHistory: () => void
  goToHistory: (idx: number) => void

  // 提交
  toggleSubmitPanel: () => void
  toggleAdvanced: () => void
  setAdvancedParams: (params: Partial<EditorStore['advancedParams']>) => void

  // UI
  setMaskPromptVisible: (v: boolean) => void
  setPreviewMode: (m: 'edit' | 'original') => void

  // 快捷参数
  setBrushSize: (n: number) => void
  setBrushHardness: (n: number) => void
  setBrushColor: (c: string) => void
  setBrushFlow: (n: number) => void
  setBrushEraser: (b: boolean) => void
  setPinStyle: (s: EditorStore['pinStyle']) => void
  setPinColor: (c: string) => void
  setPinSize: (n: number) => void
  setPinConnecting: (b: boolean) => void
  setFontFamily: (f: string) => void
  setFontSize: (n: number) => void
  setFontColor: (c: string) => void
  setFontWeight: (w: string) => void
  setLetterSpacing: (n: number) => void
  setLineHeight: (n: number) => void
  setTextOpacity: (n: number) => void
  setTextAlign: (a: EditorStore['textAlign']) => void
  setTextDirection: (d: EditorStore['textDirection']) => void
  setTextRotation: (n: number) => void
  setTextStroke: (s: { color: string; width: number } | null) => void
  setTextShadow: (s: { x: number; y: number; blur: number; color: string } | null) => void
  setTextBgColor: (c: string) => void
  setTextBgRadius: (n: number) => void
  setSmartDetect: (b: boolean) => void
  setFillMethod: (m: EditorStore['fillMethod']) => void
}

// ─── 工具函数 ────────────────────────────────────────────────
const genId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return Math.random().toString(36).slice(2, 10)
}

const getSnapshot = (s: EditorStore): EditorSnapshot => ({
  maskLayers: s.maskLayers,
  pins: s.pins,
  textAdditions: s.textAdditions,
  textReplacements: s.textReplacements,
  eraseRegions: s.eraseRegions,
  bgEdit: s.bgEdit ? { ...s.bgEdit } : null,
  crop: s.crop ? { ...s.crop } : null,
  filter: { ...s.filter, adjustments: { ...s.filter.adjustments } },
  outpaint: s.outpaint ? { ...s.outpaint } : null,
  timestamp: Date.now(),
})

const applySnapshot = (s: EditorStore, snap: EditorSnapshot): Partial<EditorStore> => ({
  maskLayers: snap.maskLayers,
  pins: snap.pins,
  textAdditions: snap.textAdditions,
  textReplacements: snap.textReplacements,
  eraseRegions: snap.eraseRegions,
  bgEdit: snap.bgEdit,
  crop: snap.crop,
  filter: snap.filter,
  outpaint: snap.outpaint,
})

// ─── Store 实现 ───────────────────────────────────────────────
export const useEditorStore = create<EditorStore>((set, get) => ({
  // ── 初始状态 ───────────────────────────────────────────────
  imageUrl: '',
  imageBase64: '',
  imageSize: { w: 0, h: 0 },

  activeTool: 'brush',
  activeSubTab: 'add',
  scale: 1,
  panX: 0,
  panY: 0,
  isPanning: false,

  maskLayers: [],
  activeMaskLayerId: null,

  pins: [],
  selectedPinId: null,
  pinConnecting: false,

  textAdditions: [],
  textReplacements: [],
  selectedTextId: null,
  activeTextMode: 'add',

  eraseRegions: [],
  eraseMode: 'brush',

  bgEdit: null,
  crop: null,
  filter: defaultFilter(),
  outpaint: null,

  references: [],

  layers: [],
  leftPanelOpen: true,
  rightPanelOpen: true,

  past: [],
  future: [],
  historyOpen: false,

  submitPanelOpen: false,
  advancedOpen: false,

  maskPromptVisible: false,
  previewMode: 'edit',

  brushSize: 20,
  brushHardness: 80,
  brushColor: 'rgba(99,102,241,0.55)',
  brushFlow: 100,
  brushEraser: false,
  eraserSize: 30,
  smartEdge: false,
  lassoMode: false,
  rectSelectMode: false,
  magicWandTolerance: 32,

  pinStyle: 'dot',
  pinColor: '#FF4444',
  pinSize: 24,

  fontFamily: 'Arial',
  fontSize: 24,
  fontColor: '#000000',
  fontWeight: 'Regular',
  letterSpacing: 0,
  lineHeight: 1.4,
  textOpacity: 100,
  textAlign: 'left',
  textDirection: 'horizontal',
  textRotation: 0,
  textStroke: null,
  textShadow: null,
  textBgColor: '',
  textBgRadius: 4,

  smartDetect: true,
  fillMethod: 'ai',

  filterPresets: [
    { id: 'original', name: '原图', thumbnail: '' },
    { id: 'cinematic', name: '电影感', thumbnail: '' },
    { id: 'vintage', name: '复古胶片', thumbnail: '' },
    { id: 'bw', name: '黑白', thumbnail: '' },
    { id: 'cyberpunk', name: '赛博朋克', thumbnail: '' },
    { id: 'japanese', name: '日系清新', thumbnail: '' },
    { id: 'morandi', name: '莫兰迪', thumbnail: '' },
    { id: 'warm', name: '暖阳', thumbnail: '' },
    { id: 'cool', name: '冷调', thumbnail: '' },
    { id: 'hdr', name: 'HDR', thumbnail: '' },
    { id: 'comic', name: '漫画', thumbnail: '' },
    { id: 'oil', name: '油画', thumbnail: '' },
    { id: 'watercolor', name: '水彩', thumbnail: '' },
    { id: 'noir', name: '黑色电影', thumbnail: '' },
    { id: 'fade', name: '褪色', thumbnail: '' },
    { id: 'sunset', name: '日落', thumbnail: '' },
    { id: 'forest', name: '森林', thumbnail: '' },
    { id: 'neon', name: '霓虹', thumbnail: '' },
    { id: 'portrait', name: '人像', thumbnail: '' },
    { id: 'landscape', name: '风景', thumbnail: '' },
    { id: 'vivid', name: '鲜艳', thumbnail: '' },
    { id: 'muted', name: '低饱和', thumbnail: '' },
    { id: 'golden', name: '金色', thumbnail: '' },
    { id: 'moonlight', name: '月光', thumbnail: '' },
  ],

  advancedParams: {
    strength: 0.75,
    guidance_scale: 7.5,
    steps: 30,
    seed: -1,
    batchSize: 1,
    outputWidth: 1024,
    outputHeight: 768,
  },

  // ── Actions ─────────────────────────────────────────────────

  setImage: (url, base64, w, h) =>
    set({
      imageUrl: url,
      imageBase64: base64,
      imageSize: { w, h },
    }),

  setTool: tool => {
    get().pushHistory()
    set({ activeTool: tool, selectedPinId: null, selectedTextId: null })
  },

  setActiveSubTab: tab => set({ activeSubTab: tab }),

  setScale: scale => set({ scale: Math.min(Math.max(scale, 0.1), 8) }),
  setPan: (x, y) => set({ panX: x, panY: y }),
  setPanning: p => set({ isPanning: p }),

  resetView: () => set({ scale: 1, panX: 0, panY: 0 }),

  fitToWindow: (cw, ch) => {
    const { imageSize } = get()
    if (!imageSize.w) return
    const s = Math.min(cw / imageSize.w, ch / imageSize.h, 1)
    const x = (cw - imageSize.w * s) / 2
    const y = (ch - imageSize.h * s) / 2
    set({ scale: s, panX: x, panY: y })
  },

  // 蒙版
  addMaskLayer: () => {
    const id = genId()
    const layer: MaskLayer = {
      id,
      paths: [],
      prompt: '',
      negativePrompt: '',
      visible: true,
      locked: false,
      opacity: 100,
    }
    get().pushHistory()
    set(s => ({ maskLayers: [...s.maskLayers, layer], activeMaskLayerId: id }))
    return id
  },

  removeMaskLayer: id => {
    get().pushHistory()
    set(s => ({
      maskLayers: s.maskLayers.filter(l => l.id !== id),
      activeMaskLayerId: s.activeMaskLayerId === id ? null : s.activeMaskLayerId,
    }))
  },

  addPathToMask: (layerId, path) => {
    set(s => ({
      maskLayers: s.maskLayers.map(l =>
        l.id === layerId ? { ...l, paths: [...l.paths, path] } : l,
      ),
    }))
  },

  clearMaskLayer: id => {
    get().pushHistory()
    set(s => ({
      maskLayers: s.maskLayers.map(l =>
        l.id === id ? { ...l, paths: [], prompt: '', negativePrompt: '' } : l,
      ),
    }))
  },

  setMaskPrompt: (layerId, prompt, negPrompt) => {
    get().pushHistory()
    set(s => ({
      maskLayers: s.maskLayers.map(l =>
        l.id === layerId ? { ...l, prompt, negativePrompt: negPrompt } : l,
      ),
    }))
  },

  setMaskLayerVisibility: (id, v) => {
    set(s => ({
      maskLayers: s.maskLayers.map(l => (l.id === id ? { ...l, visible: v } : l)),
    }))
    get().rebuildLayers()
  },

  setMaskLayerOpacity: (id, opacity) => {
    set(s => ({
      maskLayers: s.maskLayers.map(l => (l.id === id ? { ...l, opacity } : l)),
    }))
    get().rebuildLayers()
  },

  mergeMaskLayers: () => {
    // 合并所有可见蒙版层为一个（提交时调用）
    get().pushHistory()
  },

  // 标记点
  addPin: pin => {
    const id = genId()
    const label = String(get().pins.length + 1)
    const newPin: PinMarker = { ...pin, id, label, timestamp: Date.now() }
    get().pushHistory()
    set(s => ({ pins: [...s.pins, newPin], selectedPinId: id }))
    get().rebuildLayers()
    return id
  },

  updatePin: (id, updates) => {
    set(s => ({
      pins: s.pins.map(p => (p.id === id ? { ...p, ...updates } : p)),
    }))
    get().rebuildLayers()
  },

  removePin: id => {
    get().pushHistory()
    set(s => ({
      pins: s.pins.filter(p => p.id !== id),
      selectedPinId: s.selectedPinId === id ? null : s.selectedPinId,
    }))
    get().rebuildLayers()
  },

  setSelectedPin: id => set({ selectedPinId: id }),
  setPinConnecting: b => set({ pinConnecting: b }),
  clearPins: () => {
    get().pushHistory()
    set({ pins: [], selectedPinId: null })
    get().rebuildLayers()
  },

  // 文字
  addText: text => {
    const id = genId()
    const newText: TextAddition = { ...text, id, visible: true, locked: false }
    get().pushHistory()
    set(s => ({ textAdditions: [...s.textAdditions, newText], selectedTextId: id }))
    get().rebuildLayers()
    return id
  },

  updateText: (id, updates) => {
    set(s => ({
      textAdditions: s.textAdditions.map(t => (t.id === id ? { ...t, ...updates } : t)),
    }))
    get().rebuildLayers()
  },

  removeText: id => {
    get().pushHistory()
    set(s => ({
      textAdditions: s.textAdditions.filter(t => t.id !== id),
      selectedTextId: s.selectedTextId === id ? null : s.selectedTextId,
    }))
    get().rebuildLayers()
  },

  setSelectedText: id => set({ selectedTextId: id }),
  clearTexts: () => {
    get().pushHistory()
    set({ textAdditions: [], textReplacements: [], selectedTextId: null })
    get().rebuildLayers()
  },

  addTextReplacement: rep => {
    const id = genId()
    const r: TextReplacement = { ...rep, id, visible: true, locked: false }
    get().pushHistory()
    set(s => ({ textReplacements: [...s.textReplacements, r] }))
    get().rebuildLayers()
    return id
  },

  removeTextReplacement: id => {
    get().pushHistory()
    set(s => ({
      textReplacements: s.textReplacements.filter(r => r.id !== id),
    }))
    get().rebuildLayers()
  },

  // 擦除
  addEraseRegion: region => {
    const id = genId()
    const r: EraseRegion = { ...region, id, visible: true, locked: false }
    get().pushHistory()
    set(s => ({ eraseRegions: [...s.eraseRegions, r] }))
    get().rebuildLayers()
    return id
  },

  updateEraseRegion: (id, updates) => {
    set(s => ({
      eraseRegions: s.eraseRegions.map(r => (r.id === id ? { ...r, ...updates } : r)),
    }))
    get().rebuildLayers()
  },

  removeEraseRegion: id => {
    get().pushHistory()
    set(s => ({ eraseRegions: s.eraseRegions.filter(r => r.id !== id) }))
    get().rebuildLayers()
  },

  clearEraseRegions: () => {
    get().pushHistory()
    set({ eraseRegions: [] })
    get().rebuildLayers()
  },

  // 背景
  setBgEdit: bg => {
    get().pushHistory()
    set({ bgEdit: bg })
  },

  // 裁剪
  setCrop: crop => {
    get().pushHistory()
    set({ crop })
  },

  // 滤镜
  setFilterPreset: (preset, strength) => {
    get().pushHistory()
    set(s => ({
      filter: {
        ...s.filter,
        preset: preset as import('../types/editor').FilterPreset,
        presetStrength: strength,
      },
    }))
  },

  setFilterAdjustments: adj => {
    set(s => ({
      filter: {
        ...s.filter,
        adjustments: { ...s.filter.adjustments, ...adj },
      },
    }))
  },

  resetFilter: () => {
    get().pushHistory()
    set({ filter: defaultFilter() })
  },

  // 扩图
  setOutpaint: cfg => {
    get().pushHistory()
    set({ outpaint: cfg })
  },

  // 参考图
  setReferences: refs => set({ references: refs }),

  // 图层
  toggleLeftPanel: () => set(s => ({ leftPanelOpen: !s.leftPanelOpen })),
  toggleRightPanel: () => set(s => ({ rightPanelOpen: !s.rightPanelOpen })),

  rebuildLayers: () => {
    const s = get()
    const layers: EditorLayer[] = []

    s.maskLayers.forEach(l => {
      layers.push({
        id: l.id,
        type: 'mask',
        name: `蒙版 ${layers.length + 1}`,
        visible: l.visible,
        locked: l.locked,
        opacity: l.opacity,
        timestamp: 0,
      })
    })

    if (s.pins.length) {
      layers.push({
        id: 'pins',
        type: 'pin',
        name: `标记点 (${s.pins.length})`,
        visible: true,
        locked: false,
        opacity: 100,
        timestamp: 0,
      })
    }
    if (s.textAdditions.length) {
      layers.push({
        id: 'texts',
        type: 'text',
        name: `文字 (${s.textAdditions.length})`,
        visible: true,
        locked: false,
        opacity: 100,
        timestamp: 0,
      })
    }
    if (s.eraseRegions.length) {
      layers.push({
        id: 'erase',
        type: 'erase',
        name: `擦除 (${s.eraseRegions.length})`,
        visible: true,
        locked: false,
        opacity: 100,
        timestamp: 0,
      })
    }
    if (s.bgEdit) {
      layers.push({
        id: 'bg',
        type: 'bg',
        name: '背景处理',
        visible: true,
        locked: false,
        opacity: 100,
        timestamp: 0,
      })
    }
    if (s.crop) {
      layers.push({
        id: 'crop',
        type: 'crop',
        name: '裁剪变换',
        visible: true,
        locked: false,
        opacity: 100,
        timestamp: 0,
      })
    }
    if (s.filter.preset !== 'original') {
      layers.push({
        id: 'filter',
        type: 'filter',
        name: `滤镜: ${s.filter.preset}`,
        visible: true,
        locked: false,
        opacity: s.filter.presetStrength,
        timestamp: 0,
      })
    }
    if (s.outpaint) {
      layers.push({
        id: 'outpaint',
        type: 'outpaint',
        name: '扩图延展',
        visible: true,
        locked: false,
        opacity: 100,
        timestamp: 0,
      })
    }

    set({ layers })
  },

  toggleLayerVisibility: id => {
    const s = get()
    if (id === 'pins') {
      const anyVisible = s.pins.some(p => p.visible !== false)
      set({ pins: s.pins.map(p => ({ ...p, visible: anyVisible ? false : true })) })
    } else if (id === 'texts') {
      const anyVisible = s.textAdditions.some(t => t.visible !== false)
      set({
        textAdditions: s.textAdditions.map(t => ({ ...t, visible: anyVisible ? false : true })),
      })
    } else if (id === 'erase') {
      const anyVisible = s.eraseRegions.some(r => r.visible !== false)
      set({ eraseRegions: s.eraseRegions.map(r => ({ ...r, visible: anyVisible ? false : true })) })
    } else if (id === 'bg') {
      set({ bgEdit: s.bgEdit ? null : defaultBg() })
    } else if (id === 'crop') {
      set({
        crop: s.crop
          ? null
          : {
              x: 0,
              y: 0,
              width: s.imageSize.w,
              height: s.imageSize.h,
              rotation: 0,
              flipH: false,
              flipV: false,
              aspectPreset: 'free',
              guidePreset: 'none',
            },
      })
    } else if (id === 'filter') {
      set({
        filter:
          s.filter.preset !== 'original'
            ? defaultFilter()
            : { ...s.filter, preset: 'cinematic', presetStrength: 100 },
      })
    } else if (id === 'outpaint') {
      set({
        outpaint: s.outpaint
          ? null
          : { directions: [], top: 0, bottom: 0, left: 0, right: 0, scale: 1.5, prompt: '' },
      })
    } else {
      set({ maskLayers: s.maskLayers.map(l => (l.id === id ? { ...l, visible: !l.visible } : l)) })
    }
    get().rebuildLayers()
  },

  toggleLayerLock: id => {
    const s = get()
    const update = (arr: { id: string; locked?: boolean }[]) =>
      arr.map(l => (l.id === id ? { ...l, locked: !l.locked } : l))
    if (id === 'pins') set({ pins: update(s.pins) as PinMarker[] })
    else if (id === 'texts') set({ textAdditions: update(s.textAdditions) as TextAddition[] })
    else if (id === 'erase') set({ eraseRegions: update(s.eraseRegions) as EraseRegion[] })
    else set({ maskLayers: update(s.maskLayers) as MaskLayer[] })
  },

  setLayerOpacity: (id, opacity) => {
    const s = get()
    if (id === 'filter') {
      set({ filter: { ...s.filter, presetStrength: opacity } })
    } else if (id === 'pins') {
      set({ pinSize: Math.min(Math.max(opacity, 12), 64) })
    } else
      set({
        maskLayers: s.maskLayers.map(l => (l.id === id ? { ...l, opacity } : l)) as MaskLayer[],
      })
  },

  // 历史（50步）
  pushHistory: () => {
    const s = get()
    const snap = getSnapshot(s)
    const past = [...s.past, snap].slice(-50)
    set({ past, future: [] })
  },

  undo: () => {
    const s = get()
    if (!s.past.length) return
    const prev = s.past[s.past.length - 1]
    const current = getSnapshot(s)
    set({
      past: s.past.slice(0, -1),
      future: [current, ...s.future],
      ...applySnapshot(s, prev),
    })
  },

  redo: () => {
    const s = get()
    if (!s.future.length) return
    const next = s.future[0]
    const current = getSnapshot(s)
    set({
      past: [...s.past, current],
      future: s.future.slice(1),
      ...applySnapshot(s, next),
    })
  },

  resetAll: () => {
    get().pushHistory()
    const _initial = emptySnapshot()
    set({
      maskLayers: [],
      activeMaskLayerId: null,
      pins: [],
      selectedPinId: null,
      textAdditions: [],
      textReplacements: [],
      selectedTextId: null,
      eraseRegions: [],
      bgEdit: null,
      crop: null,
      filter: defaultFilter(),
      outpaint: null,
    })
    get().rebuildLayers()
  },

  toggleHistory: () => set(s => ({ historyOpen: !s.historyOpen })),

  goToHistory: idx => {
    const s = get()
    if (idx < 0 || idx >= s.past.length) return
    const target = s.past[idx]
    const current = getSnapshot(s)
    set({
      past: s.past.slice(0, idx),
      future: [current, ...s.future.slice(0, s.past.length - idx)],
      ...applySnapshot(s, target),
    })
  },

  // 提交
  toggleSubmitPanel: () => set(s => ({ submitPanelOpen: !s.submitPanelOpen })),
  toggleAdvanced: () => set(s => ({ advancedOpen: !s.advancedOpen })),
  setAdvancedParams: params =>
    set(s => ({
      advancedParams: { ...s.advancedParams, ...params },
    })),

  // UI
  setMaskPromptVisible: v => set({ maskPromptVisible: v }),
  setPreviewMode: m => set({ previewMode: m }),

  // 工具参数
  setBrushSize: n => set({ brushSize: Math.min(Math.max(n, 1), 200) }),
  setBrushHardness: n => set({ brushHardness: Math.min(Math.max(n, 0), 100) }),
  setBrushColor: c => set({ brushColor: c }),
  setBrushFlow: n => set({ brushFlow: Math.min(Math.max(n, 0), 100) }),
  setBrushEraser: b => set({ brushEraser: b }),
  setPinStyle: s => set({ pinStyle: s }),
  setPinColor: c => set({ pinColor: c }),
  setPinSize: n => set({ pinSize: Math.min(Math.max(n, 12), 64) }),
  setFontFamily: f => set({ fontFamily: f }),
  setFontSize: n => set({ fontSize: Math.min(Math.max(n, 8), 200) }),
  setFontColor: c => set({ fontColor: c }),
  setFontWeight: w => set({ fontWeight: w }),
  setLetterSpacing: n => set({ letterSpacing: n }),
  setLineHeight: n => set({ lineHeight: n }),
  setTextOpacity: n => set({ textOpacity: Math.min(Math.max(n, 0), 100) }),
  setTextAlign: a => set({ textAlign: a }),
  setTextDirection: d => set({ textDirection: d }),
  setTextRotation: n => set({ textRotation: n }),
  setTextStroke: s => set({ textStroke: s }),
  setTextShadow: s => set({ textShadow: s }),
  setTextBgColor: c => set({ textBgColor: c }),
  setTextBgRadius: n => set({ textBgRadius: n }),
  setSmartDetect: b => set({ smartDetect: b }),
  setFillMethod: m => set({ fillMethod: m }),
}))
