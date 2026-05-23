import { create } from 'zustand'
import {
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type Connection,
  type XYPosition,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
} from '@xyflow/react'
import { generateImages } from '../../../api/imageClient'
import { getApiConfig } from '../../../api/settings'
import {
  loadImageDimensions,
  type ResolutionPresetId,
  type SizeTierId,
} from '../../../utils/resolutionPresets'
import { resolveGenerationSize } from '../../../utils/generationSize'
import { useGenerationStore } from '../../../store/generationStore'
import { idbGet, idbSet } from '../../../utils/idb'

export type NodeKind = 'image' | 'text' | 'generate'

export interface CanvasNodeData extends Record<string, unknown> {
  kind: NodeKind
  label: string
  imageUrl?: string
  imageResults?: Array<{ url: string; prompt?: string }>
  prompt?: string
  negativePrompt?: string
  text?: string
  status?: 'idle' | 'queued' | 'running' | 'success' | 'error'
  progress?: number
  lastError?: string
  model?: string
  width?: number
  height?: number
}

export type CanvasNode = Node<CanvasNodeData>

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  imageUrls?: string[]
  refImageUrls?: string[]
  model?: string
  nodeId?: string
  error?: string
}

const STORAGE_KEY = 'liang007_canvas_v5'
const CHAT_KEY = 'liang007_canvas_chat_v5'
const genId = () => `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

function getCanvasSize(
  aspect: ResolutionPresetId,
  sizeTier: SizeTierId,
  referenceSize: { width: number; height: number } | null,
): { w: number; h: number } {
  const { width, height } = resolveGenerationSize({
    resolutionPreset: aspect,
    sizeTier,
    referenceSize,
  })
  return { w: width, h: height }
}

async function dataUrlToFile(url: string, name: string): Promise<File | null> {
  try {
    const resp = await fetch(url)
    const blob = await resp.blob()
    return new File([blob], name, { type: blob.type || 'image/png' })
  } catch {
    return null
  }
}

async function getFirstImageSize(
  file: File | undefined,
): Promise<{ width: number; height: number } | null> {
  if (!file) return null
  try {
    return await loadImageDimensions(file)
  } catch {
    return null
  }
}

function getGenerationParams() {
  const genState = useGenerationStore.getState()
  const aspect = genState.resolutionPreset as ResolutionPresetId
  const sizeTier = genState.sizeTier as SizeTierId
  const model = genState.model || getApiConfig().imageModels[0]?.modelId || ''
  return { genState, aspect, sizeTier, model }
}

function saveCanvas(nodes: CanvasNode[], edges: Edge[]) {
  const payload = { nodes, edges, ts: Date.now() }
  // 主存储：IndexedDB（无容量限制）
  idbSet('canvas', 'canvas_data', payload).catch(() => {})
  // 兜底：localStorage 精简版（移除 data: URL 图片）
  try {
    const lightNodes = nodes.map(n => {
      if (n.data?.imageUrl?.startsWith('data:')) {
        return { ...n, data: { ...n.data, imageUrl: undefined } }
      }
      return n
    })
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ nodes: lightNodes, edges, ts: Date.now() }))
  } catch {
    // localStorage 配额超限静默
  }
}

function loadCanvas(): { nodes: CanvasNode[]; edges: Edge[]; ts?: number } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const d = JSON.parse(raw)
    if (Array.isArray(d.nodes)) return { nodes: d.nodes, edges: d.edges ?? [], ts: d.ts }
  } catch {
    /* corrupt */
  }
  return null
}

/** 异步从 IndexedDB 加载完整白板数据（含图片） */
async function loadCanvasAsync(): Promise<{
  nodes: CanvasNode[]
  edges: Edge[]
  ts?: number
} | null> {
  try {
    const data = await idbGet<{ nodes: CanvasNode[]; edges: Edge[]; ts?: number }>(
      'canvas',
      'canvas_data',
    )
    if (data && Array.isArray(data.nodes)) return data
  } catch {
    /* idb unavailable */
  }
  return null
}

function saveChat(history: ChatMessage[]) {
  const trimmed = history.slice(-100)
  idbSet('canvas', 'chat_history', trimmed).catch(() => {})
  try {
    localStorage.setItem(CHAT_KEY, JSON.stringify(trimmed))
  } catch {
    /* quota */
  }
}

function loadChat(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(CHAT_KEY)
    if (!raw) return []
    const d = JSON.parse(raw)
    if (Array.isArray(d)) return d
  } catch {
    /* corrupt */
  }
  return []
}

interface CanvasStore {
  nodes: CanvasNode[]
  edges: Edge[]
  selectedNodeId: string | null
  contextMenu: { x: number; y: number; nodeId: string } | null
  lightboxUrl: string | null
  chatHistory: ChatMessage[]
  chatPanelOpen: boolean

  // 撤销/重做
  historyPast: Array<{ nodes: CanvasNode[]; edges: Edge[] }>
  historyFuture: Array<{ nodes: CanvasNode[]; edges: Edge[] }>
  canUndo: () => boolean
  canRedo: () => boolean
  pushHistory: () => void
  undo: () => void
  redo: () => void

  onNodesChange: OnNodesChange<CanvasNode>
  onEdgesChange: OnEdgesChange
  onConnect: (c: Connection) => void

  addNode: (kind: NodeKind, pos?: XYPosition, data?: Partial<CanvasNodeData>) => string
  updateNode: (id: string, data: Partial<CanvasNodeData>) => void
  removeNode: (id: string) => void
  duplicateNode: (id: string) => void
  selectNode: (id: string | null) => void

  runGenerate: (nodeId: string) => Promise<void>
  runGenerateFromPrompt: (
    prompt: string,
    refUrls?: string[],
    negativePrompt?: string,
  ) => Promise<void>
  runAllGenerateNodes: () => Promise<void>
  retryFromMessage: (messageId: string) => Promise<void>
  autoLayout: () => void
  clearCompletedNodes: () => void
  clearErrorNodes: () => void
  downloadAllImages: () => void

  setContextMenu: (m: CanvasStore['contextMenu']) => void
  setLightboxUrl: (url: string | null) => void
  setChatPanelOpen: (v: boolean) => void
  clearChat: () => void

  loadFromStorage: () => void
  clearCanvas: () => void
  exportJSON: () => string
  importJSON: (json: string) => void
}

function isImageInputUnsupportedError(err: string): boolean {
  if (!err) return false
  const lower = err.toLowerCase()
  return (
    lower.includes('does not support image input') ||
    lower.includes('does not support image') ||
    (lower.includes('cannot read') && lower.includes('image'))
  )
}

export const useCanvasStore = create<CanvasStore>()((set, get) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,
  contextMenu: null,
  lightboxUrl: null,
  chatHistory: loadChat(),
  chatPanelOpen: false,
  historyPast: [],
  historyFuture: [],

  canUndo: () => get().historyPast.length > 0,
  canRedo: () => get().historyFuture.length > 0,

  pushHistory: () => {
    const { nodes, edges, historyPast } = get()
    set({
      historyPast: [...historyPast.slice(-49), { nodes, edges }],
      historyFuture: [],
    })
  },

  undo: () => {
    const { historyPast, historyFuture, nodes, edges } = get()
    if (historyPast.length === 0) return
    const prev = historyPast[historyPast.length - 1]
    set({
      nodes: prev.nodes,
      edges: prev.edges,
      historyPast: historyPast.slice(0, -1),
      historyFuture: [{ nodes, edges }, ...historyFuture.slice(0, 49)],
    })
    saveCanvas(prev.nodes, prev.edges)
  },

  redo: () => {
    const { historyPast, historyFuture, nodes, edges } = get()
    if (historyFuture.length === 0) return
    const next = historyFuture[0]
    set({
      nodes: next.nodes,
      edges: next.edges,
      historyPast: [...historyPast.slice(-49), { nodes, edges }],
      historyFuture: historyFuture.slice(1),
    })
    saveCanvas(next.nodes, next.edges)
  },

  onNodesChange: changes => {
    const next = applyNodeChanges(changes, get().nodes) as CanvasNode[]
    set({ nodes: next })
    saveCanvas(next, get().edges)
  },

  onEdgesChange: changes => {
    const next = applyEdgeChanges(changes, get().edges)
    set({ edges: next })
    saveCanvas(get().nodes, next)
  },

  onConnect: c => {
    const next = addEdge(
      {
        ...c,
        type: 'canvasEdge',
        animated: false,
        style: { stroke: '#6366f1', strokeWidth: 1.5 },
      },
      get().edges,
    )
    set({ edges: next })
    saveCanvas(get().nodes, next)

    // TextNode → GenerateNode 自动同步提示词
    if (c.source && c.target) {
      const srcNode = get().nodes.find(n => n.id === c.source)
      const tgtNode = get().nodes.find(n => n.id === c.target)
      if (srcNode?.data?.kind === 'text' && tgtNode?.data?.kind === 'generate') {
        const prompt = String(srcNode.data.prompt || '')
        if (prompt.trim()) {
          get().updateNode(c.target, { prompt })
        }
      }
    }
  },

  addNode: (kind, pos, extraData) => {
    get().pushHistory()
    const id = genId()
    const defaults: Record<NodeKind, Partial<CanvasNodeData>> = {
      image: { kind: 'image', label: '图片', width: 240, height: 240 },
      text: { kind: 'text', label: '提示词', prompt: '' },
      generate: { kind: 'generate', label: 'AI 生成', status: 'idle', progress: 0 },
    }
    const node: CanvasNode = {
      id,
      type: `${kind}Node`,
      position: pos ?? { x: 200 + Math.random() * 300, y: 150 + Math.random() * 200 },
      data: { ...defaults[kind], ...extraData } as CanvasNodeData,
    }
    const next = [...get().nodes, node]
    set({ nodes: next, selectedNodeId: id })
    saveCanvas(next, get().edges)
    return id
  },

  updateNode: (id, data) => {
    const next = get().nodes.map(n =>
      n.id === id ? { ...n, data: { ...n.data, ...data } } : n,
    ) as CanvasNode[]
    set({ nodes: next })
    saveCanvas(next, get().edges)
  },

  removeNode: id => {
    get().pushHistory()
    const nodes = get().nodes.filter(n => n.id !== id)
    const edges = get().edges.filter(e => e.source !== id && e.target !== id)
    set({ nodes, edges, selectedNodeId: get().selectedNodeId === id ? null : get().selectedNodeId })
    saveCanvas(nodes, edges)
  },

  duplicateNode: id => {
    const node = get().nodes.find(n => n.id === id)
    if (!node) return
    const newId = genId()
    const newNode: CanvasNode = {
      ...node,
      id: newId,
      position: { x: node.position.x + 40, y: node.position.y + 40 },
      data: { ...node.data },
      selected: false,
    }
    const next = [...get().nodes, newNode]
    set({ nodes: next, selectedNodeId: newId })
    saveCanvas(next, get().edges)
  },

  selectNode: id => set({ selectedNodeId: id }),

  runGenerate: async nodeId => {
    const node = get().nodes.find(n => n.id === nodeId)
    if (!node) return
    const d = node.data
    const prompt = d.prompt || ''
    const negativePrompt = String(d.negativePrompt || '')
    if (!prompt.trim()) return

    get().updateNode(nodeId, { status: 'running', progress: 10, lastError: undefined })

    const { aspect, sizeTier, model } = getGenerationParams()

    const refUrls: string[] = []
    get()
      .edges.filter(e => e.target === nodeId)
      .forEach(e => {
        const src = get().nodes.find(n => n.id === e.source)
        if (src?.data?.imageUrl) refUrls.push(String(src.data.imageUrl))
      })

    const referenceImages: File[] = []
    for (const [i, url] of refUrls.entries()) {
      const file = await dataUrlToFile(url, `ref_${i + 1}.png`)
      if (file) referenceImages.push(file)
    }
    const referenceSize = await getFirstImageSize(referenceImages[0])
    const size = getCanvasSize(aspect, sizeTier, referenceSize)

    get().updateNode(nodeId, { progress: 40 })

    let result = await generateImages({
      prompt,
      model,
      batchSize: 1,
      width: size.w,
      height: size.h,
      referenceImages,
      negativePrompt: negativePrompt || undefined,
      resolutionPreset: aspect,
      sizeTier,
    })
    if (result.error && referenceImages.length > 0 && isImageInputUnsupportedError(result.error)) {
      get().updateNode(nodeId, {
        progress: 60,
        lastError: '当前模型不支持参考图，已切换为纯文生图模式',
      })
      const fallbackSize = getCanvasSize(aspect === 'original' ? '1:1' : aspect, sizeTier, null)
      result = await generateImages({
        prompt,
        model,
        batchSize: 1,
        width: fallbackSize.w,
        height: fallbackSize.h,
        referenceImages: [],
        negativePrompt: negativePrompt || undefined,
        resolutionPreset: aspect === 'original' ? '1:1' : aspect,
        sizeTier,
      })
    }

    if (result.error) {
      get().updateNode(nodeId, { status: 'error', lastError: result.error, progress: 0 })
      const errMsg: ChatMessage = {
        id: `m${genId()}`,
        role: 'assistant',
        content: `生成失败: ${result.error}`,
        timestamp: Date.now(),
        model,
        nodeId,
        error: result.error,
      }
      const next = [...get().chatHistory, errMsg]
      set({ chatHistory: next })
      saveChat(next)
      return
    }

    const images = result.images.map(img => ({ url: img.url, prompt }))
    get().updateNode(nodeId, {
      status: 'success',
      progress: 100,
      imageResults: images,
      imageUrl: images[0]?.url,
      lastError: undefined,
    })

    const aiMsg: ChatMessage = {
      id: `m${genId()}`,
      role: 'assistant',
      content: `已生成 ${images.length} 张图片`,
      timestamp: Date.now(),
      imageUrls: images.map(i => i.url),
      refImageUrls: refUrls.length > 0 ? refUrls : undefined,
      model,
      nodeId,
    }
    const next = [...get().chatHistory, aiMsg]
    set({ chatHistory: next })
    saveChat(next)

    const downstreamEdges = get().edges.filter(e => e.source === nodeId)
    for (const edge of downstreamEdges) {
      const target = get().nodes.find(n => n.id === edge.target)
      if (target?.data?.kind === 'image' && images[0]) {
        get().updateNode(edge.target, { imageUrl: images[0].url })
      }
    }
  },

  runGenerateFromPrompt: async (prompt, refUrls, negativePrompt) => {
    const userMsg: ChatMessage = {
      id: `m${genId()}`,
      role: 'user',
      content: prompt,
      timestamp: Date.now(),
      refImageUrls: refUrls && refUrls.length > 0 ? refUrls : undefined,
    }
    const histAfterUser = [...get().chatHistory, userMsg]
    set({ chatHistory: histAfterUser })
    saveChat(histAfterUser)

    const { aspect, sizeTier, model, genState } = getGenerationParams()
    const batchCount = genState.batchSize

    const referenceImages: File[] = []
    for (const [i, url] of (refUrls ?? []).entries()) {
      const file = await dataUrlToFile(url, `ref_${i + 1}.png`)
      if (file) referenceImages.push(file)
    }
    const referenceSize = await getFirstImageSize(referenceImages[0])
    const size = getCanvasSize(aspect, sizeTier, referenceSize)

    // 创建占位节点
    const nodeIds: string[] = []
    for (let i = 0; i < batchCount; i++) {
      const id = get().addNode(
        'generate',
        {
          x: 200 + Math.random() * 200 + i * 40,
          y: 150 + Math.random() * 200 + i * 40,
        },
        { prompt, negativePrompt, status: 'running', progress: 10 },
      )
      nodeIds.push(id)
    }

    get().updateNode(nodeIds[0], { progress: 50 })

    let result = await generateImages({
      prompt,
      model,
      batchSize: batchCount,
      width: size.w,
      height: size.h,
      referenceImages,
      negativePrompt: negativePrompt || undefined,
      resolutionPreset: aspect,
      sizeTier,
    })

    if (result.error && referenceImages.length > 0 && isImageInputUnsupportedError(result.error)) {
      nodeIds.forEach(id =>
        get().updateNode(id, { progress: 70, lastError: '当前模型不支持参考图，已切换为纯文生图' }),
      )
      const fallbackSize = getCanvasSize(aspect === 'original' ? '1:1' : aspect, sizeTier, null)
      result = await generateImages({
        prompt,
        model,
        batchSize: batchCount,
        width: fallbackSize.w,
        height: fallbackSize.h,
        referenceImages: [],
        negativePrompt: negativePrompt || undefined,
        resolutionPreset: aspect === 'original' ? '1:1' : aspect,
        sizeTier,
      })
    }

    if (result.error) {
      nodeIds.forEach(id =>
        get().updateNode(id, { status: 'error', lastError: result.error, progress: 0 }),
      )
      const errMsg: ChatMessage = {
        id: `m${genId()}`,
        role: 'assistant',
        content: `生成失败: ${result.error}`,
        timestamp: Date.now(),
        model,
        error: result.error,
      }
      const next = [...get().chatHistory, errMsg]
      set({ chatHistory: next })
      saveChat(next)
      return
    }

    const images = result.images.map(img => ({ url: img.url, prompt }))
    nodeIds.forEach((id, i) => {
      const img = images[i] || images[0]
      if (img) {
        get().updateNode(id, {
          status: 'success',
          progress: 100,
          imageResults: [img],
          imageUrl: img.url,
          lastError: undefined,
        })
      }
    })

    const aiMsg: ChatMessage = {
      id: `m${genId()}`,
      role: 'assistant',
      content: `已生成 ${images.length} 张图片`,
      timestamp: Date.now(),
      imageUrls: images.map(i => i.url),
      model,
    }
    const next = [...get().chatHistory, aiMsg]
    set({ chatHistory: next })
    saveChat(next)
  },

  retryFromMessage: async messageId => {
    const idx = get().chatHistory.findIndex(m => m.id === messageId)
    if (idx === -1) return
    const msg = get().chatHistory[idx]
    if (msg.role !== 'user') return
    await get().runGenerateFromPrompt(msg.content, msg.refImageUrls)
  },

  runAllGenerateNodes: async () => {
    const generateNodes = get().nodes.filter(
      n => n.data?.kind === 'generate' && n.data?.status !== 'running',
    )
    for (const node of generateNodes) {
      await get().runGenerate(node.id)
    }
  },

  clearCompletedNodes: () => {
    const { nodes, edges } = get()
    const toRemove = new Set(nodes.filter(n => n.data?.status === 'success').map(n => n.id))
    if (toRemove.size === 0) return
    const nextNodes = nodes.filter(n => !toRemove.has(n.id))
    const nextEdges = edges.filter(e => !toRemove.has(e.source) && !toRemove.has(e.target))
    set({ nodes: nextNodes, edges: nextEdges })
    saveCanvas(nextNodes, nextEdges)
  },

  clearErrorNodes: () => {
    const { nodes, edges } = get()
    const toRemove = new Set(nodes.filter(n => n.data?.status === 'error').map(n => n.id))
    if (toRemove.size === 0) return
    const nextNodes = nodes.filter(n => !toRemove.has(n.id))
    const nextEdges = edges.filter(e => !toRemove.has(e.source) && !toRemove.has(e.target))
    set({ nodes: nextNodes, edges: nextEdges })
    saveCanvas(nextNodes, nextEdges)
  },

  downloadAllImages: () => {
    const urls: Array<{ url: string; name: string }> = []
    get().nodes.forEach(n => {
      const d = n.data as Record<string, unknown>
      if (d.imageUrl && typeof d.imageUrl === 'string') {
        urls.push({ url: d.imageUrl, name: String(d.label || 'image') })
      }
      const results = d.imageResults as Array<{ url: string }> | undefined
      if (Array.isArray(results)) {
        results.forEach((r, i) => {
          if (r?.url) urls.push({ url: r.url, name: `${String(d.label || 'gen')}_${i + 1}` })
        })
      }
    })
    if (urls.length === 0) return
    urls.forEach((item, i) => {
      setTimeout(() => {
        const a = document.createElement('a')
        a.href = item.url
        a.download = `${item.name}_${Date.now()}_${i}.png`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
      }, i * 200)
    })
  },

  autoLayout: () => {
    const { nodes, edges } = get()
    if (nodes.length === 0) return

    // 简单的层级布局：按连接关系分层
    const inDegree: Record<string, number> = {}
    const adj: Record<string, string[]> = {}
    nodes.forEach(n => {
      inDegree[n.id] = 0
      adj[n.id] = []
    })
    edges.forEach(e => {
      if (e.source && e.target) {
        inDegree[e.target] = (inDegree[e.target] || 0) + 1
        adj[e.source] = [...(adj[e.source] || []), e.target]
      }
    })

    // 拓扑排序分层
    const layers: string[][] = []
    const visited = new Set<string>()
    let queue = nodes.filter(n => (inDegree[n.id] || 0) === 0).map(n => n.id)

    while (queue.length > 0) {
      layers.push([...queue])
      queue.forEach(id => visited.add(id))
      const next: string[] = []
      queue.forEach(id => {
        ;(adj[id] || []).forEach(child => {
          if (!visited.has(child)) {
            const allParentsVisited = edges
              .filter(e => e.target === child)
              .every(e => visited.has(e.source))
            if (allParentsVisited) next.push(child)
          }
        })
      })
      queue = [...new Set(next)]
    }

    // 未被分层的节点放最后
    const unvisited = nodes.filter(n => !visited.has(n.id)).map(n => n.id)
    if (unvisited.length > 0) layers.push(unvisited)

    const COL_GAP = 380
    const ROW_GAP = 280
    const posMap: Record<string, { x: number; y: number }> = {}

    layers.forEach((layer, col) => {
      const totalH = (layer.length - 1) * ROW_GAP
      layer.forEach((id, row) => {
        posMap[id] = {
          x: col * COL_GAP + 80,
          y: row * ROW_GAP - totalH / 2 + 300,
        }
      })
    })

    const next = nodes.map(n =>
      posMap[n.id] ? { ...n, position: posMap[n.id] } : n,
    ) as CanvasNode[]
    set({ nodes: next })
    saveCanvas(next, get().edges)
  },

  setContextMenu: m => set({ contextMenu: m }),
  setLightboxUrl: url => set({ lightboxUrl: url }),
  setChatPanelOpen: v => set({ chatPanelOpen: v }),
  clearChat: () => {
    set({ chatHistory: [] })
    saveChat([])
  },

  loadFromStorage: () => {
    // 同步加载 localStorage 精简版（立即显示）
    const saved = loadCanvas()
    if (saved) set({ nodes: saved.nodes, edges: saved.edges })
    // 异步加载 IndexedDB 完整版（含图片数据），使用时间戳比较
    loadCanvasAsync().then(idbData => {
      if (idbData) {
        const idbTs = idbData.ts ?? 0
        const lsTs = saved?.ts ?? 0
        // IDB 数据更新或同样新且更完整时使用
        if (idbTs >= lsTs) {
          set({ nodes: idbData.nodes, edges: idbData.edges })
        }
      }
    })
    // 异步加载聊天记录
    idbGet<ChatMessage[]>('canvas', 'chat_history').then(idbChat => {
      if (idbChat && Array.isArray(idbChat) && idbChat.length > 0) {
        set(s => {
          if (idbChat.length >= s.chatHistory.length) return { chatHistory: idbChat }
          return {}
        })
      }
    })
  },

  clearCanvas: () => {
    set({ nodes: [], edges: [], selectedNodeId: null })
    localStorage.removeItem(STORAGE_KEY)
    idbSet('canvas', 'canvas_data', null).catch(() => {})
  },

  exportJSON: () =>
    JSON.stringify(
      {
        version: '5.0',
        nodes: get().nodes,
        edges: get().edges,
        chatHistory: get().chatHistory,
      },
      null,
      2,
    ),

  importJSON: json => {
    try {
      const d = JSON.parse(json)
      if (Array.isArray(d.nodes)) {
        set(s => ({ nodes: [...s.nodes, ...d.nodes], edges: [...s.edges, ...(d.edges ?? [])] }))
        saveCanvas(get().nodes, get().edges)
      }
    } catch {
      /* invalid */
    }
  },
}))

export const ASPECT_LIST = [
  'original',
  '1:1',
  '16:9',
  '9:16',
  '4:3',
  '3:4',
  '21:9',
  '3:2',
  '2:3',
  '5:4',
  '4:5',
]
export { getCanvasSize }
