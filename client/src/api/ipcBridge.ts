// ─────────────────────────────────────────────────────────────────────────────
//  ipcBridge.ts — Renderer-side bridge to Electron main process IPC
//
//  Provides type-safe wrappers for all IPC channels exposed via preload.
//  Falls back gracefully when not running in Electron (web-only mode).
// ─────────────────────────────────────────────────────────────────────────────

// ── Type definitions for window.electronAPI ──────────────────────────────────

export interface ElectronAPI {
  // Window controls
  minimize: () => void
  maximize: () => void
  toggleMaximize: () => void
  close: () => void
  isMaximized: () => Promise<boolean>
  fetchRequest: (params: {
    url: string
    method?: string
    headers?: Record<string, string>
    body?: string
    timeout?: number
  }) => Promise<{
    ok: boolean
    status: number
    statusText: string
    headers: Record<string, string>
    body: unknown
    error?: string
  }>

  // API generation
  apiGenerate: (params: IpcGenerateParams) => Promise<IpcGenerateResponse>
  apiCancel: (taskId: string) => Promise<boolean>
  apiStatus: (taskId: string) => Promise<IpcTaskStatus | null>
  apiServiceStatus: () => Promise<IpcServiceStatus>

  // Provider management
  apiProviders: () => Promise<IpcProviderConfig[]>
  apiProviderAdd: (config: Partial<IpcProviderConfig>) => Promise<IpcProviderConfig>
  apiProviderUpdate: (
    id: string,
    patch: Partial<IpcProviderConfig>,
  ) => Promise<IpcProviderConfig | null>
  apiProviderRemove: (id: string) => Promise<boolean>
  apiTest: (providerId: string) => Promise<{ ok: boolean; message: string }>
  apiModels: (providerId: string) => Promise<{ id: string; name: string }[]>
  apiImportSettings: (settings: unknown) => Promise<{ ok: boolean }>

  // Canvas
  canvasList: () => Promise<IpcCanvasListItem[]>
  canvasLoad: (canvasId: string) => Promise<IpcCanvasDocument | null>
  canvasSave: (canvasData: IpcCanvasDocument) => Promise<{ ok: boolean }>
  canvasCreate: (name?: string) => Promise<IpcCanvasDocument>
  canvasRename: (id: string, name: string) => Promise<{ ok: boolean }>
  canvasTrash: (canvasId: string) => Promise<{ ok: boolean }>
  canvasRestore: (canvasId: string) => Promise<{ ok: boolean }>
  canvasListTrash: () => Promise<{ id: string; name: string; trashedAt: number }[]>

  // Asset Library
  assetsList: (options?: IpcAssetListOptions) => Promise<{ assets: IpcAsset[]; total: number }>
  assetsGet: (id: string) => Promise<IpcAsset | null>
  assetsImport: (options: IpcAssetImportOptions) => Promise<IpcAsset | { error: string }>
  assetsUpdate: (id: string, patch: Partial<IpcAsset>) => Promise<IpcAsset | null>
  assetsDelete: (id: string) => Promise<boolean>
  assetsTags: () => Promise<string[]>
  assetsBatchTags: (ids: string[], tags: string[]) => Promise<{ ok: boolean }>
  assetsCategories: () => Promise<IpcAssetCategory[]>
  assetsCategoryAdd: (category: Partial<IpcAssetCategory>) => Promise<IpcAssetCategory>
  assetsCategoryUpdate: (id: string, patch: Partial<IpcAssetCategory>) => Promise<IpcAssetCategory | null>
  assetsCategoryDelete: (id: string) => Promise<boolean>

  // App utilities
  appWsPort: () => Promise<number>
  appCheckUpdate: () => Promise<{ hasUpdate: boolean; latestVersion?: string; releaseUrl?: string }>

  // Event listeners
  onTaskEvent: (callback: (channel: string, data: IpcTaskStatus) => void) => () => void
}

// ── IPC Types ────────────────────────────────────────────────────────────────

