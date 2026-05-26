// ─────────────────────────────────────────────────────────────────────────────
//  imageClient.ts — 双规范生图接口封装
//
//  OpenAI 规范：POST {baseUrl}/v1/images/generations
//    请求体：{ model, prompt, size, n }
//    响应体：{ data: [{ url }] }  /  { images: [] }  / 直接数组
//
//  Gemini 规范：POST {baseUrl}/v1beta/models/{modelId}:generateContent
//    请求体：{ contents: [{ parts: [...] }], generationConfig: { responseModalities, ... } }
//    响应体：{ candidates: [{ content: { parts: [{ inlineData: { mimeType, data } }] } }] }
//
//  请求头统一：Authorization: Bearer {apiKey}，Content-Type: application/json
// ─────────────────────────────────────────────────────────────────────────────

import { getApiConfig, getActiveImageModel, type ApiSpec } from './settings'
import { type ResolutionPresetId, type SizeTierId } from '../utils/resolutionPresets'
import {
  toOpenAISizeString,
  safeParseJson,
  isHtmlContent,
  extractErrorMessage,
  errResult,
  extractImagesOpenAI,
} from './apiUtils'

// ── 请求参数类型 ──────────────────────────────────────────
export type GenerateParams = {
  prompt: string
  negativePrompt?: string
  batchSize: number
  width: number
  height: number
  model: string
  referenceImages: File[]
  /** 当前比例预设（用于 Gemini 规范精准 aspectRatio 传参） */
  resolutionPreset?: ResolutionPresetId
  /** 当前尺寸档位（用于 Gemini 规范精准 imageSize 传参） */
  sizeTier?: SizeTierId
}

// ── 返回图片类型 ──────────────────────────────────────────
export type GeneratedImage = {
  id: string
  url: string
  /** 缩略图生成后保留的原始 URL（base64/外部 URL） */
  originalUrl?: string
}

// ── 常量 ──────────────────────────────────────────────────
/** Gemini 规范默认模型（用于 baseUrl 中没有指定模型时的接口路径） */
const GEMINI_DEFAULT_MODEL = 'gemini-2.0-flash-preview-image-generation'
const GEMINI_BATCH_CONCURRENCY = 2
const TRANSIENT_HTTP_STATUS = new Set([408, 429, 500, 502, 503, 504])
const MAX_TRANSIENT_RETRIES = 2

// ── 工具函数 ──────────────────────────────────────────────

/** 从配置中获取 baseUrl */
function getApiBaseUrl(): string {
  const cfg = getApiConfig()
  const active = getActiveImageModel(cfg)
  if (active.baseUrl?.trim()) return active.baseUrl.trim()
  return import.meta.env.VITE_API_BASE_URL ?? ''
}

/**
 * 构建 OpenAI 规范 endpoint：
 *   baseUrl → {baseUrl}/v1/images/generations
 *   已含完整路径则直接使用
 */
function buildOpenAIEndpoint(baseUrl: string): string {
  const clean = baseUrl.replace(/\/$/, '')
  if (/\/images\/generations\/?$/i.test(clean)) return clean
  if (/\/generate\/?$/i.test(clean)) return clean
  if (/\/v1\/?$/i.test(clean)) return `${clean.replace(/\/v1\/?$/, '')}/v1/images/generations`
  return `${clean}/v1/images/generations`
}

/**
 * 构建 Gemini 规范 endpoint：
 *   {baseUrl}/v1beta/models/{modelId}:generateContent
 *   若 baseUrl 已包含完整 Gemini 路径则直接使用
 */
function buildGeminiEndpoint(baseUrl: string, modelId: string): string {
  const clean = baseUrl.replace(/\/$/, '')
  if (/generateContent\/?$/i.test(clean)) return clean
  // 修复：modelId 为空时必须回退到默认模型，否则会生成 /v1beta/models/:generateContent 的错误路径
  const resolvedModelId = modelId.trim() || GEMINI_DEFAULT_MODEL
  // 移除已有的 /v1beta 前缀防止重复
  const base = clean.replace(/\/v1beta\/?$/, '')
  return `${base}/v1beta/models/${resolvedModelId}:generateContent`
}

/** 根据规范选择 endpoint 构建策略 */
function buildEndpoint(baseUrl: string, spec: ApiSpec, modelId: string): string {
  if (spec === 'gemini') return buildGeminiEndpoint(baseUrl, modelId)
  return buildOpenAIEndpoint(baseUrl)
}

/**
 * width × height → Gemini aspectRatio（精确映射）
 * 官方支持 10 种比例：1:1 / 16:9 / 9:16 / 4:3 / 3:4 / 21:9 / 3:2 / 2:3 / 5:4 / 4:5
 * presetId 存在时直接用预设 ratio；fallback 时通过宽高比像素值映射
 */
