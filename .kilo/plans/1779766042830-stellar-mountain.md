# Infinite-Canvas Full Feature Clone + API Layer Refactoring Plan

## Project Context

- **Current project (liang007)**: Electron + React/TypeScript SPA, Vite build, Zustand state, ReactFlow-based whiteboard canvas, localStorage-based settings. No backend server.
- **Reference project (Infinite-Canvas)**: Python FastAPI backend + vanilla JS/HTML frontend. Features: infinite smart canvas, API provider management, asset library, canvas state persistence, WebSocket real-time updates, ComfyUI integration.
- **Target**: Port all Infinite-Canvas features to the liang007 Electron app using TypeScript/Node.js, with a new raw canvas implementation, removing all ComfyUI logic.

---

## Architecture Decisions

| Decision | Choice |
|----------|--------|
| Backend | TypeScript/Node.js embedded in Electron main process via IPC |
| Canvas | New raw HTML Canvas/PixiJS implementation (replacing ReactFlow) |
| ComfyUI | Completely removed |
| State | Zustand (renderer) + Electron main process services |

## Architecture Overview

```
Electron Main Process (Node.js)
  +-- ApiServiceManager (IPC handlers)
  |   +-- AbstractApiAdapter (base class)
  |   |   +-- OpenAIAdapter
  |   |   +-- ModelScopeAdapter
  |   |   +-- CustomHttpAdapter
  |   +-- AdapterFactory
  |   +-- KeyRotator (multi-key round-robin)
  |   +-- RateLimiter (flow control)
  |   +-- CircuitBreaker (auto-failover)
  |   +-- TaskQueue (async job queue)
  |   +-- ResultCache
  |   +-- ImageCleaner (auto file cleanup)
  +-- CanvasStateService (persistence)
  +-- AssetLibraryService
  +-- WebSocketServer (local, for progress push)

Renderer Process (React/TypeScript)
  +-- InfiniteCanvas (new raw canvas)
  |   +-- CanvasEngine (zoom/pan/render)
  |   +-- ImageLayer (drag/scale/rotate/z-order)
  |   +-- SelectionManager (multi-select/batch ops)
  |   +-- PromptBar (@ image reference)
  |   +-- ProgressOverlay (real-time generation progress)
  +-- AssetPanel (library browser)
  +-- SettingsPanel (API provider config)
  +-- ApiClient (IPC bridge to main process)
```

---

## Phase 1: API Layer Standardization (Backend)

### 1.1 Abstract Base Class + Adapter Pattern

**Files to create:**
- `electron/services/api/AbstractApiAdapter.ts`
- `electron/services/api/OpenAIAdapter.ts`
- `electron/services/api/ModelScopeAdapter.ts`
- `electron/services/api/CustomHttpAdapter.ts`
- `electron/services/api/GeminiAdapter.ts`
- `electron/services/api/AdapterFactory.ts`
- `electron/services/api/types.ts`

**AbstractApiAdapter interface:**
```typescript
abstract class AbstractApiAdapter {
  abstract readonly protocol: 'openai' | 'modelscope' | 'gemini' | 'custom'
  
  // Core generation methods
  abstract textToImage(params: TextToImageParams): Promise<GenerationResult>
  abstract imageToImage(params: ImageToImageParams): Promise<GenerationResult>
  abstract inpaint(params: InpaintParams): Promise<GenerationResult>
  
  // Capability query
  abstract testConnection(): Promise<TestResult>
  abstract getModels(): Promise<ModelInfo[]>
  abstract supportsInpaint(): boolean
  
  // Lifecycle
  abstract dispose(): void
}
```

