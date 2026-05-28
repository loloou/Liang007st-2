// ── Node types ──────────────────────────────────────────────────────────────

export type SmartNodeType = 'smart-image' | 'smart-prompt' | 'smart-loop'

/** Image data stored within a node */
export interface NodeImage {
  url: string
  name?: string
  kind?: 'generated' | 'uploaded' | 'reference'
  naturalWidth?: number
  naturalHeight?: number
}

/** Per-node generation settings snapshot */
export interface NodeRunSettings {
  engine?: 'api' | 'modelscope' | 'custom'
  model?: string
  provider?: string
  ratio?: string
  resolution?: string
  quality?: string
  count?: number
}

/** Core node data model */
export interface SmartNode {
  id: string
  type: SmartNodeType
  x: number
  y: number
  w: number
  h: number
  scale: number
  title: string
  images: NodeImage[]
  createdAt: number
  running: boolean
  pending: number
  runSettings: NodeRunSettings

  // Prompt node specific
  text?: string
  systemPrompt?: string

  // Loop node specific
  loopCount?: number
  loopMode?: 'serial' | 'parallel'
  loopVariables?: string[]

  // Run timing
  runStartedAt?: number
  runFinishedAt?: number
  runElapsedMs?: number
  generationTaskId?: string
  generationError?: string

  // Outpaint
  outpaintSize?: { top: number; right: number; bottom: number; left: number } | null
}

// ── Connections ─────────────────────────────────────────────────────────────

/** Connection between two nodes */
export interface NodeConnection {
  from: string // source node ID
  to: string // target node ID
  kind: 'flow' | 'input'
}

// ── Viewport ────────────────────────────────────────────────────────────────

export interface Viewport {
  x: number
  y: number
  scale: number
}

// ── Canvas document ─────────────────────────────────────────────────────────

export interface CanvasDocument {
  id: string
  name: string
  nodes: SmartNode[]
  connections: NodeConnection[]
  viewport: Viewport
  createdAt: number
  updatedAt: number
}

// ── Size presets ────────────────────────────────────────────────────────────

export type RatioPreset =
  | 'square'
  | 'landscape'
  | 'portrait'
  | 'wide'
  | 'ultrawide'
  | 'story'
  | 'custom'

export type ResolutionPreset = '1k' | '2k' | '4k'

export interface SizePreset {
  ratio: RatioPreset
  resolution: ResolutionPreset
  width: number
  height: number
  label: string
}

/** Width/height for every ratio+resolution combination */
export const SIZE_PRESETS: Record<
  RatioPreset,
  Record<ResolutionPreset, { w: number; h: number }>
> = {
  square: {
    '1k': { w: 1024, h: 1024 },
    '2k': { w: 1536, h: 1536 },
    '4k': { w: 2048, h: 2048 },
  },
  landscape: {
    '1k': { w: 1024, h: 768 },
    '2k': { w: 1536, h: 1024 },
    '4k': { w: 2048, h: 1536 },
  },
  portrait: {
    '1k': { w: 768, h: 1024 },
    '2k': { w: 1024, h: 1536 },
    '4k': { w: 1536, h: 2048 },
  },
  wide: {
    '1k': { w: 1024, h: 576 },
    '2k': { w: 1536, h: 864 },
    '4k': { w: 2048, h: 1152 },
  },
  ultrawide: {
    '1k': { w: 1024, h: 440 },
    '2k': { w: 1536, h: 660 },
    '4k': { w: 2048, h: 880 },
  },
  story: {
    '1k': { w: 576, h: 1024 },
    '2k': { w: 864, h: 1536 },
    '4k': { w: 1152, h: 2048 },
  },
  custom: {
    '1k': { w: 1024, h: 1024 },
    '2k': { w: 1536, h: 1536 },
    '4k': { w: 2048, h: 2048 },
  },
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Generate a unique ID with an optional prefix */
export function uid(prefix = 'smart'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}