function toAspectRatio(width: number, height: number, presetId?: string): string {
  // Gemini 官方支持的 10 种纵横比
  const GEMINI_RATIOS = [
    '1:1',
    '16:9',
    '9:16',
    '4:3',
    '3:4',
    '21:9',
    '3:2',
    '2:3',
    '5:4',
    '4:5',
  ] as const

  // 精确预设直接返回
  if (presetId && presetId !== 'original') {
    if ((GEMINI_RATIOS as readonly string[]).includes(presetId)) return presetId
    // 不支持的预设走像素比 fallback
  }

  // 按像素比映射 fallback（阈值为相邻预设的几何均值）
  const ratio = width / height

  // 横向：阈值取相邻标准比例的几何均值
  // 21:9=2.333, 16:9=1.778, 3:2=1.5, 4:3=1.333, 5:4=1.25, 1:1=1.0
  if (ratio > 2.0) return '21:9' // > geomean(2.333, 1.778) ≈ 2.04
  if (ratio > 1.63) return '16:9' // > geomean(1.778, 1.5) ≈ 1.63
  if (ratio > 1.41) return '3:2' // > geomean(1.5, 1.333) ≈ 1.41
  if (ratio > 1.29) return '4:3' // > geomean(1.333, 1.25) ≈ 1.29
  if (ratio > 1.12) return '5:4' // > geomean(1.25, 1.0) ≈ 1.12
  // 正方形
  if (ratio >= 0.89) return '1:1' // geomean(1.0, 0.8) ≈ 0.89

  // 纵向（ratio < 1，返回的 aspectRatio 也是纵向）
  // 4:5=0.8, 3:4=0.75, 2:3=0.667, 9:16=0.5625
  if (ratio > 0.77) return '4:5' // > geomean(0.8, 0.75) ≈ 0.77
  if (ratio > 0.71) return '3:4' // > geomean(0.75, 0.667) ≈ 0.71
  if (ratio > 0.61) return '2:3' // > geomean(0.667, 0.5625) ≈ 0.61
  return '9:16'
}

/**
 * SizeTierId → Gemini imageSize 档位值
 * 官方规范：imageSize 必须是 "1K" | "2K" | "4K"（大写 K）
 * 不支持传像素尺寸如 "4096x4096"
 */
function toGeminiImageSize(sizeTier?: string): string | undefined {
  if (!sizeTier) return undefined
  const map: Record<string, string> = { '1K': '1K', '2K': '2K', '4K': '4K' }
  return map[sizeTier]
}

/** 从像素尺寸推导 Gemini imageSize（当 sizeTier 未传入时的 fallback） */
function toGeminiImageSizeFromPixels(width: number, height: number): string {
  const maxSide = Math.max(width, height)
  if (maxSide >= 3000) return '4K'
  if (maxSide >= 1500) return '2K'
  return '1K'
}

/** File → Base64 data URL 字符串（去掉前缀，只留 base64 数据） */
async function fileToBase64(file: File): Promise<{ mimeType: string; data: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const [header, data] = result.split(',')
      const mimeMatch = header.match(/data:([^;]+)/)
      resolve({ mimeType: mimeMatch?.[1] || file.type || 'image/png', data: data ?? '' })
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/**
 * 从 Gemini generateContent 响应中提取图片列表。
 * 响应结构：
 * {
 *   candidates: [{
 *     content: {
 *       parts: [
 *         { inlineData: { mimeType: "image/png", data: "<base64>" } },
 *         { text: "..." }
 *       ]
 *     }
 *   }]
 * }
 */
function extractImagesGemini(data: unknown): GeneratedImage[] | null {
  if (!data || typeof data !== 'object') return null
  const obj = data as Record<string, unknown>
  const candidates = obj.candidates as unknown[] | undefined
  if (!Array.isArray(candidates) || candidates.length === 0) return null

  const images: GeneratedImage[] = []
  let idx = 0

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') continue
    const content = (candidate as Record<string, unknown>).content as
      | Record<string, unknown>
      | undefined
    if (!content) continue
    const parts = content.parts as unknown[] | undefined
    if (!Array.isArray(parts)) continue

    for (const part of parts) {
      if (!part || typeof part !== 'object') continue
      const partObj = part as Record<string, unknown>

      // 优先：inlineData.base64（原生 Gemini 图生图格式）
      const inlineData = partObj.inlineData as Record<string, unknown> | undefined
      if (inlineData) {
        const mimeType = (inlineData.mimeType as string) ?? 'image/png'
        const b64data = inlineData.data as string | undefined
        // 确保 base64 数据非空且长度足够（有效图片至少几百字节）
        if (b64data && b64data.length > 100) {
          images.push({ id: String(idx++), url: `data:${mimeType};base64,${b64data}` })
          continue
        }
      }

      // 兜底：text 字段里含 markdown 图片语法 `![](url)` 或 data:image base64
      const text = partObj.text as string | undefined
      if (text) {
        const dataUrlPattern = /data:image\/(?:png|jpeg|jpg|gif|webp);base64,[A-Za-z0-9+/=\r\n]+/gi
        const mdMatches = [
          ...text.matchAll(
            /!\[.*?\]\(((?:https?:\/\/[^\s)]+\.(?:jpg|jpeg|png|gif|webp)[^\s)]*)|(?:data:image\/(?:png|jpeg|jpg|gif|webp);base64,[A-Za-z0-9+/=\r\n]+))\)/gi,
          ),
        ]

        const seen = new Set<string>()
        for (const m of mdMatches) {
          const url = m[1].replace(/[\r\n\s]+/g, '')
          if (!seen.has(url)) {
            seen.add(url)
            images.push({ id: String(idx++), url })
          }
        }

        // 直接包含 data:image URL（部分 Gemini 兼容接口会把图片放在 text 里）
        for (const m of text.matchAll(dataUrlPattern)) {
          const url = m[0].replace(/[\r\n\s]+/g, '')
          if (!seen.has(url)) {
            seen.add(url)
            images.push({ id: String(idx++), url })
          }
        }

        // 直接是图片 URL（非 markdown 语法）
        if (mdMatches.length === 0) {
          const urlMatch = text.trim().match(/^(https?:\/\/[^\s]+)$/i)
          if (urlMatch) {
            const u = urlMatch[1]
            if (/\.(?:jpg|jpeg|png|gif|webp)(?:\?|$)/i.test(u)) {
              images.push({ id: String(idx++), url: u })
            }
          }
        }
      }
    }
  }

  return images.length > 0 ? images : null
}

