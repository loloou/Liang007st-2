// ─────────────────────────────────────────────────────────────────────────────
//  CanvasState.ts — Zustand store for SmartCanvas state (rewritten)
//
//  Manages: nodes, connections, viewport, selection, undo/redo, generation,
//           composer settings, canvas identity, serialization.
// ─────────────────────────────────────────────────────────────────────────────

import { create } from 'zustand'
import type {
  SmartNode,
  NodeConnection,
  Viewport,
  CanvasDocument,
  NodeImage,
  SmartNodeType,
} from './types'
import { uid } from './types'
import { UndoManager } from './core/UndoManager'
import type { CanvasSnapshot } from './core/UndoManager'

// ── Default node dimensions per type ─────────────────────────────────────────

const DEFAULT_SIZES: Record<SmartNodeType, { w: number; h: number }> = {
  'smart-image': { w: 320, h: 320 },
  'smart-prompt': { w: 280, h: 200 },
  'smart-loop': { w: 240, h: 180 },
}

const DEFAULT_TITLES: Record<SmartNodeType, string> = {
  'smart-image': 'Image',
  'smart-prompt': 'Prompt',
  'smart-loop': 'Loop',
}

// ── Shared undo manager instance ─────────────────────────────────────────────

const undoManager = new UndoManager(40)

// ── Store interface ──────────────────────────────────────────────────────────

export interface SmartCanvasState {
  // Canvas identity
  canvasId: string
  canvasName: string
  canvasList: Array<{ id: string; name: string; updatedAt: number }>

  // Nodes and connections
  nodes: SmartNode[]
  connections: NodeConnection[]

  // Viewport
  viewport: Viewport

  // Selection
  selectedIds: string[]

  // Generation state
  runningNodeIds: string[]

  // Composer state
  composerEngine: 'api' | 'modelscope'
  activeProvider: string
  activeModel: string

  // Actions: Canvas management
  setCanvas: (id: string, name: string) => void
  setCanvasList: (list: Array<{ id: string; name: string; updatedAt: number }>) => void
  loadDocument: (doc: CanvasDocument) => void

  // Actions: Viewport
  setViewport: (vp: Viewport) => void

  // Actions: Node CRUD
  addNode: (type: SmartNodeType, x: number, y: number, data?: Partial<SmartNode>) => SmartNode
  removeNode: (id: string) => void
  removeNodes: (ids: string[]) => void
  updateNode: (id: string, patch: Partial<SmartNode>) => void
  updateNodes: (updates: Array<{ id: string; patch: Partial<SmartNode> }>) => void
  addImageToNode: (nodeId: string, image: NodeImage) => void

  // Actions: Connections
  addConnection: (from: string, to: string) => boolean
  removeConnection: (from: string, to: string) => void

  // Actions: Selection
  setSelectedIds: (ids: string[]) => void
  selectNode: (id: string, additive?: boolean) => void
  clearSelection: () => void

  // Actions: Generation
  setNodeRunning: (nodeId: string, running: boolean) => void

  // Actions: Composer
  setComposerEngine: (engine: 'api' | 'modelscope') => void
  setActiveProvider: (id: string) => void
  setActiveModel: (model: string) => void

  // Actions: Undo
  pushUndo: () => void
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean

