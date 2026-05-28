// ─────────────────────────────────────────────────────────────────────────────
//  CanvasSaver.ts — Auto-save canvas state (every 30s + on close)
//
//  Uses IPC to persist to file, with IndexedDB as fallback in web mode
// ─────────────────────────────────────────────────────────────────────────────

import { getElectronAPI } from '../../../api/ipcBridge'
import type { ObjectManager } from '../layers/ObjectManager'
import type { CanvasEngine } from '../CanvasEngine'
import { idbGet, idbSet } from '../../../utils/idb'
import type { StoreName } from '../../../utils/idb'

const IDB_STORE: StoreName = 'canvas'

const AUTOSAVE_INTERVAL = 30_000 // 30 seconds

export class CanvasSaver {
  private objectManager: ObjectManager
  private engine: CanvasEngine
  private canvasId: string
  private timer: ReturnType<typeof setInterval> | null = null
  private saving = false

  constructor(objectManager: ObjectManager, engine: CanvasEngine, canvasId: string) {
    this.objectManager = objectManager
    this.engine = engine
    this.canvasId = canvasId
  }

  /** Start auto-save timer */
  start() {
    this.timer = setInterval(() => {
      this.save().catch(err => console.warn('[CanvasSaver] Auto-save error:', err))
    }, AUTOSAVE_INTERVAL)
  }

  /** Save current canvas state */
  async save(): Promise<void> {
    if (this.saving) return
    this.saving = true

    try {
      const viewport = this.engine.getViewport()
      const objects = this.objectManager.serialize()

      const canvasData = {
        id: this.canvasId,
        name: '', // Will be filled by service
        createdAt: Date.now(),
        updatedAt: Date.now(),
        viewport,
        objects: objects.map(o => {
          // Map ImageObjectData to IpcCanvasObject format
          const { id, type, x, y, width, height, rotation, zIndex, opacity, locked, ...rest } = o
          return {
            id,
            type,
            x,
            y,
            width,
            height,
            rotation,
            zIndex,
            opacity,
            locked,
            data: {
              ...rest,
              // Don't persist full base64 data URLs > 1MB
              imageUrl: rest.imageUrl && rest.imageUrl.length > 1_000_000 ? '' : rest.imageUrl,
            },
          }
        }),
        metadata: {},
      }

      const api = getElectronAPI()
      if (api) {
        await api.canvasSave(canvasData)
      } else {
        // Fallback: IndexedDB
        await idbSet(IDB_STORE, this.canvasId, canvasData)
      }
    } finally {
      this.saving = false
    }
  }

  /** Load canvas state */
  async load(): Promise<{
    viewport: { x: number; y: number; zoom: number }
    objects: Array<Record<string, unknown>>
  } | null> {
    const api = getElectronAPI()

    if (api) {
      const data = await api.canvasLoad(this.canvasId)
      if (data)
        return {
          viewport: data.viewport,
          objects: data.objects as unknown as Array<Record<string, unknown>>,
        }
    }

    // Fallback: IndexedDB
    const idbData = (await idbGet(IDB_STORE, this.canvasId)) as
      | {
          viewport: { x: number; y: number; zoom: number }
          objects: Array<Record<string, unknown>>
        }
      | undefined
    return idbData || null
  }

  /** Update the canvas ID */
  setCanvasId(id: string) {
    this.canvasId = id
  }

  /** Stop auto-save and do a final save */
  async dispose() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    // Final save
    await this.save().catch(() => {})
  }
}