/** 从 Gemini 响应中提取错误信息（text parts / promptFeedback / error 字段） */
function extractGeminiErrorText(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null
  const obj = data as Record<string, unknown>

  const texts: string[] = []

  // 1. promptFeedback.blockReasonMessage
  const pf = obj.promptFeedback as Record<string, unknown> | undefined
  if (pf) {
    if (typeof pf.blockReasonMessage === 'string') texts.push(pf.blockReasonMessage)
    if (typeof pf.blockReason === 'string') texts.push(`blockReason: ${pf.blockReason}`)
  }

  // 2. error 字段（部分代理直接返回 { error: { message } }）
  const errField = obj.error as Record<string, unknown> | undefined
  if (errField && typeof errField.message === 'string') {
    texts.push(errField.message)
  }

  // 3. candidates[].content.parts[].text
  const candidates = obj.candidates as unknown[] | undefined
  if (Array.isArray(candidates)) {
    for (const candidate of candidates) {
      if (!candidate || typeof candidate !== 'object') continue
      const content = (candidate as Record<string, unknown>).content as
        | Record<string, unknown>
        | undefined
      if (!content) continue
      const parts = content.parts as unknown[] | undefined
      if (!Array.isArray(parts)) continue
      for (const part of parts) {
        if (!part || typeof part !== 'object') continue
        const text = (part as Record<string, unknown>).text as string | undefined
        if (text) texts.push(text)
      }
    }
  }

  if (texts.length === 0) return null

  const joined = texts.join('\n')
  const lower = joined.toLowerCase()
  const isError =
    lower.includes('cannot read') ||
    lower.includes('does not support') ||
    lower.includes('not support') ||
    lower.includes('inform the user') ||
    lower.includes('unable to') ||
    lower.includes("can't read") ||
    lower.includes('error') ||
    lower.includes('sorry') ||
    lower.includes('i cannot') ||
    lower.includes("i can't") ||
    lower.includes('blockreason')
  return isError ? joined : null
}

// ── 构造请求体 ────────────────────────────────────────────

/** 构造 OpenAI 规范请求体 */
async function buildOpenAIBody(
  params: GenerateParams,
  resolvedModel: string,
): Promise<Record<string, unknown>> {
  const hasRef = params.referenceImages.length > 0

  if (hasRef) {
    // 参考图存在：使用 messages 格式，支持 image_url

    // 参考图 → base64 image_url
    const imageUrls: string[] = []
    for (const file of params.referenceImages.slice(0, 4)) {
      try {
        const { mimeType, data } = await fileToBase64(file)
        imageUrls.push(`data:${mimeType};base64,${data}`)
      } catch {
        /* 跳过无法读取的文件 */
      }
    }

    // 参考图 content
    const imageContents = imageUrls.map(url => ({ type: 'image_url' as const, image_url: { url } }))
    // prompt content（支持多段）
    const promptParts: Record<string, unknown>[] = [{ type: 'text' as const, text: params.prompt }]

    const messages: Record<string, unknown>[] = [
      { role: 'user', content: [...imageContents, ...promptParts] },
    ]

    const body: Record<string, unknown> = {
      model: resolvedModel,
      messages,
      size: toOpenAISizeString(params.width, params.height),
      n: params.batchSize,
    }
    if (params.negativePrompt?.trim()) body.negative_prompt = params.negativePrompt.trim()
    return body
  }

  // 无参考图：简洁 prompt 格式
  const body: Record<string, unknown> = {
    model: resolvedModel,
    prompt: params.prompt,
    size: toOpenAISizeString(params.width, params.height),
    n: params.batchSize,
  }
  if (params.negativePrompt?.trim()) body.negative_prompt = params.negativePrompt.trim()
  return body
}

