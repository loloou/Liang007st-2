import {
  getActiveImageModel,
  getApiConfig,
  resolveApiSpec,
  resolveBaseUrl,
  resolveApiKey,
  type ApiSpec,
  type ImageModel,
} from './settings'
import type { GeneratedImage } from './imageClient'
import type { GenerateResult } from './apiUtils'
import {
  toOpenAISizeString,
  safeParseJson,
  isHtmlContent,
  extractErrorMessage,
  errResult,
  extractImagesOpenAI,
  isImageInputUnsupportedError,
} from './apiUtils'

export type InpaintParams = {
  imageUrl: string
  imageDataUrl?: string
  maskDataUrl: string
  prompt: string
  model: string
  width: number
  height: number
  n?: number
  strength?: number
}

export type InpaintCapability = {
  ok: boolean
  message?: string
  endpoint: string
  spec: ApiSpec
  modelId: string
  requestedModelId?: string
  autoSelected?: boolean
}

function buildEndpoint(baseUrl: string, customEndpoint?: string): string {
  const custom = customEndpoint?.trim()
  if (custom) return custom.replace(/\/$/, '')
  const clean = baseUrl.replace(/\/$/, '')
  if (/\/images\/edits\/?$/i.test(clean)) return clean
  if (/\/v1\/?$/i.test(clean)) return `${clean.replace(/\/v1\/?$/i, '')}/v1/images/edits`
  return `${clean}/v1/images/edits`
}

async function urlToBlob(url: string, errorMessage: string): Promise<Blob> {
  if (url.startsWith('data:')) {
    const resp = await fetch(url)
    return resp.blob()
  }
  try {
    const resp = await fetch(url)
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    return await resp.blob()
  } catch (err) {
    throw new Error(`${errorMessage}\n详情：${err instanceof Error ? err.message : String(err)}`)
  }
}

function buildRequestBodyForLog(fields: Record<string, unknown>): string {
  return JSON.stringify(fields, null, 2)
}

function resolveInpaintModel(paramsModel: string): {
  model: ImageModel | null
  baseUrl: string
  apiKey: string
  spec: ApiSpec
  requestedModel: ImageModel | null
} {
  const cfg = getApiConfig()
  const active = getActiveImageModel(cfg)
  const requested =
    cfg.imageModels.find(m => m.modelId === paramsModel) ??
    cfg.imageModels.find(m => m.id === cfg.activeImageModelId) ??
    active.model

  const INPAINT_MODEL_PATTERNS =
    /gpt-image|dall-e|dalle|edit|img2img|inpaint|sd-edit|stable-diffusion.*edit/i

  const looksLikeInpaintModel = (model: ImageModel) => INPAINT_MODEL_PATTERNS.test(model.modelId)

  const isUsableInpaintModel = (model: ImageModel, requireExplicit = true) => {
    const baseUrl = resolveBaseUrl(model, cfg)
    const spec = resolveApiSpec(model, cfg)
    const hasInpaintFlag = requireExplicit
      ? model.supportsInpaint === true
      : model.supportsInpaint === true || looksLikeInpaintModel(model)
    // 模型名匹配 edit 类时，即使全局 spec 是 gemini 也视为 OpenAI 兼容（除非有自定义 inpaintEndpoint）
    const effectiveSpec =
      !requireExplicit && looksLikeInpaintModel(model) && spec === 'gemini' && !model.apiSpec
        ? 'openai'
        : spec
    return (
      hasInpaintFlag &&
      Boolean(baseUrl.trim() || model.inpaintEndpoint?.trim()) &&
      (effectiveSpec !== 'gemini' || Boolean(model.inpaintEndpoint?.trim()))
    )
  }

  // 优先级：
  // 1. 当前模型已显式勾选 supportsInpaint
  // 2. 其他模型已显式勾选 supportsInpaint
  // 3. 当前模型名匹配 edit 类模型（自动推断）
  // 4. 其他模型名匹配 edit 类模型（自动推断）
  // 5. 回退到原始请求模型（会在 capability 校验中报错）
  const matched =
    (requested && isUsableInpaintModel(requested, true) ? requested : null) ??
    cfg.imageModels.find(m => isUsableInpaintModel(m, true)) ??
    (requested && isUsableInpaintModel(requested, false) ? requested : null) ??
    cfg.imageModels.find(m => isUsableInpaintModel(m, false)) ??
    requested

  if (!matched) {
    return {
      model: null,
      baseUrl: active.baseUrl,
      apiKey: active.apiKey,
      spec: active.spec,
      requestedModel: requested,
    }
  }
  return {
    model: matched,
    baseUrl: resolveBaseUrl(matched, cfg),
    apiKey: resolveApiKey(matched, cfg),
    spec: resolveApiSpec(matched, cfg),
    requestedModel: requested,
  }
}

