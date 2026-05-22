// ═══════════════════════════════════════════════════════════
// AI 图片编辑器 v2 — 数据汇聚层
// 将所有编辑器状态组装为标准 API Payload
// ═══════════════════════════════════════════════════════════
import type {
  MaskLayer,
  PinMarker,
  TextAddition,
  TextReplacement,
  EraseRegion,
  BackgroundEdit,
  CropConfig,
  FilterState,
  OutpaintConfig,
  ReferenceImage,
  EditorPayload,
} from '../types/editor'

interface BuildEditorPayloadParams {
  imageBase64: string
  imageSize: { w: number; h: number }
  maskLayers: MaskLayer[]
  pins: PinMarker[]
  textAdditions: TextAddition[]
  textReplacements: TextReplacement[]
  eraseRegions: EraseRegion[]
  bgEdit: BackgroundEdit | null
  crop: CropConfig | null
  filter: FilterState
  outpaint: OutpaintConfig | null
  references: ReferenceImage[]
  advancedParams: {
    strength: number
    guidance_scale: number
    steps: number
    seed: number
    batchSize: number
    outputWidth: number
    outputHeight: number
  }
}

/**
 * 生成黑白蒙版 PNG Base64
 * 白色=编辑区（需重绘），黑色=保留区
 */
function buildMaskBase64(layers: MaskLayer[], w: number, h: number): string {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!

  // 填充黑色背景（保留区）
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, w, h)

  // 绘制所有蒙版路径（白色=编辑区）
  ctx.strokeStyle = '#FFFFFF'
  ctx.fillStyle = '#FFFFFF'
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  layers.forEach(layer => {
    if (!layer.visible) return
    layer.paths.forEach(path => {
      if (path.points.length < 2) return
      ctx.globalAlpha = layer.opacity / 100
      ctx.lineWidth = path.brushSize

      if (path.isErase) {
        // 橡皮擦模式：把该区域恢复为黑色
        ctx.strokeStyle = '#000000'
        ctx.globalCompositeOperation = 'destination-out'
      } else {
        ctx.strokeStyle = '#FFFFFF'
        ctx.globalCompositeOperation = 'source-over'
      }

      ctx.beginPath()
      const [first, ...rest] = path.points
      ctx.moveTo(first.x, first.y)
      rest.forEach(pt => ctx.lineTo(pt.x, pt.y))
      ctx.stroke()
    })
  })

  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  return canvas.toDataURL('image/png').split(',')[1] // 返回纯 base64
}

/**
 * 生成擦除区域蒙版
 */
function buildEraseMaskBase64(regions: EraseRegion[], w: number, h: number): string {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, w, h)

  regions.forEach(region => {
    if (!region.visible) return
    ctx.fillStyle = '#FFFFFF'
    region.maskPaths.forEach(path => {
      if (path.length < 2) return
      ctx.beginPath()
      ctx.moveTo(path[0].x, path[0].y)
      path.forEach(pt => ctx.lineTo(pt.x, pt.y))
      ctx.closePath()
      ctx.fill()
    })
  })

  return canvas.toDataURL('image/png').split(',')[1]
}

/**
 * 拼装综合提示词（compositePrompt）
 */