export interface IpcGenerateParams {
  prompt: string
  negativePrompt?: string
  model: string
  width: number
  height: number
  batchSize: number
  referenceImages?: string[] // base64 data URLs
  sourceImage?: string // base64 for img2img
  mask?: string // base64 for inpaint
  resolutionPreset?: string
  sizeTier?: string
  providerId?: string
  provider?: string
  returnMode?: 'base64' | 'localUrl' | 'cloudUrl'
  noCache?: boolean
}

export interface IpcGenerateResponse {
  taskId: string
  cached?: boolean
  result?: IpcTaskResult
  error?: string
}

export interface IpcTaskStatus {
  taskId: string
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  progress?: number
  error?: string
  params?: IpcGenerateParams
  result?: IpcTaskResult
  createdAt?: number
  startedAt?: number
  completedAt?: number
}

export interface IpcTaskResult {
  taskId: string
  status: string
  images: IpcGeneratedImage[]
  error?: string
  progress?: number
  metadata: {
    model: string
    provider: string
    duration?: number
    httpStatus?: number
  }
}

export interface IpcGeneratedImage {
  id: string
  format: 'base64' | 'localPath' | 'cloudUrl'
  data: string
  width?: number
  height?: number
}

export interface IpcProviderConfig {
  id: string
  name: string
  protocol: 'openai' | 'apimart' | 'gemini' | 'modelscope' | 'volcengine' | 'runninghub' | 'custom'
  baseUrl: string
  apiKeys: string[]
  enabled: boolean
  primary: boolean
  imageModels: string[]
  chatModels: string[]
  rateLimitRpm?: number
  customEndpoints?: { textToImage?: string; imageToImage?: string; inpaint?: string }
  image_generation_endpoint?: string
  image_edit_endpoint?: string
  videoModels?: string[]
  msLoras?: unknown[]
  rhApps?: unknown[]
  rhWorkflows?: unknown[]
  walletApiKey?: string
}

export interface IpcCanvasListItem {
  id: string
  name: string
  createdAt: number
  updatedAt: number
}

export interface IpcCanvasObject {
  id: string
  type: 'image' | 'text' | 'group'
  x: number
  y: number
  width: number
  height: number
  rotation: number
  zIndex: number
  opacity: number
  locked: boolean
  data: Record<string, unknown>
}

export interface IpcCanvasDocument {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  viewport: { x: number; y: number; zoom: number }
  objects: IpcCanvasObject[]
  metadata: Record<string, unknown>
}

export interface IpcAssetCategory {
  id: string
  name: string
  type: 'image' | 'workflow' | string
}

export interface IpcAsset {
  id: string
  fileName: string
  prompt?: string
  model?: string
  tags: string[]
  createdAt: number
  width?: number
  height?: number
  favorite: boolean
  category?: string
  filePath?: string
  thumbnailPath?: string
}

export interface IpcAssetListOptions {
  offset?: number
  limit?: number
  search?: string
  tags?: string[]
  sort?: 'date' | 'name'
}

export interface IpcAssetImportOptions {
  data: string // base64 data URL or raw base64
  prompt?: string
  model?: string
  tags?: string[]
  width?: number
  height?: number
}

export interface IpcServiceStatus {
  providers: { id: string; name: string; protocol: string; enabled: boolean; primary: boolean }[]
  queue: { queued: number; running: number; completed: number }
  cache: { size: number; maxSize: number }
  health: {
    providerId: string
    status: string
    consecutiveFailures: number
    lastCheck: number
    message?: string
  }[]
  circuitBreaker: { providerId: string; state: string; failureCount: number }[]
  rateLimiter: { providerId: string; rpm: number; availableTokens: number; queueLength: number }[]
  wsPort: number
  wsClients: number
}

// ── Runtime detection ───────────────────────────────────────────────────────

/** Check if running in Electron with IPC available */
export function isElectron(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!(window as unknown as { electronAPI?: ElectronAPI }).electronAPI
  )
}

/** Get the electron API, or null if not available */
export function getElectronAPI(): ElectronAPI | null {
  if (!isElectron()) return null
  return (window as unknown as { electronAPI: ElectronAPI }).electronAPI
}