**Unified request/response types (types.ts):**
```typescript
// Unified generation params (internal canonical form)
interface TextToImageParams {
  prompt: string
  negativePrompt?: string
  model: string
  width: number
  height: number
  batchSize: number
  referenceImages?: Buffer[] // for img2img within text-to-image flow
}

interface ImageToImageParams extends TextToImageParams {
  sourceImage: Buffer
  strength?: number
}

interface InpaintParams extends ImageToImageParams {
  mask: Buffer
}

// Unified result
interface GenerationResult {
  taskId: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  images: GeneratedImageResult[]
  error?: string
  progress?: number // 0-100
  metadata: {
    model: string
    provider: string
    duration?: number
    httpStatus?: number
  }
}

interface GeneratedImageResult {
  id: string
  format: 'base64' | 'localUrl' | 'cloudUrl'
  data: string // base64 string, local file:// URL, or cloud URL
  width?: number
  height?: number
}

// Unified error codes
enum ApiErrorCode {
  AUTH_FAILED = 'AUTH_FAILED',
  RATE_LIMITED = 'RATE_LIMITED',
  MODEL_NOT_FOUND = 'MODEL_NOT_FOUND',
  INVALID_PARAMS = 'INVALID_PARAMS',
  TIMEOUT = 'TIMEOUT',
  NETWORK_ERROR = 'NETWORK_ERROR',
  PROVIDER_ERROR = 'PROVIDER_ERROR',
  CONTENT_FILTERED = 'CONTENT_FILTERED',
}
```

**AdapterFactory:**
```typescript
class AdapterFactory {
  static create(provider: ProviderConfig): AbstractApiAdapter {
    switch (provider.protocol) {
      case 'openai': return new OpenAIAdapter(provider)
      case 'modelscope': return new ModelScopeAdapter(provider)
      case 'gemini': return new GeminiAdapter(provider)
      case 'custom': return new CustomHttpAdapter(provider)
      default: throw new Error(`Unknown protocol: ${provider.protocol}`)
    }
  }
}
```

### 1.2 Multi-Key Rotation, Rate Limiting, Auto-Failover

**Files to create:**
- `electron/services/api/KeyRotator.ts`
- `electron/services/api/RateLimiter.ts`
- `electron/services/api/CircuitBreaker.ts`

**KeyRotator**: Round-robin across multiple API keys per provider. Tracks per-key rate limit state, auto-skips exhausted keys.

**RateLimiter**: Token bucket algorithm. Per-provider configurable RPM/TPM limits. Queue overflow backpressure.

**CircuitBreaker**: Per-provider circuit breaker (closed/open/half-open). Auto-failover to next enabled provider on consecutive failures (threshold: 3). Recovery probe after configurable cooldown (default 60s).

### 1.3 Async Task Queue + Status Push

**Files to create:**
- `electron/services/api/TaskQueue.ts`
- `electron/services/api/TaskStore.ts`
- `electron/services/ws/WebSocketServer.ts`

**TaskQueue**: In-memory priority queue with configurable concurrency (default: 3). Tasks persist to disk for crash recovery. States: queued -> running -> completed/failed.

**Status Push**: Embedded WebSocket server on localhost (auto-port). Pushes task progress, completion, failure events. Renderer connects on app start.

**IPC Handlers (registered in main process):**
- `api:generate` - Submit generation task
- `api:cancel` - Cancel running task
- `api:status` - Query task status
- `api:providers` - CRUD providers
- `api:test` - Test provider connection
- `api:models` - List available models

### 1.4 Result Cache + Image Cleanup

**Files to create:**
- `electron/services/api/ResultCache.ts`
- `electron/services/api/ImageCleaner.ts`

**ResultCache**: LRU cache keyed by hash(prompt + model + params). Configurable max size (default 100 entries). Bypass on explicit "no-cache" flag.

**ImageCleaner**: Periodic cleanup of generated images older than N days (configurable, default 30). Respects asset library favorites. Runs on app start + hourly interval.

### 1.5 Provider Configuration Persistence

**Files to create:**
- `electron/services/config/ProviderConfigStore.ts`

Migrate from current localStorage-based `settings.ts` to file-based JSON config in Electron userData. Schema:

```typescript
interface ProviderConfig {
  id: string
  name: string
  protocol: 'openai' | 'modelscope' | 'gemini' | 'custom'
  baseUrl: string
  apiKeys: string[] // multiple keys for rotation
  enabled: boolean
  primary: boolean
  imageModels: string[]
  chatModels: string[]
  rateLimitRpm?: number
  customEndpoints?: {
    textToImage?: string
    imageToImage?: string
    inpaint?: string
  }
}
```

---

## Phase 2: Infinite Canvas (New Raw Canvas)

### 2.1 Canvas Engine Core