function buildCompositePrompt(params: BuildEditorPayloadParams): string {
  const parts: string[] = []

  // 蒙版提示词
  params.maskLayers.forEach(l => {
    if (l.prompt) parts.push(`[蒙版] ${l.prompt}`)
    if (l.negativePrompt) parts.push(`[蒙版反向] ${l.negativePrompt}`)
  })

  // 标记点批注
  if (params.pins.length) {
    parts.push(
      `[标记指令] ${params.pins
        .map((p, i) => `#${i + 1}: ${p.note}`)
        .filter(Boolean)
        .join('；')}`,
    )
  }

  // 文字指令
  if (params.textAdditions.length) {
    parts.push(`[新增文字] ${params.textAdditions.map(t => `"${t.content}"`).join('，')}`)
  }
  if (params.textReplacements.length) {
    params.textReplacements.forEach(r => {
      parts.push(`[替换文字] "${r.originalTextHint || ''}" → "${r.newText}"`)
    })
  }

  // 擦除
  if (params.eraseRegions.length) {
    parts.push(`[擦除] 移除 ${params.eraseRegions.length} 个区域`)
  }

  // 背景
  if (params.bgEdit) {
    const bgMap = { remove: '移除背景', replace: '替换背景', blur: '背景模糊', solid: '纯色背景' }
    parts.push(`[背景] ${bgMap[params.bgEdit.action]}`)
    if (params.bgEdit.replacePrompt) parts.push(`描述: ${params.bgEdit.replacePrompt}`)
  }

  // 滤镜
  if (params.filter.preset !== 'original') {
    parts.push(`[滤镜] ${params.filter.preset} (${params.filter.presetStrength}%)`)
  }

  // 扩图
  if (params.outpaint) {
    parts.push(`[扩图] ${params.outpaint.directions.join(',')} 方向，${params.outpaint.scale}x`)
    if (params.outpaint.prompt) parts.push(`扩图描述: ${params.outpaint.prompt}`)
  }

  return parts.join('；')
}

/**
 * 拼装最终 API Payload
 */
export function buildEditorPayload(params: BuildEditorPayloadParams): EditorPayload {
  const {
    imageBase64,
    imageSize,
    maskLayers,
    pins,
    textAdditions,
    textReplacements,
    eraseRegions,
    bgEdit,
    crop,
    filter,
    outpaint,
    references,
    advancedParams,
  } = params

  // 检查是否有蒙版编辑
  const hasMask = maskLayers.some(l => l.paths.length > 0)
  const hasErase = eraseRegions.length > 0

  // 合并蒙版
  const maskBase64 = hasMask ? buildMaskBase64(maskLayers, imageSize.w, imageSize.h) : undefined
  const eraseMaskBase64 = hasErase
    ? buildEraseMaskBase64(eraseRegions, imageSize.w, imageSize.h)
    : undefined

  // 合并所有蒙版为 inpaint_mask
  const inpaintMask = maskBase64 || eraseMaskBase64

  // 合并蒙版描述
  const inpaintPrompt = maskLayers
    .filter(l => l.prompt)
    .map(l => l.prompt)
    .join('；')

  // 文字描述
  const _textInstructions = [
    ...textAdditions.map(
      t => `新增文字 "${t.content}" 于坐标(${t.xPercent.toFixed(1)}%, ${t.yPercent.toFixed(1)}%)`,
    ),
    ...textReplacements.map(r => `替换区域文字 "${r.originalTextHint}" → "${r.newText}"`),
  ].join('；')

  // 拼装综合提示词
  const composite = buildCompositePrompt(params)

  // 合并负向提示词
  const negativePrompt = maskLayers
    .filter(l => l.negativePrompt)
    .map(l => l.negativePrompt)
    .join('；')

  return {
    mode: 'img2img_inpaint',
    original_image: imageBase64,
    mask_image: inpaintMask,
    prompt: composite || inpaintPrompt || '',
    negative_prompt: negativePrompt,
    reference_images: references,
    parameters: {
      strength: advancedParams.strength,
      guidance_scale: advancedParams.guidance_scale,
      steps: advancedParams.steps,
      seed: advancedParams.seed,
      output_size: {
        width: advancedParams.outputWidth || imageSize.w,
        height: advancedParams.outputHeight || imageSize.h,
      },
    },
    edit_instructions: {
      inpaint_mask: inpaintMask,
      inpaint_prompt: inpaintPrompt,
      markers: pins.map((p, i) => ({
        id: i + 1,
        style: p.style,
        position: {
          x: p.x,
          y: p.y,
          xPercent: p.xPercent,
          yPercent: p.yPercent,
        },
        color: p.color,
        note: p.note,
      })),
      text_additions: textAdditions,
      text_replacements: textReplacements,
      object_removal_mask: eraseMaskBase64,
      background: bgEdit ?? undefined,
      crop: crop ?? undefined,
      filters: filter,
      outpaint: outpaint ?? undefined,
    },
    compositePrompt: composite,
  }
}