/**
 * 构造 Gemini 规范请求体（异步，需要将参考图转 Base64）
 *
 * Body：
 * {
 *   "contents": [{
 *     "parts": [
 *       { "text": "a cute cat" },
 *       { "inlineData": { "mimeType": "image/png", "data": "<base64>" } }  // 参考图
 *     ]
 *   }],
 *   "generationConfig": {
 *     "responseModalities": ["TEXT", "IMAGE"],
 *     "imageConfig": {
 *       "aspectRatio": "16:9",
 *       "imageSize": "4K"
 *     }
 *   }
 * }
 */
async function buildGeminiBody(params: GenerateParams): Promise<Record<string, unknown>> {
  const textParts: unknown[] = [{ text: params.prompt }]
  if (params.negativePrompt?.trim()) {
    textParts.push({ text: `Negative prompt: ${params.negativePrompt.trim()}` })
  }

  // 参考图 → Base64 inlineData
  const imageParts: unknown[] = []
  for (const file of params.referenceImages.slice(0, 4)) {
    try {
      const { mimeType, data } = await fileToBase64(file)
      imageParts.push({ inlineData: { mimeType, data } })
    } catch {
      /* 跳过无法读取的文件 */
    }
  }

  // ── aspectRatio：精确映射到 Gemini 支持的 10 种标准比例 ──────────────────
  const aspectRatio = toAspectRatio(params.width, params.height, params.resolutionPreset)
  // imageSize：优先用 sizeTier，fallback 从像素值推导（防止传参丢失）
  const imageSize =
    toGeminiImageSize(params.sizeTier) ?? toGeminiImageSizeFromPixels(params.width, params.height)
  // Gemini 官方规范：aspectRatio 和 imageSize 必须放在 generationConfig.imageConfig 内
  const generationConfig: Record<string, unknown> = {}
  // responseModalities 告诉 API 返回图片（部分 API 需要此字段才能出图）
  // 纯图生图（有参考图且 prompt 为空）只请求 IMAGE，避免 TEXT 导致挂起
  const hasImageParts = imageParts.length > 0
  const hasTextPrompt = params.prompt.trim().length > 0
  generationConfig.responseModalities =
    hasImageParts && !hasTextPrompt ? ['IMAGE'] : ['TEXT', 'IMAGE']
  generationConfig.imageConfig = { aspectRatio, imageSize }

  return {
    contents: [
      {
        parts: [...textParts, ...imageParts],
      },
    ],
    generationConfig,
  }
}

// ── 核心生图接口 ──────────────────────────────────────────

/** generateImages 返回值 — 从 apiUtils 统一导入，保持单一类型源 */
export type { GenerateResult } from './apiUtils'
import type { GenerateResult } from './apiUtils'

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function transientRetryDelayMs(attempt: number): number {
  return 1500 * 2 ** attempt + Math.floor(Math.random() * 500)
}

async function runWithConcurrency<T>(
  count: number,
  limit: number,
  worker: (index: number) => Promise<T>,
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = new Array(count)
  let nextIndex = 0

  async function runWorker() {
    while (nextIndex < count) {
      const index = nextIndex
      nextIndex += 1
      try {
        results[index] = { status: 'fulfilled', value: await worker(index) }
      } catch (reason) {
        results[index] = { status: 'rejected', reason }
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), count) }, runWorker))
  return results
}

