// ─────────────────────────────────────────────────────────────────────────────
//  apiUtils.ts — imageClient / inpaintClient 共享的工具函数
// ─────────────────────────────────────────────────────────────────────────────

// ── 类型导入（仅用于 errResult 返回值） ─────────────────────────────────────
import type { ApiSpec } from './settings'

export type GeneratedImageLike = {
  id: string
  url: string
  originalUrl?: string
}

export type GenerateResult = {
  images: GeneratedImageLike[]
  endpoint: string
  spec: ApiSpec
  requestBodyJson: string
  httpStatus: number
  responseSummary: string
  jsonValid: boolean
  error?: string
  httpErrorBody?: string
}

// ── 尺寸工具 ─────────────────────────────────────────────────────────────────

const STANDARD_SIZES = [512, 768, 1024, 1536, 2048, 4096]

function snapToNearest(v: number): number {
  let best = STANDARD_SIZES[0]
  for (const s of STANDARD_SIZES) {
    if (Math.abs(s - v) < Math.abs(best - v)) best = s
  }
  return Math.min(best, 4096)
}

/**
 * 任意宽高 → OpenAI API 尺寸字符串
 * 返回最接近的标准尺寸（如 "1024x1536"）
 */
export function toOpenAISizeString(width: number, height: number): string {
  return `${snapToNearest(width)}x${snapToNearest(height)}`
}

// ── JSON 工具 ────────────────────────────────────────────────────────────────

/** 安全解析 JSON，失败返回 null */
export function safeParseJson(text: string): unknown | null {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

// ── HTML 检测 ────────────────────────────────────────────────────────────────

/** 判断响应内容是否为 HTML */
export function isHtmlContent(text: string): boolean {
  const t = text.trimStart().toLowerCase()
  return t.startsWith('<!doctype') || t.startsWith('<html')
}

// ── 错误信息提取 ─────────────────────────────────────────────────────────────

function stringifyValue(val: unknown): string {
  if (typeof val === 'string') return val
  if (typeof val === 'number' || typeof val === 'boolean') return String(val)
  if (Array.isArray(val)) {
    const msgs = val
      .map(item => {
        if (typeof item === 'string') return item
        if (item && typeof item === 'object') {
          const o = item as Record<string, unknown>
          return String(o.msg ?? o.message ?? o.detail ?? JSON.stringify(item))
        }
        return String(item)
      })
      .filter(Boolean)
    return msgs.join('；') || JSON.stringify(val)
  }
  if (typeof val === 'object' && val !== null) {
    const o = val as Record<string, unknown>
    if (o.message) return stringifyValue(o.message)
    if (o.msg) return stringifyValue(o.msg)
    if (o.detail) return stringifyValue(o.detail)
    return JSON.stringify(val)
  }
  return String(val)
}

/**
 * 从已解析 JSON 中提取可读错误描述，防止 [object Object]。
 * 支持：{ message }、{ error }、{ detail }、FastAPI 数组等
 */
export function extractErrorMessage(parsed: unknown, rawFallback: string): string {
  if (!parsed || typeof parsed !== 'object') return rawFallback
  const obj = parsed as Record<string, unknown>

  for (const key of ['message', 'error', 'detail', 'msg', 'reason', 'description']) {
    if (obj[key] !== undefined) {
      const r = stringifyValue(obj[key])
      if (r) return r
    }
  }
  return rawFallback || JSON.stringify(parsed)
}

// ── 失败结果构建 ─────────────────────────────────────────────────────────────

/** 构造失败结果对象（替代 throw），确保详细日志有完整上下文 */
export function errResult(
  endpoint: string,
  spec: ApiSpec,
  requestBodyJson: string,
  message: string,
  httpStatus = 0,
  httpErrorBody?: string,
): GenerateResult {
  return {
    images: [],
    endpoint,
    spec,
    requestBodyJson,
    httpStatus,
    responseSummary: '',
    jsonValid: false,
    error: message,
    httpErrorBody,
  }
}

// ── OpenAI 图片提取 ─────────────────────────────────────────────────────────

/** 从 OpenAI 兼容格式响应中提取图片列表 */
export function extractImagesOpenAI(data: unknown): GeneratedImageLike[] | null {
  if (!data || typeof data !== 'object') return null
  const obj = data as Record<string, unknown>

  // { data: [{ url | b64_json }] }
  if (Array.isArray(obj.data) && obj.data.length > 0) {
    const first = obj.data[0] as Record<string, unknown>
    if (typeof first.url === 'string' || typeof first.b64_json === 'string') {
      return (obj.data as { url?: string; b64_json?: string }[]).map((item, idx) => ({
        id: String(idx),
        url: item.url ?? (item.b64_json ? `data:image/png;base64,${item.b64_json}` : ''),
      }))
    }
  }
  // { images: string[] | object[] }
  if (Array.isArray(obj.images) && obj.images.length > 0) {
    if (typeof obj.images[0] === 'string')
      return (obj.images as string[]).map((url, idx) => ({ id: String(idx), url }))
    return (obj.images as { id?: string; url?: string; b64_json?: string }[]).map((img, idx) => ({
      id: img.id ?? String(idx),
      url: img.url ?? (img.b64_json ? `data:image/png;base64,${img.b64_json}` : ''),
    }))
  }
  // 直接数组
  if (Array.isArray(data) && data.length > 0) {
    if (typeof data[0] === 'string')
      return (data as string[]).map((url, idx) => ({ id: String(idx), url }))
    if (typeof (data[0] as Record<string, unknown>).url === 'string')
      return (data as { id?: string; url: string }[]).map((img, idx) => ({
        id: img.id ?? String(idx),
        url: img.url,
      }))
  }
  return null
}

// ── 图片输入不支持检测 ───────────────────────────────────────────────────────

/** 检测错误信息是否为"模型不支持图片输入"类错误 */
export function isImageInputUnsupportedError(message: string): boolean {
  const text = message.toLowerCase()
  return (
    text.includes('does not support image input') ||
    text.includes('does not support image') ||
    text.includes('image input is not supported') ||
    text.includes('cannot read') ||
    text.includes("can't read") ||
    text.includes('unable to read') ||
    text.includes('inform the user') ||
    text.includes('this model does not') ||
    text.includes('model does not support') ||
    (text.includes('vision') && text.includes('not support')) ||
    (text.includes('multimodal') && text.includes('not support')) ||
    (text.includes('invalid') && text.includes('image_url')) ||
    (text.includes('unsupported') && text.includes('image')) ||
    text.includes('不支持图片输入') ||
    text.includes('不支持参考图') ||
    text.includes('不支持图片') ||
    text.includes('去掉参考图')
  )
}