**Files to create:**
- `client/src/components/SmartCanvas/CanvasEngine.ts` - Core render loop, zoom/pan, coordinate transforms
- `client/src/components/SmartCanvas/CanvasRenderer.ts` - PixiJS or raw Canvas2D rendering
- `client/src/components/SmartCanvas/CanvasState.ts` - Zustand store for canvas state
- `client/src/components/SmartCanvas/SmartCanvas.tsx` - React wrapper component
- `client/src/components/SmartCanvas/index.ts` - Module entry

**Core capabilities:**
- Infinite zoom (0.1x - 10x) with smooth animation
- Infinite pan with momentum/inertia
- Grid background (toggleable, density adapts to zoom level)
- No node-based UI clutter - pure visual canvas experience
- Keyboard shortcuts: Space+drag=pan, Ctrl+scroll=zoom, Ctrl+Z/Y=undo/redo

### 2.2 Image Layer (Objects on Canvas)

**Files to create:**
- `client/src/components/SmartCanvas/layers/ImageObject.ts`
- `client/src/components/SmartCanvas/layers/ObjectManager.ts`
- `client/src/components/SmartCanvas/layers/TransformHandles.ts`

**Per-image object properties:**
- Position (x, y) in canvas space
- Size (width, height) with aspect-ratio lock
- Rotation (degrees)
- Z-order (layer index)
- Opacity
- Lock state (prevent accidental moves)

**Operations:**
- Drag to move (with snap-to-grid option)
- Corner handles to resize (maintain aspect ratio by default, hold Shift to free-resize)
- Rotation handle above the object
- Double-click to open detail/edit view
- Delete key to remove
- Ctrl+D to duplicate

### 2.3 Selection & Batch Operations

**Files to create:**
- `client/src/components/SmartCanvas/selection/SelectionManager.ts`
- `client/src/components/SmartCanvas/selection/SelectionRect.ts`

**Features:**
- Click to select single image
- Shift+click for multi-select
- Rubber-band (drag rectangle) for area selection
- Ctrl+A to select all
- Batch move (drag any selected item moves all)
- Batch delete (Delete key removes all selected)
- Batch resize (proportional)
- Selection outline/highlight rendering

### 2.4 @ Image Reference (Core Interaction)

**Files to create:**
- `client/src/components/SmartCanvas/prompt/ImageReference.ts`
- `client/src/components/SmartCanvas/prompt/CanvasPromptBar.tsx`

**Behavior (matching Infinite-Canvas):**
- Typing `@` in prompt input opens a picker showing canvas images
- Selected images become reference images for img2img/inpaint operations
- Visual indicator on referenced images (highlight border)
- Multiple `@` references supported in a single prompt
- Referenced image data extracted from canvas (not re-fetched)

### 2.5 Canvas Persistence

**Files to create:**
- `electron/services/canvas/CanvasStateService.ts`
- `client/src/components/SmartCanvas/persistence/CanvasSaver.ts`

**Schema (saved to file via IPC):**
```typescript
interface CanvasDocument {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  viewport: { x: number, y: number, zoom: number }
  objects: CanvasObject[]
  metadata: Record<string, unknown>
}

interface CanvasObject {
  id: string
  type: 'image' | 'text' | 'group'
  x: number, y: number
  width: number, height: number
  rotation: number
  zIndex: number
  opacity: number
  locked: boolean
  data: ImageObjectData | TextObjectData
}
```

Auto-save every 30 seconds + on close. Multiple canvases support (list, create, rename, delete, trash with 30-day retention).

---

## Phase 3: Asset Library

### 3.1 Asset Library Service

**Files to create:**
- `electron/services/assets/AssetLibraryService.ts`
- `electron/services/assets/ThumbnailGenerator.ts`

**Features:**
- Auto-import: every generation result automatically added to library
- Categories: auto-categorize by model, date, prompt keywords
- Tags: user-defined tags, batch tag operations
- Search: full-text search on prompt, tags, model name
- Thumbnails: auto-generate 200px thumbnails for fast browsing
- Storage: images in `userData/assets/`, metadata in `userData/asset_library.json`

### 3.2 Asset Library UI

**Files to create:**
- `client/src/components/AssetLibrary/AssetLibrary.tsx`
- `client/src/components/AssetLibrary/AssetGrid.tsx`
- `client/src/components/AssetLibrary/AssetSearch.tsx`
- `client/src/components/AssetLibrary/AssetDetail.tsx`