export async function generateImages(params: GenerateParams): Promise<GenerateResult> {
  const API_BASE_URL = getApiBaseUrl()
  if (!API_BASE_URL) {
    return errResult('', 'openai' as ApiSpec, '', '请在「设置」中配置生图 API 地址后再生成。')
  }

  const cfg = getApiConfig()
  const activeInfo = getActiveImageModel(cfg)
  const apiKey = activeInfo.apiKey || ''
  const spec = activeInfo.spec

  // model 优先用 UI 传入值，回退激活模型 modelId
  const resolvedModel = params.model?.trim() || activeInfo.model?.modelId?.trim() || ''

  const endpoint = buildEndpoint(API_BASE_URL, spec, resolvedModel)

  // ── OpenAI 规范：自动降级重试 ──────────────────────────────────────────
  // 当 API 返回 400/422 错误且请求尺寸较大时，自动用更小的尺寸重试
  if (spec === 'openai') {
    const result = await doGenerateOpenAI(params, resolvedModel, endpoint, apiKey)
    // 如果失败且可能是尺寸原因，尝试降级重试
    if (
      result.error &&
      result.httpStatus &&
      (result.httpStatus === 400 || result.httpStatus === 422)
    ) {
      const errLower = result.error.toLowerCase()
      const sizeRelated =
        errLower.includes('size') ||
        errLower.includes('dimension') ||
        errLower.includes('resolution') ||
        errLower.includes('width') ||
        errLower.includes('height')
      if (sizeRelated && (params.width > 1536 || params.height > 1536)) {
        // 降级到 1536x1536 范围重试
        const scale = Math.min(1536 / params.width, 1536 / params.height, 1)
        const retryParams = {
          ...params,
          width: Math.round(params.width * scale),
          height: Math.round(params.height * scale),
        }
        const retryResult = await doGenerateOpenAI(retryParams, resolvedModel, endpoint, apiKey)
        if (!retryResult.error) {
          retryResult.responseSummary = `⚠️ 原始请求尺寸 ${params.width}×${params.height} 被 API 拒绝（HTTP ${result.httpStatus}），已自动降级到 ${retryParams.width}×${retryParams.height} 成功生成。\n\n原始错误：${result.error}\n\n${retryResult.responseSummary}`
        }
        return retryResult
      }
    }
    return result
  }

  // Gemini 规范
  return doGenerateGemini(params, resolvedModel, endpoint, apiKey)
}

// ── 内部实现：单次 API 调用 ────────────────────────────────────────────────

/** 构建请求头 */
function buildHeaders(apiKey: string): HeadersInit {
  const headers: HeadersInit = { 'Content-Type': 'application/json', Accept: 'application/json' }
  if (apiKey?.trim()) headers['Authorization'] = `Bearer ${apiKey.trim()}`
  return headers
}

/** 构建请求体日志（截断 base64） */
function buildRequestBodyForLog(requestBody: Record<string, unknown>): string {
  return JSON.stringify(
    requestBody,
    (key, value) => {
      if (key === 'data' && typeof value === 'string' && value.length > 100)
        return `[base64 data, ${value.length} chars]`
      if (key === 'url' && typeof value === 'string' && value.startsWith('data:')) {
        const base64 = value.split(',')[1] ?? ''
        if (base64.length > 100)
          return `data:${value.split(',')[0]};base64,[${base64.length} chars]`
      }
      return value
    },
    2,
  )
}