  // Serialization
  serialize: () => CanvasDocument
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function createDefaultNode(
  type: SmartNodeType,
  x: number,
  y: number,
  overrides?: Partial<SmartNode>,
): SmartNode {
  const size = DEFAULT_SIZES[type]
  const base: SmartNode = {
    id: uid(type.replace('smart-', '')),
    type,
    x,
    y,
    w: size.w,
    h: size.h,
    scale: 1,
    title: DEFAULT_TITLES[type],
    images: [],
    createdAt: Date.now(),
    running: false,
    pending: 0,
    runSettings: {},
  }

  // Add type-specific defaults
  if (type === 'smart-prompt') {
    base.text = ''
    base.systemPrompt = ''
  }

  if (type === 'smart-loop') {
    base.loopCount = 1
    base.loopMode = 'serial'
    base.loopVariables = []
  }

  // Apply caller overrides
  if (overrides) {
    return { ...base, ...overrides, id: base.id, type, createdAt: base.createdAt }
  }

  return base
}

function snapshot(state: { nodes: SmartNode[]; connections: NodeConnection[] }): CanvasSnapshot {
  return { nodes: state.nodes, connections: state.connections }
}

// ── Store ────────────────────────────────────────────────────────────────────

export const useSmartCanvasStore = create<SmartCanvasState>()((set, get) => ({
  // ── Initial state ──────────────────────────────────────────────────────

  canvasId: '',
  canvasName: 'Untitled',
  canvasList: [],

  nodes: [],
  connections: [],

  viewport: { x: 0, y: 0, scale: 1 },

  selectedIds: [],

  runningNodeIds: [],

  composerEngine: 'api' as const,
  activeProvider: '',
  activeModel: '',

  canUndo: false,
  canRedo: false,

  // ── Canvas management ──────────────────────────────────────────────────

  setCanvas: (id, name) => set({ canvasId: id, canvasName: name }),

  setCanvasList: list => set({ canvasList: list }),

  loadDocument: doc => {
    undoManager.clear()
    set({
      canvasId: doc.id,
      canvasName: doc.name,
      nodes: doc.nodes,
      connections: doc.connections,
      viewport: doc.viewport,
      selectedIds: [],
      canUndo: false,
      canRedo: false,
    })
  },

  // ── Viewport ───────────────────────────────────────────────────────────

  setViewport: vp => set({ viewport: vp }),

  // ── Node CRUD ──────────────────────────────────────────────────────────

  addNode: (type, x, y, data) => {
    const node = createDefaultNode(type, x, y, data)
    set(s => ({ nodes: [...s.nodes, node] }))
    return node
  },

  removeNode: id =>
    set(s => ({
      nodes: s.nodes.filter(n => n.id !== id),
      connections: s.connections.filter(c => c.from !== id && c.to !== id),
      selectedIds: s.selectedIds.filter(sid => sid !== id),
    })),

  removeNodes: ids => {
    const idSet = new Set(ids)
    set(s => ({
      nodes: s.nodes.filter(n => !idSet.has(n.id)),
      connections: s.connections.filter(c => !idSet.has(c.from) && !idSet.has(c.to)),
      selectedIds: s.selectedIds.filter(sid => !idSet.has(sid)),
    }))
  },

  updateNode: (id, patch) =>
    set(s => ({
      nodes: s.nodes.map(n => (n.id === id ? { ...n, ...patch } : n)),
    })),

  updateNodes: updates =>
    set(s => {
      const patchMap = new Map(updates.map(u => [u.id, u.patch]))
      return {
        nodes: s.nodes.map(n => {
          const patch = patchMap.get(n.id)
          return patch ? { ...n, ...patch } : n
        }),
      }
    }),

  addImageToNode: (nodeId, image) =>
    set(s => ({
      nodes: s.nodes.map(n => (n.id === nodeId ? { ...n, images: [...n.images, image] } : n)),
    })),

  // ── Connections ────────────────────────────────────────────────────────

  addConnection: (from, to) => {
    const s = get()

    // Prevent self-connections
    if (from === to) return false

    // Prevent duplicates
    const exists = s.connections.some(c => c.from === from && c.to === to)
    if (exists) return false

    // Verify both nodes exist
    const fromExists = s.nodes.some(n => n.id === from)
    const toExists = s.nodes.some(n => n.id === to)
    if (!fromExists || !toExists) return false

    set({
      connections: [...s.connections, { from, to, kind: 'flow' as const }],
    })
    return true
  },

  removeConnection: (from, to) =>
    set(s => ({
      connections: s.connections.filter(c => !(c.from === from && c.to === to)),
    })),

  // ── Selection ──────────────────────────────────────────────────────────

  setSelectedIds: ids => set({ selectedIds: ids }),

  selectNode: (id, additive = false) =>
    set(s => {
      if (additive) {
        // Toggle: add if not present, remove if present
        const exists = s.selectedIds.includes(id)
        return {
          selectedIds: exists ? s.selectedIds.filter(sid => sid !== id) : [...s.selectedIds, id],
        }
      }
      return { selectedIds: [id] }
    }),

  clearSelection: () => set({ selectedIds: [] }),

  // ── Generation ─────────────────────────────────────────────────────────

  setNodeRunning: (nodeId, running) =>
    set(s => {
      const runningNodeIds = running
        ? s.runningNodeIds.includes(nodeId)
          ? s.runningNodeIds
          : [...s.runningNodeIds, nodeId]
        : s.runningNodeIds.filter(id => id !== nodeId)

      return {
        runningNodeIds,
        nodes: s.nodes.map(n => (n.id === nodeId ? { ...n, running } : n)),
      }
    }),

  // ── Composer ───────────────────────────────────────────────────────────

  setComposerEngine: engine => set({ composerEngine: engine }),
  setActiveProvider: id => set({ activeProvider: id }),
  setActiveModel: model => set({ activeModel: model }),

  // ── Undo / Redo ────────────────────────────────────────────────────────

  pushUndo: () => {
    const s = get()
    undoManager.push(snapshot(s))
    set({ canUndo: undoManager.canUndo, canRedo: undoManager.canRedo })
  },

  undo: () => {
    const s = get()
    const prev = undoManager.undo(snapshot(s))
    if (prev) {
      set({
        nodes: prev.nodes,
        connections: prev.connections,
        canUndo: undoManager.canUndo,
        canRedo: undoManager.canRedo,
      })
    }
  },

  redo: () => {
    const s = get()
    const next = undoManager.redo(snapshot(s))
    if (next) {
      set({
        nodes: next.nodes,
        connections: next.connections,
        canUndo: undoManager.canUndo,
        canRedo: undoManager.canRedo,
      })
    }
  },

  // ── Serialization ──────────────────────────────────────────────────────

  serialize: (): CanvasDocument => {
    const s = get()
    return {
      id: s.canvasId,
      name: s.canvasName,
      nodes: s.nodes,
      connections: s.connections,
      viewport: s.viewport,
      createdAt: 0, // caller should set this from the original doc
      updatedAt: Date.now(),
    }
  },
}))
