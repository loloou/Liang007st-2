/**
 * InfiniteCanvas 接口契约
 *
 * 定义无限画布与主界面之间的参数传递规范。
 * 任何画布实现（React Flow、PixiJS、Excalidraw 等）只需：
 *   1. 实现 CanvasAdapter 接口
 *   2. 从 generationStore 读取生图参数
 *   3. 调用 generateImages() 执行生图
 *
 * 替换画布实现时，只需替换 adapters/ 下的文件，types.ts 不变。
 */

import type { ResolutionPresetId, SizeTierId } from '../../utils/resolutionPresets'

// ── 主界面传递给画布的生图参数 ──────────────────────────────────────────────

/** 画布从 generationStore 读取的参数快照 */
export interface CanvasGenerationParams {
  model: string
  resolutionPreset: ResolutionPresetId
  sizeTier: SizeTierId
  batchSize: number
  width: number
  height: number
}

// ── 画布对外暴露的能力 ──────────────────────────────────────────────────────

/** 画布适配器必须实现的接口 */
export interface CanvasAdapter {
  /** 画布是否处于生成中状态 */
  isGenerating: boolean

  /** 所有生成节点是否完成 */
  isIdle: boolean

  /** 获取画布中所有已生成的图片 URL */
  getAllImageUrls: () => string[]

  /** 清除所有已完成/出错的节点 */
  clearCompleted: () => void
}

// ── 画布组件的 Props ────────────────────────────────────────────────────────

/** InfiniteCanvas 包装组件接收的 Props */
export interface InfiniteCanvasProps {
  /** 关闭画布回调 */
  onClose: () => void

  /**
   * 生图参数（从 generationStore 自动同步，无需手动传入）
   * 画布内部通过 useGenerationStore 读取，此 prop 仅用于类型提示
   */
  generationParams?: Partial<CanvasGenerationParams>
}

// ── 画布内部使用的生图请求类型 ──────────────────────────────────────────────

/** 画布内部调用 generateImages 时的参数 */
export interface CanvasGenerateRequest {
  prompt: string
  negativePrompt?: string
  model: string
  width: number
  height: number
  batchSize: number
  referenceImages: File[]
  resolutionPreset: ResolutionPresetId
  sizeTier: SizeTierId
}