/** 执行单次 HTTP 请求并解析响应 */
async function doFetchAndParse(
  endpoint: string,
  spec: ApiSpec,
  requestBody: Record<string, unknown>,
  headers: HeadersInit,
  resolvedModel: string,
): Promise<GenerateResult> {
  const requestBodyForLog = buildRequestBodyForLog(requestBody)

  let resp: Response | null = null
  let rawText = ''
  let lastNetworkError: unknown = null

  for (let attempt = 0; attempt <= MAX_TRANSIENT_RETRIES; attempt += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 600_000)

    try {
      resp = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      })
      rawText = await resp.text()
    } catch (err) {
      lastNetworkError = err
      clearTimeout(timer)
      if (attempt < MAX_TRANSIENT_RETRIES) {
        await sleep(transientRetryDelayMs(attempt))
        continue
      }
      if (err instanceof DOMException && err.name === 'AbortError') {
        const specLabel = spec === 'gemini' ? 'Gemini 规范' : 'OpenAI 规范'
        return errResult(
          endpoint,
          spec,
          requestBodyForLog,
          `❌ API 对接失败：请求超时（600s）\n\n📌 错误详情：接口 ${endpoint || '(未构建)'} 在 600 秒内未响应，已自动重试 ${MAX_TRANSIENT_RETRIES} 次仍失败\n\n🔍 排查建议：\n· 降低 batchSize / 并行数量后重试\n· 确认接口地址是否正确且可访问\n· 检查服务器端是否存在负载过高或死循环\n· 验证网络代理 / VPN 设置是否影响连接\n\n🌐 请求地址：${endpoint}\n📦 规范类型：${specLabel}`,
        )
      }
      return errResult(
        endpoint,
        spec,
        requestBodyForLog,
        `API 对接失败：网络请求异常，已自动重试 ${MAX_TRANSIENT_RETRIES} 次仍失败。\n详情：${err instanceof Error ? err.message : String(err)}`,
      )
    } finally {
      clearTimeout(timer)
    }

    if (!TRANSIENT_HTTP_STATUS.has(resp.status) || attempt >= MAX_TRANSIENT_RETRIES) break
    await sleep(transientRetryDelayMs(attempt))
  }

  if (!resp) {
    return errResult(
      endpoint,
      spec,
      requestBodyForLog,
      `API 对接失败：网络请求异常。\n详情：${lastNetworkError instanceof Error ? lastNetworkError.message : String(lastNetworkError)}`,
    )
  }

  const contentType = resp.headers.get('content-type') ?? ''
  const httpStatus = resp.status

  if (contentType.includes('text/html') || isHtmlContent(rawText)) {
    return errResult(
      endpoint,
      spec,
      requestBodyForLog,
      `API 返回了 HTML 页面而非 JSON，请确认：\n· 接口地址是否正确（当前：${endpoint}）\n· API 密钥是否有效\n· 接口路径 / 格式是否匹配\nHTTP ${resp.status}  Content-Type：${contentType || '未知'}`,
      resp.status,
      rawText.slice(0, 500),
    )
  }

  if (!resp.ok) {
    const parsed = safeParseJson(rawText)
    const detail = extractErrorMessage(parsed, rawText || `HTTP ${resp.status}`)
    const rawSnippet = rawText.slice(0, 200)
    const specLabel = spec === 'gemini' ? 'Gemini 规范' : 'OpenAI 规范'
    const specPath =
      spec === 'gemini' ? '/v1beta/models/.../generateContent' : '/v1/images/generations'

    let hint = ''
    switch (resp.status) {
      case 400:
        hint = `请求参数有误，请检查：\n· 提示词是否包含特殊字符或过长\n· 分辨率 / 比例参数是否符合 ${specLabel} 支持范围\n· 模型 ID（${resolvedModel || '未指定'}）是否正确`
        break
      case 401:
      case 403:
        hint = `认证失败，请检查：\n· API 密钥是否已填写且有效\n· 密钥是否已过期或被禁用\n· 是否开通了对应模型的访问权限`
        break
      case 404:
        hint = `接口地址不存在，请确认：\n· BaseUrl 是否正确（当前：${endpoint.replace(/\/[^/]+\/?$/, '')}）\n· 模型 ID 是否存在（当前：${resolvedModel || '未指定'}）`
        break
      case 408:
        hint = '请求超时，请检查网络连接或接口是否响应缓慢'
        break
      case 429:
        hint = `请求被限流（Too Many Requests），请：\n· 稍等片刻后重试\n· 降低生图频率或减少 batchSize\n· 检查 API 配额是否已用尽`
        break
      case 500:
      case 502:
      case 503:
      case 504:
        hint = `上游服务异常（HTTP ${resp.status}），请：\n· 等待片刻后重试\n· 联系 API 提供方确认服务状态`
        break
      default:
        hint = `请检查：\n· 接口地址是否正确（${specPath}）\n· API 密钥是否有效\n· 接口服务是否支持 ${specLabel}`
    }

    return errResult(
      endpoint,
      spec,
      requestBodyForLog,
      `❌ API 对接失败（HTTP ${resp.status}）\n📌 错误详情：${detail}\n\n🔍 排查建议：\n${hint}\n\n🌐 请求地址：${endpoint}\n📦 规范类型：${specLabel}\n🤖 模型 ID：${resolvedModel || '未指定'}\n${rawSnippet ? `📨 响应内容：${rawSnippet}` : ''}`,
      resp.status,
      rawText.slice(0, 500),
    )
  }

  // 解析 JSON
  const data = safeParseJson(rawText)
  if (!data) {
    return errResult(
      endpoint,
      spec,
      requestBodyForLog,
      `API 返回内容无法解析为 JSON。\n响应预览：${rawText.slice(0, 300)}\n请求地址：${endpoint}`,
      resp.status,
      rawText.slice(0, 500),
    )
  }

  // 按规范提取图片
  let images = spec === 'gemini' ? extractImagesGemini(data) : extractImagesOpenAI(data)

  // Gemini 特殊处理：API 返回 200 但文本含错误信息（如 "Cannot read image.png"）
  // 注意：即使提取到了图片，也要检查是否存在错误文本——
  // 某些模型会在不支持图片输入时同时返回错误文本和一张"凑数"图片
  if (spec === 'gemini') {
    const geminiErrorText = extractGeminiErrorText(data)
    if (geminiErrorText) {
      const checkText = geminiErrorText.toLowerCase()
      const hasImageInputError =
        checkText.includes('cannot read') ||
        checkText.includes('does not support image') ||
        (checkText.includes('not support') && checkText.includes('image')) ||
        checkText.includes('inform the user') ||
        checkText.includes('unable to read') ||
        checkText.includes("can't read") ||
        (checkText.includes('does not support') && checkText.includes('input')) ||
        checkText.includes('this model does not')
      if (hasImageInputError) {
        console.warn('[Gemini 图片降级] 检测到模型不支持图片输入:', geminiErrorText.slice(0, 200))
        return errResult(
          endpoint,
          spec,
          requestBodyForLog,
          '当前模型不支持图片输入（含参考图）。请在设置中选择支持图片的模型，或去掉参考图后重试。',
          resp.status,
          rawText.slice(0, 500),
        )
      }
    }
  }

  if (!images || images.length === 0) {
    const hint =
      spec === 'gemini'
        ? '期望 candidates[].content.parts[].inlineData.data，或 parts[].text 中的 Markdown/data:image 图片'
        : '期望 data[].url 或 images[]'
    const fallback = spec === 'gemini' ? extractImagesOpenAI(data) : extractImagesGemini(data)
    if (fallback && fallback.length > 0) {
      images = fallback
    } else {
      return errResult(
        endpoint,
        spec,
        requestBodyForLog,
        `API 返回数据结构不符合预期（${hint}）。\n实际返回：${rawText.slice(0, 300)}`,
        resp.status,
        rawText.slice(0, 500),
      )
    }
  }

  let jsonValid = false
  const responseSummary = (() => {
    try {
      const parsed2 = JSON.parse(rawText) as Record<string, unknown>
      jsonValid = true
      const cleaned = JSON.stringify(
        parsed2,
        (key, value) => {
          if (key === 'data' && typeof value === 'string' && value.length > 100)
            return `[base64 image, ${value.length} chars]`
          if (key === 'b64_json' && typeof value === 'string' && value.length > 100)
            return `[base64 image, ${value.length} chars]`
          return value
        },
        2,
      )
      return cleaned.slice(0, 2000) + (cleaned.length > 2000 ? '\n… (已截断)' : '')
    } catch {
      jsonValid = false
      return rawText.slice(0, 2000) + (rawText.length > 2000 ? '\n… (已截断)' : '')
    }
  })()

  return {
    images,
    endpoint,
    spec,
    requestBodyJson: requestBodyForLog,
    httpStatus,
    responseSummary,
    jsonValid,
  }
}