**Features:**
- Grid view with thumbnails
- Search bar (real-time filter)
- Tag filter chips
- Drag from library to canvas (DnD)
- Right-click context menu: copy, delete, add to canvas, edit tags
- Sort: by date, name, model

---

## Phase 4: Canvas-API Seamless Integration

### 4.1 Generation Operations in Canvas

**Files to modify/create:**
- `client/src/components/SmartCanvas/generation/CanvasGenerationBridge.ts`

**All canvas generation operations** (text-to-image, image-to-image via `@` reference, inpaint) route through the unified API layer:

1. User enters prompt in canvas PromptBar
2. `CanvasGenerationBridge` reads current canvas context (selected images, viewport position)
3. Submits task via IPC `api:generate`
4. Receives taskId, creates placeholder object on canvas at target position
5. Connects to WebSocket for real-time progress updates
6. On completion: replaces placeholder with actual image, auto-positioned

### 4.2 Real-time Progress Sync

**Canvas progress rendering:**
- Placeholder shows animated progress ring (0-100%)
- Progress percentage text overlay
- "Generating..." label
- On failure: red error badge with message, click to retry

### 4.3 Bidirectional State Binding

- **Task failure** -> Canvas marks object with error state, provides retry button
- **Retry** -> Re-submits same params, replaces error placeholder
- **Cancel** -> Removes placeholder from canvas
- **API provider switch** -> In-flight tasks continue on original provider, new tasks use new provider

### 4.4 Asset Library Auto-Sync

- Generation completes -> Image auto-added to Asset Library (no manual import)
- Drag from library to canvas -> Creates new canvas object
- Delete from canvas -> Image remains in library (library is permanent storage)
- Delete from library -> Removes file, canvas objects referencing it show broken image indicator

---

## Phase 5: Auxiliary Features

### 5.1 API Health Check

**Files to create:**
- `electron/services/api/HealthChecker.ts`

- On app start: test all enabled providers (parallel, 10s timeout each)
- Status indicator in settings UI (green/yellow/red)
- Auto-disable providers that fail 5 consecutive checks
- Manual re-check button

### 5.2 Version Update Check

**Files to create:**
- `electron/services/update/UpdateChecker.ts`

- Check GitHub releases on app start (once per day)
- Notification in UI when new version available
- Link to release page / download

### 5.3 Cross-platform Launch Scripts

**Files to create/modify:**
- `start.bat` (Windows) - already exists, verify/update
- `start.sh` (Linux) - new
- `start.command` (macOS) - new

---

## Phase 6: Migration & Backward Compatibility

### 6.1 Existing Frontend Interface Compatibility

- Keep existing `client/src/api/` module interfaces (`generateImages`, `inpaintImage`, `testApiGenerate`)
- New implementation internally routes through IPC to main process API service
- Fallback: if IPC not available (web mode), use direct HTTP as before
- `settings.ts` config migrated from localStorage to file-based config on first run

### 6.2 Existing Components Preserved

- `ControlPanel`, `ResultPanel`, `SettingsDialog` continue to work
- `InfiniteCanvas/index.tsx` updated to import SmartCanvas instead of Whiteboard
- Old `Whiteboard/` directory preserved but deprecated (can be removed later)

---

## File Inventory Summary

### New Files (~45 files)

**Electron main process (18 files):**
```
electron/services/api/types.ts
electron/services/api/AbstractApiAdapter.ts
electron/services/api/OpenAIAdapter.ts
electron/services/api/ModelScopeAdapter.ts
electron/services/api/GeminiAdapter.ts
electron/services/api/CustomHttpAdapter.ts
electron/services/api/AdapterFactory.ts
electron/services/api/KeyRotator.ts
electron/services/api/RateLimiter.ts
electron/services/api/CircuitBreaker.ts
electron/services/api/TaskQueue.ts
electron/services/api/TaskStore.ts
electron/services/api/ResultCache.ts
electron/services/api/ImageCleaner.ts
electron/services/api/HealthChecker.ts
electron/services/api/ApiServiceManager.ts
electron/services/config/ProviderConfigStore.ts
electron/services/assets/AssetLibraryService.ts
electron/services/assets/ThumbnailGenerator.ts
electron/services/canvas/CanvasStateService.ts
electron/services/update/UpdateChecker.ts
electron/services/ws/WebSocketServer.ts
electron/ipcHandlers.ts
```

