// ─────────────────────────────────────────────────────────────────────────────
//  CanvasGenerationBridge.ts — Connects canvas to API generation
//
//  Submits tasks via IPC, creates placeholders, handles progress
// ─────────────────────────────────────────────────────────────────────────────

import { getElectronAPI, type IpcGenerateParams, type IpcTaskStatus } from '../../../api/ipcBridge'
import { generateImages, type GenerateParams, type GenerateResult } from '../../../api/imageClient'
import { useGenerationStore } from '../../../store/generationStore'
import type { ObjectManager } from '../layers/ObjectManager'
import type { Viewport } from '../CanvasEngine'

export interface GenerationRequest {
  prompt: string
  negativePrompt: string
  referenceImageIds: string[]
}

export class CanvasGenerationBridge {
  private objectManager: ObjectManager
  private getViewport: () => Viewport
  private onUpdate?: () => void
  private cleanupTaskListener?: () => void

  constructor(objectManager: ObjectManager, getViewport: () => Viewport, onUpdate?: () => void) {
    this.objectManager = objectManager
    this.getViewport = getViewport
    this.onUpdate = onUpdate
    this.setupTaskListener()
  }

  private setupTaskListener() {
    const api = getElectronAPI()
    if (!api) return

    this.cleanupTaskListener = api.onTaskEvent((channel, data: IpcTaskStatus) => {
      switch (channel) {
        case 'task:progress':
          this.handleProgress(data)
          break
        case 'task:completed':
          this.handleCompleted(data)
          break
        case 'task:failed':
          this.handleFailed(data)
          break
        case 'task:cancelled':
          this.handleCancelled(data)
          break
      }
    })
  }

  /**
   * Submit a generation request from the canvas prompt bar
   */
  async submit(request: GenerationRequest): Promise<string | null> {
    const store = useGenerationStore.getState()
    const viewport = this.getViewport()

    // Create placeholder object on canvas
    const placeholderId = `gen_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const placeholderX = viewport.x + 200 + Math.random() * 200
    const placeholderY = viewport.y + 100 + Math.random() * 200

    this.objectManager.add({
      id: placeholderId,
      type: 'image',
      x: placeholderX,
      y: placeholderY,
      width: store.width || 512,
      height: store.height || 512,
      rotation: 0,
      zIndex: 0,
      opacity: 1,
      locked: false,
      imageUrl: '',
      status: 'generating',
      progress: 0,
      prompt: request.prompt,
      model: store.model,
    })

    // Collect reference image data
    const referenceImages: string[] = []
    for (const refId of request.referenceImageIds) {
      const obj = this.objectManager.get(refId)
      if (obj?.data.imageUrl) {
        referenceImages.push(obj.data.imageUrl)
      }
    }

    // Try IPC first, fall back to direct HTTP
    const api = getElectronAPI()
    if (api) {
      try {
        const params: IpcGenerateParams = {
          prompt: request.prompt,
          negativePrompt: request.negativePrompt || undefined,
          model: store.model,
          width: store.width,
          height: store.height,
          batchSize: 1,
          referenceImages,
          resolutionPreset: store.resolutionPreset,
          sizeTier: store.sizeTier,
          returnMode: 'base64',
        }

        const response = await api.apiGenerate(params)

        if (response.error) {
          this.objectManager.update(placeholderId, {
            status: 'error',
            error: response.error,
          })
          this.onUpdate?.()
          return null
        }

        // Link task ID to placeholder
        this.objectManager.update(placeholderId, {
          taskId: response.taskId,
        })

        if (response.cached && response.result) {
          this.handleCompletedForPlaceholder(placeholderId, response.result)
        }

        return response.taskId
      } catch (err) {
        this.objectManager.update(placeholderId, {
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
        })
        this.onUpdate?.()
        return null
      }
    }

    // Fallback: direct HTTP generation
    try {
      const directParams: GenerateParams = {
        prompt: request.prompt,
        negativePrompt: request.negativePrompt || undefined,
        model: store.model,
        width: store.width,
        height: store.height,
        batchSize: 1,
        referenceImages: [],
        resolutionPreset: store.resolutionPreset,
        sizeTier: store.sizeTier,
      }

      const result: GenerateResult = await generateImages(directParams)

      if (result.error || result.images.length === 0) {
        this.objectManager.update(placeholderId, {
          status: 'error',
          error: result.error || 'No images generated',
        })
      } else {
        this.objectManager.update(placeholderId, {
          status: 'idle',
          imageUrl: result.images[0].url,
          progress: 100,
        })
      }
    } catch (err) {
      this.objectManager.update(placeholderId, {
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      })
    }

    this.onUpdate?.()
    return null
  }

  private handleProgress(data: IpcTaskStatus) {
    const obj = this.findObjectByTaskId(data.taskId)
    if (obj) {
      this.objectManager.update(obj.data.id, {
        progress: data.progress || 0,
      })
      this.onUpdate?.()
    }
  }

  private handleCompleted(data: IpcTaskStatus) {
    const obj = this.findObjectByTaskId(data.taskId)
    if (obj && data.result) {
      this.handleCompletedForPlaceholder(obj.data.id, data.result)
    }
  }

  private handleCompletedForPlaceholder(
    placeholderId: string,
    result: { images?: Array<{ data: string; format?: string }> },
  ) {
    if (result.images && result.images.length > 0) {
      const firstImage = result.images[0]
      let imageUrl = firstImage.data
      if (firstImage.format === 'base64' && !imageUrl.startsWith('data:')) {
        imageUrl = `data:image/png;base64,${imageUrl}`
      }

      this.objectManager.update(placeholderId, {
        status: 'idle',
        imageUrl,
        progress: 100,
      })

      // Auto-import to asset library
      const api = getElectronAPI()
      if (api) {
        const obj = this.objectManager.get(placeholderId)
        api
          .assetsImport({
            data: imageUrl,
            prompt: obj?.data.prompt,
            model: obj?.data.model,
            width: obj?.data.width,
            height: obj?.data.height,
          })
          .catch(err => console.warn('[Bridge] Asset auto-import failed:', err)) // Non-critical
      }
    } else {
      this.objectManager.update(placeholderId, {
        status: 'error',
        error: 'No images in result',
      })
    }
    this.onUpdate?.()
  }

  private handleFailed(data: IpcTaskStatus) {
    const obj = this.findObjectByTaskId(data.taskId)
    if (obj) {
      this.objectManager.update(obj.data.id, {
        status: 'error',
        error: data.error || 'Generation failed',
      })
      this.onUpdate?.()
    }
  }

  private handleCancelled(data: IpcTaskStatus) {
    const obj = this.findObjectByTaskId(data.taskId)
    if (obj) {
      this.objectManager.remove(obj.data.id)
      this.onUpdate?.()
    }
  }

  private findObjectByTaskId(taskId: string) {
    return this.objectManager.getAll().find(o => o.data.taskId === taskId) || null
  }

  /**
   * Retry a failed generation
   */
  retry(objectId: string) {
    const obj = this.objectManager.get(objectId)
    if (!obj || obj.data.status !== 'error') return

    const prompt = obj.data.prompt || ''
    if (prompt) {
      this.objectManager.remove(objectId)
      this.submit({ prompt, negativePrompt: '', referenceImageIds: [] })
    }
  }

  dispose() {
    if (this.cleanupTaskListener) {
      this.cleanupTaskListener()
    }
  }
}