/** OpenAI 规范：单次生图 */
async function doGenerateOpenAI(
  params: GenerateParams,
  resolvedModel: string,
  endpoint: string,
  apiKey: string,
): Promise<GenerateResult> {
  const requestBody = await buildOpenAIBody(params, resolvedModel)
  const headers = buildHeaders(apiKey)
  return doFetchAndParse(endpoint, 'openai', requestBody, headers, resolvedModel)
}

/** Gemini 规范：单次生图（支持 batchSize > 1 时并发调用） */
async function doGenerateGemini(
  params: GenerateParams,
  resolvedModel: string,
  endpoint: string,
  apiKey: string,
): Promise<GenerateResult> {
  // Gemini 每次只返回 1 张，需循环调用 batchSize 次
  if (params.batchSize > 1) {
    const settled = await runWithConcurrency(
      params.batchSize,
      GEMINI_BATCH_CONCURRENCY,
      async i => {
        const r = await doGenerateGemini(
          { ...params, batchSize: 1 },
          resolvedModel,
          endpoint,
          apiKey,
        )
        return {
          ...r,
          images: r.images.map(img => ({ ...img, id: `${i}-${img.id}` })),
        }
      },
    )
    const allImages: GeneratedImage[] = []
    let lastResult: GenerateResult | null = null
    let failedCount = 0
    for (const s of settled) {
      if (s.status === 'fulfilled' && !s.value.error) {
        allImages.push(...s.value.images)
        lastResult = s.value
      } else {
        failedCount++
        if (!lastResult) lastResult = s.status === 'fulfilled' ? s.value : null
      }
    }
    if (allImages.length === 0) {
      const errMsg = lastResult?.error || `所有 ${params.batchSize} 次调用均失败`
      return {
        ...(lastResult || {
          images: [],
          endpoint: '',
          spec: 'gemini' as ApiSpec,
          requestBodyJson: '',
          httpStatus: 0,
          responseSummary: '',
          jsonValid: false,
        }),
        images: [],
        error: errMsg,
        responseSummary: `共调用 ${params.batchSize} 次，成功 0 张，失败 ${failedCount} 张`,
      }
    }
    return {
      images: allImages,
      endpoint: lastResult?.endpoint ?? '',
      spec: 'gemini' as ApiSpec,
      requestBodyJson: lastResult?.requestBodyJson ?? '',
      httpStatus: lastResult?.httpStatus ?? 200,
      responseSummary: `共调用 ${params.batchSize} 次，成功 ${allImages.length} 张${failedCount > 0 ? `，失败 ${failedCount} 张` : ''}`,
      jsonValid: lastResult?.jsonValid ?? true,
    }
  }

  const requestBody = await buildGeminiBody(params)
  const headers = buildHeaders(apiKey)
  return doFetchAndParse(endpoint, 'gemini', requestBody, headers, resolvedModel)
}

// ── 测试对接接口 ──────────────────────────────────────────

export type TestApiResult =
  | { ok: true; message: string }
  | { ok: false; message: string; detail?: string }

