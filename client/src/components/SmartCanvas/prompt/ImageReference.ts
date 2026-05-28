// ─────────────────────────────────────────────────────────────────────────────
//  ImageReference.ts — @ image reference system for prompt input
//
//  Manages the mapping of @ references to canvas image objects.
//  Used by CanvasPromptBar to resolve references before generation.
// ─────────────────────────────────────────────────────────────────────────────

import type { ImageObjectData } from '../layers/ImageObject'

export interface ImageReference {
  id: string
  objectId: string // canvas object ID
  imageUrl: string
  prompt?: string
}

/**
 * Resolve @ references from prompt text and canvas objects
 * @param referenceIds - IDs of referenced canvas objects
 * @param objects - All canvas objects
 * @returns Resolved image references with data
 */
export function resolveImageReferences(
  referenceIds: string[],
  objects: ImageObjectData[],
): ImageReference[] {
  return referenceIds
    .map(refId => {
      const obj = objects.find(o => o.id === refId)
      if (!obj || !obj.imageUrl) return null
      return {
        id: refId,
        objectId: obj.id,
        imageUrl: obj.imageUrl,
        prompt: obj.prompt,
      }
    })
    .filter(Boolean) as ImageReference[]
}

/**
 * Extract base64 data from image references for API submission
 * @param references - Resolved image references
 * @returns Array of base64 data URL strings
 */
export function extractReferenceData(references: ImageReference[]): string[] {
  return references.filter(r => r.imageUrl).map(r => r.imageUrl)
}