**Client-side SmartCanvas (20 files):**
```
client/src/components/SmartCanvas/index.ts
client/src/components/SmartCanvas/SmartCanvas.tsx
client/src/components/SmartCanvas/CanvasEngine.ts
client/src/components/SmartCanvas/CanvasRenderer.ts
client/src/components/SmartCanvas/CanvasState.ts
client/src/components/SmartCanvas/layers/ImageObject.ts
client/src/components/SmartCanvas/layers/ObjectManager.ts
client/src/components/SmartCanvas/layers/TransformHandles.ts
client/src/components/SmartCanvas/selection/SelectionManager.ts
client/src/components/SmartCanvas/selection/SelectionRect.ts
client/src/components/SmartCanvas/prompt/ImageReference.ts
client/src/components/SmartCanvas/prompt/CanvasPromptBar.tsx
client/src/components/SmartCanvas/persistence/CanvasSaver.ts
client/src/components/SmartCanvas/generation/CanvasGenerationBridge.ts
client/src/components/AssetLibrary/AssetLibrary.tsx
client/src/components/AssetLibrary/AssetGrid.tsx
client/src/components/AssetLibrary/AssetSearch.tsx
client/src/components/AssetLibrary/AssetDetail.tsx
client/src/api/ipcBridge.ts
```

### Modified Files (~8 files)
```
electron/main.ts          - Register IPC handlers, start services
electron/preload.js       - Expose IPC channels to renderer
client/src/components/InfiniteCanvas/index.tsx - Switch to SmartCanvas
client/src/api/imageClient.ts    - Route through IPC when available
client/src/api/inpaintClient.ts  - Route through IPC when available
client/src/api/settings.ts       - Add file-based config migration
client/src/store/generationStore.ts - Add canvas integration hooks
client/src/App.tsx               - Add AssetLibrary panel
```

---

## Implementation Order

1. **Phase 1.1-1.2** - API types, abstract adapter, OpenAI/Gemini/ModelScope adapters, factory
2. **Phase 1.3** - Task queue, IPC handlers registration in main.ts
3. **Phase 1.5** - Provider config persistence (file-based)
4. **Phase 1.4** - Result cache, image cleaner
5. **Phase 2.1-2.2** - Canvas engine core, image layer
6. **Phase 2.3** - Selection & batch operations
7. **Phase 4.1** - Canvas generation bridge (connect canvas to API)
8. **Phase 2.4** - @ image reference
9. **Phase 4.2-4.3** - Progress sync, bidirectional state binding
10. **Phase 2.5** - Canvas persistence
11. **Phase 3** - Asset library (service + UI)
12. **Phase 4.4** - Asset library auto-sync
13. **Phase 5** - Health check, version update, launch scripts
14. **Phase 6** - Migration, backward compatibility verification
15. **Phase 1.2 (continued)** - Key rotation, rate limiting, circuit breaker (can run in parallel)

---

## Key Constraints

- **Zero-invasion**: All existing frontend interfaces (`generateImages`, `inpaintImage`, etc.) preserved. New code added alongside, not replacing.
- **Backward compatibility**: Old settings auto-migrated. No manual steps required.
- **Fault tolerance**: Single API provider failure doesn't affect global operation. Circuit breaker auto-failover ensures >99% success rate.
- **No ComfyUI**: All ComfyUI references from the reference project are excluded. Only OpenAI-format, ModelScope, Gemini, and custom HTTP APIs supported.
- **Performance**: Canvas uses hardware-accelerated rendering (Canvas2D with offscreen buffers or PixiJS WebGL). Thumbnail generation runs in worker thread.

---

## Dependencies to Add

```json
{
  "dependencies": {
    "ws": "^8.x",        // WebSocket server in main process
    "sharp": "^0.33.x"   // Image processing, thumbnail generation
  },
  "devDependencies": {
    "@types/ws": "^8.x"
  }
}
```

No PixiJS dependency (using raw Canvas2D for zero-dependency canvas). If performance becomes an issue, PixiJS can be added later as a rendering backend.
