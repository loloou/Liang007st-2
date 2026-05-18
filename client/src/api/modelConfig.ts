// ─────────────────────────────────────────────────────────────────────────────
//  modelConfig.ts — OpenAI 标准 API 请求封装
//
//  Chat  → POST {BASE_URL}/v1/chat/completions
//  Image → POST {BASE_URL}/v1/images/generations
//
//  请求头：Content-Type: application/json
//          Authorization: Bearer {API_KEY}
//  请求体：完全对齐 OpenAI 官方格式，不新增自定义参数
// ─────────────────────────────────────────────────────────────────────────────

import type { ChatModel, ImageModel, ApiConfig } from './settings'
import { resolveBaseUrl, resolveApiKey, resolveApiSpec } from './settings'

// ── 类型 ─────────────────────────────────────────────────────────────────────

export type TestResult =
  | { ok: true; message: string }
  | { ok: false; message: string; detail?: string }

// ── 工具函数 ─────────────────────────────────────────────────────────────────

/** 标准化 BASE URL：去尾斜杠，不重复追加路径 */
function normalizeBase(base: string): string {
  return base.trim().replace(/\/$/, '')
}

/** 构建 OpenAI 标准请求头 */
function buildHeaders(apiKey: string): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`
  return headers
}

/** 安全 JSON 解析 */
function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/** 从各种嵌套结构中提取错误描述（防止 [object Object]） */
function extractError(parsed: unknown, fallback: string): string {
  if (!parsed || typeof parsed !== 'object') return fallback
  const obj = parsed as Record<string, unknown>
  function str(v: unknown): string {
    if (typeof v === 'string') return v
    if (Array.isArray(v)) return v.map(i => str(i)).join('；')
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>
      return str(o.message ?? o.msg ?? o.detail ?? JSON.stringify(v))
    }
    return String(v ?? '')
  }
  for (const k of ['message', 'error', 'detail', 'msg', 'reason']) {
    if (obj[k] !== undefined) {
      const r = str(obj[k])
      if (r) return r
    }
  }
  return fallback || JSON.stringify(parsed)
}

/**
 * 将 HTTP 状态码转为 OpenAI 风格的友好提示
 */
function httpStatusHint(status: number): string {
  switch (status) {
    case 400:
      return '请求格式错误（400）：请检查模型 ID 是否正确'
    case 401:
      return '密钥无效（401）：请检查 API KEY 是否正确'
    case 403:
      return '无权限（403）：账户可能没有该模型的访问权限'
    case 404:
      return '接口地址错误（404）：请检查 BASE URL 路径是否正确'
    case 429:
      return '请求过于频繁（429）：已触发限流，请稍后重试'
    case 500:
      return '模型服务异常（500）：可能是模型 ID 不支持或服务端错误'
    case 502:
      return '网关错误（502）：服务暂时不可用'
    case 503:
      return '服务不可用（503）：后端服务未启动或过载'
    default:
      return `请求失败（HTTP ${status}）`
  }
}

// ── Chat 模型 — /v1/chat/completions ─────────────────────────────────────────

/**
 * 测试 Chat 模型连接
 * 发送一条极短的消息，验证 BASE_URL / API_KEY / MODEL_ID 是否有效
 */
export async function testChatModel(
  model: ChatModel,
  config: Pick<ApiConfig, 'globalBaseUrl' | 'globalApiKey'>,
): Promise<TestResult> {
  const base = normalizeBase(resolveBaseUrl(model, config))
  const apiKey = resolveApiKey(model, config)
  const modelId = model.modelId.trim()

  if (!base) return { ok: false, message: '请填写 BASE URL' }
  if (!modelId) return { ok: false, message: '请填写 Model ID' }

  const endpoint = `${base}/v1/chat/completions`

  // OpenAI 标准请求体：使用最小 token 消耗的测试消息
  const body = {
    model: modelId,
    messages: [{ role: 'user', content: 'hi' }],
    max_completion_tokens: 1,
    stream: false,
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15_000)

  try {
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: buildHeaders(apiKey),
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    clearTimeout(timer)

    const rawText = await resp.text()
    const parsed = safeJson(rawText)
    const contentType = resp.headers.get('content-type') ?? ''

    if (!resp.ok) {
      const hint = httpStatusHint(resp.status)
      const detail = parsed ? extractError(parsed, rawText) : rawText.slice(0, 200)
      return {
        ok: false,
        message: hint,
        detail: `接口：${endpoint}\nModel：${modelId}\n返回：${detail}`,
      }
    }

    return {
      ok: true,
      message: `Chat 模型联通 ✓\n接口：${endpoint}\nContent-Type: ${contentType || 'application/json'}`,
    }
  } catch (err) {
    clearTimeout(timer)
    if (err instanceof DOMException && err.name === 'AbortError') {
      return {
        ok: false,
        message: '连接超时（15s）：请检查 BASE URL 是否可达',
        detail: `接口：${endpoint}`,
      }
    }
    return {
      ok: false,
      message: `网络请求失败：${err instanceof Error ? err.message : String(err)}`,
      detail: `接口：${endpoint}`,
    }
  }
}

// ── Image 模型 — /v1/images/generations ──────────────────────────────────────

/**
 * 测试 Image 模型连接
 * 自动根据 apiSpec 选择 OpenAI 规范或 Gemini 规范
 */
export async function testImageModel(
  model: ImageModel,
  config: Pick<ApiConfig, 'globalBaseUrl' | 'globalApiKey' | 'globalApiSpec'>,
): Promise<TestResult> {
  const base = normalizeBase(resolveBaseUrl(model, config))
  const apiKey = resolveApiKey(model, config)
  const modelId = model.modelId.trim()
  const spec = resolveApiSpec(model, config)

  if (!base) return { ok: false, message: '请填写 BASE URL' }
  if (!modelId) return { ok: false, message: '请填写 Model ID' }

  let endpoint: string
  let body: Record<string, unknown>

  if (spec === 'gemini') {
    endpoint = `${base}/v1beta/models/${modelId}:generateContent`
    body = {
      contents: [{ parts: [{ text: '__api_connectivity_test__' }] }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'], aspectRatio: '1:1' },
    }
  } else {
    endpoint = `${base}/v1/images/generations`
    body = { model: modelId, prompt: '__api_connectivity_test__', size: '1024x1024', n: 1 }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 20_000)

  try {
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: buildHeaders(apiKey),
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    clearTimeout(timer)

    const rawText = await resp.text()
    const parsed = safeJson(rawText)
    const contentType = resp.headers.get('content-type') ?? ''

    // HTML 响应视为地址错误
    const isHtml =
      contentType.includes('text/html') || rawText.trimStart().toLowerCase().startsWith('<!doctype')
    if (isHtml) {
      return {
        ok: false,
        message: '接口返回了 HTML 页面（非 JSON）：请检查 BASE URL 是否正确',
        detail: `实际接口：${endpoint}\nHTTP ${resp.status}\nContent-Type: ${contentType}`,
      }
    }

    if (!resp.ok) {
      const hint = httpStatusHint(resp.status)
      const detail = parsed ? extractError(parsed, rawText) : rawText.slice(0, 200)
      const compatHint =
        spec === 'openai'
          ? `\n\n⚠ 当前 Base URL 可能不兼容 OpenAI 规范，请确认：\n1. 接口路径是否为 /v1/images/generations\n2. 请求体字段是否为 prompt/size 格式\n3. 若使用 Gemini 系列模型，请在模型卡片中切换为「Gemini 规范」`
          : ''
      return {
        ok: false,
        message: hint,
        detail: `接口：${endpoint}\n规范：${spec === 'gemini' ? 'Gemini' : 'OpenAI'}\nModel：${modelId}\n返回：${detail}${compatHint}`,
      }
    }

    return {
      ok: true,
      message: `Image 模型联通 ✓\n接口：${endpoint}\n规范：${spec === 'gemini' ? 'Gemini' : 'OpenAI'}\nContent-Type: ${contentType || 'application/json'}`,
    }
  } catch (err) {
    clearTimeout(timer)
    if (err instanceof DOMException && err.name === 'AbortError') {
      return {
        ok: false,
        message: '连接超时（20s）：请检查 BASE URL 是否可达',
        detail: `接口：${endpoint}`,
      }
    }
    return {
      ok: false,
      message: `网络请求失败：${err instanceof Error ? err.message : String(err)}`,
      detail: `接口：${endpoint}`,
    }
  }
}

// ── 模型列表获取（/v1/models）────────────────────────────────────────────────

export type FetchModelsResult = { ok: true; models: string[] } | { ok: false; message: string }

/**
 * 从 BASE_URL/v1/models 获取模型列表（OpenAI 标准）
 */
export async function fetchModelList(baseUrl: string, apiKey: string): Promise<FetchModelsResult> {
  const base = normalizeBase(baseUrl)
  if (!base) return { ok: false, message: '请先填写 BASE URL' }

  const endpoint = `${base}/v1/models`

  try {
    const resp = await fetch(endpoint, {
      method: 'GET',
      headers: buildHeaders(apiKey),
    })

    if (!resp.ok) {
      return { ok: false, message: httpStatusHint(resp.status) }
    }

    const data = (await resp.json()) as unknown
    const ids = parseModelIds(data)
    if (ids.length === 0) return { ok: false, message: '接口未返回任何模型' }
    return { ok: true, models: ids }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) }
  }
}

function parseModelIds(body: unknown): string[] {
  if (Array.isArray(body)) {
    return body
      .map(i => (typeof i === 'string' ? i : (i as { id?: string })?.id))
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
  }
  if (body && typeof body === 'object') {
    const obj = body as Record<string, unknown>
    const arr = Array.isArray(obj.data) ? obj.data : Array.isArray(obj.models) ? obj.models : null
    if (arr) return parseModelIds(arr)
  }
  return []
}