export function getInpaintCapability(paramsModel: string): InpaintCapability {
  const resolved = resolveInpaintModel(paramsModel)
  const modelId = resolved.model?.modelId?.trim() || paramsModel.trim() || ''
  const requestedModelId = resolved.requestedModel?.modelId?.trim() || paramsModel.trim() || ''
  const autoSelected = Boolean(requestedModelId && modelId && requestedModelId !== modelId)
  const endpoint = buildEndpoint(resolved.baseUrl, resolved.model?.inpaintEndpoint)

  if (!resolved.model || !modelId) {
    return {
      ok: false,
      message: '请先选择支持局部重绘的 Image 模型。',
      endpoint,
      spec: resolved.spec,
      modelId,
    }
  }
  if (!resolved.baseUrl.trim() && !resolved.model.inpaintEndpoint?.trim()) {
    return {
      ok: false,
      message: '请先配置局部重绘 API 地址。',
      endpoint,
      spec: resolved.spec,
      modelId,
    }
  }
  if (
    resolved.spec === 'gemini' &&
    !resolved.model.inpaintEndpoint?.trim() &&
    !resolved.model.apiSpec &&
    !/gpt-image|dall-e|dalle|edit|img2img|inpaint|sd-edit|stable-diffusion.*edit/i.test(
      resolved.model.modelId,
    )
  ) {
    return {
      ok: false,
      message:
        '当前模型使用 Gemini generateContent，不能直接做严格蒙版局部重绘。请切换到 OpenAI 兼容图片编辑模型，或在设置中为该模型填写兼容 /v1/images/edits 的 Inpaint Endpoint。',
      endpoint,
      spec: resolved.spec,
      modelId,
    }
  }
  if (
    resolved.model.supportsInpaint !== true &&
    !/gpt-image|dall-e|dalle|edit|img2img|inpaint|sd-edit|stable-diffusion.*edit/i.test(
      resolved.model.modelId,
    )
  ) {
    return {
      ok: false,
      message: '当前模型未启用局部重绘，请在设置中勾选"支持局部重绘"。',
      endpoint,
      spec: resolved.spec,
      modelId,
    }
  }

  return { ok: true, endpoint, spec: resolved.spec, modelId, requestedModelId, autoSelected }
}

