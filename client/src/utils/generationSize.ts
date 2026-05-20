import { getResolution, type ResolutionPresetId, type SizeTierId } from './resolutionPresets'

export type GenerationSizeRequest = {
  resolutionPreset: ResolutionPresetId
  sizeTier: SizeTierId
  referenceSize: { width: number; height: number } | null
}

export function resolveGenerationSize(request: GenerationSizeRequest): {
  width: number
  height: number
} {
  return getResolution(request.resolutionPreset, request.sizeTier, request.referenceSize)
}