export async function testApiGenerate(
  baseUrl: string,
  apiKey: string,
  model?: string,
  spec?: ApiSpec,
): Promise<TestApiResult> {
  const cfg = getApiConfig()
  const activeInfo = getActiveImageModel(cfg)
  const resolvedModel = model?.trim() || activeInfo.model?.modelId?.trim() || ''
  const resolvedSpec = spec ?? activeInfo.spec

  const endpoint = buildEndpoint(baseUrl, resolvedSpec, resolvedModel)

  let testBody: Record<string, unknown>
  if (resolvedSpec === 'gemini') {
    // 与生产代码保持一致：aspectRatio 放在 imageConfig 内，不带 responseModalities
    testBody = {
      contents: [{ parts: [{ text: '__api_connectivity_test__' }] }],
      generationConfig: {
        imageConfig: { aspectRatio: '1:1' },
      },
    }
  } else {
    testBody = { prompt: '__api_connectivity_test__', size: '1024x1024', n: 1 }
    if (resolvedModel) testBody.model = resolvedModel
  }

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
  if (apiKey?.trim()) headers['Authorization'] = `Bearer ${apiKey.trim()}`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15_000)

  try {
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(testBody),
      signal: controller.signal,
    })
    clearTimeout(timer)

    const rawText = await resp.text()
    const contentType = resp.headers.get('content-type') ?? ''

    if (contentType.includes('text/html')) {
      return {
        ok: false,
        message: `接口返回了 HTML 页面（Content-Type: text/html），请确认地址 / 密钥 / 格式是否正确。`,
        detail: `实际请求地址：${endpoint}\nHTTP ${resp.status}\nContent-Type: ${contentType}\n\n排查提示：\n· BaseUrl 是否正确（支持填域名或完整接口地址）\n· API 密钥是否已填写且有效\n· 接口服务是否支持所选规范（${resolvedSpec === 'gemini' ? 'Gemini' : 'OpenAI'}）格式`,
      }
    }

    if (isHtmlContent(rawText)) {
      return {
        ok: false,
        message: `接口返回了 HTML 内容（非 JSON），请确认地址 / 密钥 / 格式是否正确。`,
        detail: `实际请求地址：${endpoint}\nHTTP ${resp.status}\n\n排查提示：\n· 确认 BaseUrl 填写正确\n· 确认 API 密钥有效\n· 接口路径已自动补全为 ${resolvedSpec === 'gemini' ? '/v1beta/models/.../generateContent' : '/v1/images/generations'}`,
      }
    }

    const parsed = safeParseJson(rawText)
    if (!parsed) {
      return {
        ok: false,
        message: `接口返回了非 JSON 内容（Content-Type: ${contentType || '未知'}），请确认地址 / 密钥 / 格式是否正确。`,
        detail: `实际请求地址：${endpoint}\n响应预览：${rawText.slice(0, 200)}`,
      }
    }

    if (!resp.ok) {
      const errMsg = extractErrorMessage(parsed, rawText || `HTTP ${resp.status}`)
      const compatHint =
        resolvedSpec === 'openai'
          ? `\n\n⚠ 当前 Base URL 可能不兼容 OpenAI 规范，请确认：\n1. 接口路径是否为 /v1/images/generations\n2. 请求体字段是否为 prompt/size 格式\n3. 若使用 Gemini 系列模型，请切换规范为「Gemini 规范」`
          : ''
      return {
        ok: false,
        message: `接口格式正常（返回 JSON），但请求被拒绝：${errMsg}`,
        detail: [
          `实际请求地址：${endpoint}`,
          `HTTP ${resp.status}  Content-Type: ${contentType}`,
          `接口规范：${resolvedSpec === 'gemini' ? 'Gemini' : 'OpenAI'}`,
          resolvedModel
            ? `使用模型：${resolvedModel}`
            : `⚠ 未指定模型（请在主界面选择模型后再测试）`,
          `请求 Body：${JSON.stringify(testBody)}`,
          compatHint,
        ].join('\n'),
      }
    }

    return {
      ok: true,
      message: `接口联通且返回标准 JSON ✓\n实际请求地址：${endpoint}\n接口规范：${resolvedSpec === 'gemini' ? 'Gemini' : 'OpenAI'}\nContent-Type: ${contentType || 'application/json'}`,
    }
  } catch (err) {
    clearTimeout(timer)
    if (err instanceof DOMException && err.name === 'AbortError') {
      return {
        ok: false,
        message: `❌ 测试超时（15s）：接口 ${endpoint || '(未构建)'} 在 15 秒内无响应`,
        detail: `排查：确认接口地址可访问、服务器无死循环、检查代理/VPN设置`,
      }
    }
    return {
      ok: false,
      message: `网络请求失败：${err instanceof Error ? err.message : String(err)}`,
      detail: `实际请求地址：${endpoint}`,
    }
  }
}