export async function inpaintImage(params: InpaintParams): Promise<GenerateResult> {
  const resolved = resolveInpaintModel(params.model)
  const modelId = resolved.model?.modelId?.trim() || params.model.trim() || ''
  const endpoint = buildEndpoint(resolved.baseUrl, resolved.model?.inpaintEndpoint)
  const capability = getInpaintCapability(params.model)
  const requestBodyJson = buildRequestBodyForLog({
    model: modelId,
    prompt: params.prompt,
    size: toOpenAISizeString(params.width, params.height),
    n: params.n ?? 1,
    hasImage: Boolean(params.imageDataUrl || params.imageUrl),
    hasMask: Boolean(params.maskDataUrl),
    strength: params.strength,
  })

  if (!capability.ok) {
    return errResult(
      endpoint,
      resolved.spec,
      requestBodyJson,
      capability.message ?? '当前模型不可用。',
    )
  }

  let imageBlob: Blob
  let maskBlob: Blob
  try {
    imageBlob = await urlToBlob(
      params.imageDataUrl || params.imageUrl,
      '无法读取原图数据，可能是图片 URL 跨域。请尝试下载后重新导入或使用 base64 返回模型。',
    )
    maskBlob = await urlToBlob(params.maskDataUrl, '无法读取蒙版数据，请重新涂抹蒙版后再试。')
  } catch (err) {
    return errResult(
      endpoint,
      resolved.spec,
      requestBodyJson,
      err instanceof Error ? err.message : String(err),
    )
  }

  const form = new FormData()
  form.append('model', modelId)
  form.append('prompt', params.prompt)
  form.append('image', imageBlob, 'image.png')
  form.append('mask', maskBlob, 'mask.png')
  form.append('size', toOpenAISizeString(params.width, params.height))
  form.append('n', String(Math.max(1, params.n ?? 1)))
  if (params.strength !== undefined) form.append('strength', String(params.strength))

  const headers: HeadersInit = { Accept: 'application/json' }
  if (resolved.apiKey.trim()) headers.Authorization = `Bearer ${resolved.apiKey.trim()}`

  const TRANSIENT_STATUS = new Set([408, 429, 500, 502, 503, 504])
  const MAX_RETRIES = 2

  function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  let resp: Response | undefined
  let rawText = ''
  let lastError: unknown = null

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 600_000)
      try {
        resp = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: form,
          signal: controller.signal,
        })
        rawText = await resp.text()
      } finally {
        clearTimeout(timer)
      }
    } catch (err) {
      lastError = err
      if (attempt < MAX_RETRIES) {
        await sleep(1500 * 2 ** attempt + Math.floor(Math.random() * 500))
        continue
      }
      return errResult(
        endpoint,
        resolved.spec,
        requestBodyJson,
        err instanceof DOMException && err.name === 'AbortError'
          ? '局部重绘请求超时（600s），请稍后重试或降低生成数量。'
          : `局部重绘网络请求失败（已重试 ${MAX_RETRIES} 次）：${err instanceof Error ? err.message : String(err)}`,
      )
    }

    // 非瞬态错误或已到最大重试次数，跳出
    if (!resp || !TRANSIENT_STATUS.has(resp.status) || attempt >= MAX_RETRIES) break
    await sleep(1500 * 2 ** attempt + Math.floor(Math.random() * 500))
  }

  if (!resp) {
    return errResult(
      endpoint,
      resolved.spec,
      requestBodyJson,
      `局部重绘网络请求失败：${lastError instanceof Error ? lastError.message : String(lastError)}`,
    )
  }

  const contentType = resp.headers.get('content-type') ?? ''
  if (contentType.includes('text/html') || isHtmlContent(rawText)) {
    return errResult(
      endpoint,
      resolved.spec,
      requestBodyJson,
      'API 返回 HTML 而不是 JSON，请确认 Inpaint Endpoint 是否正确。',
      resp.status,
      rawText.slice(0, 500),
    )
  }

  const parsed = safeParseJson(rawText)
  if (!resp.ok) {
    const detail = extractErrorMessage(parsed, rawText || `HTTP ${resp.status}`)
    if (isImageInputUnsupportedError(detail)) {
      return errResult(
        endpoint,
        resolved.spec,
        requestBodyJson,
        '当前局部重绘模型不支持图片输入，无法读取 image.png。请在设置中切换到支持 /v1/images/edits 的图片编辑模型，或为该模型配置正确的 Inpaint Endpoint。',
        resp.status,
        rawText.slice(0, 500),
      )
    }
    return errResult(
      endpoint,
      resolved.spec,
      requestBodyJson,
      `局部重绘 API 请求失败（HTTP ${resp.status}）：${detail}`,
      resp.status,
      rawText.slice(0, 500),
    )
  }
  if (!parsed) {
    return errResult(
      endpoint,
      resolved.spec,
      requestBodyJson,
      `局部重绘 API 返回内容无法解析为 JSON。\n响应预览：${rawText.slice(0, 300)}`,
      resp.status,
      rawText.slice(0, 500),
    )
  }

  const images = extractImagesOpenAI(parsed)?.filter(img => img.url) ?? []
  if (images.length === 0) {
    return errResult(
      endpoint,
      resolved.spec,
      requestBodyJson,
      `局部重绘 API 返回数据结构不符合预期，期望 data[].url、data[].b64_json 或 images[]。\n实际返回：${rawText.slice(0, 300)}`,
      resp.status,
      rawText.slice(0, 500),
    )
  }

  const cleaned = JSON.stringify(
    parsed,
    (key, value) => {
      if (key === 'b64_json' && typeof value === 'string' && value.length > 100) {
        return `[base64 image, ${value.length} chars]`
      }
      return value
    },
    2,
  )

  return {
    images,
    endpoint,
    spec: resolved.spec,
    requestBodyJson,
    httpStatus: resp.status,
    responseSummary: cleaned.slice(0, 2000) + (cleaned.length > 2000 ? '\n… (已截断)' : ''),
    jsonValid: true,
  }
}
