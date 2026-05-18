import { getApiConfig, getActiveImageModel, type BalanceConfig } from './settings'

// ── 常量 ──────────────────────────────────────────────────────────────────────

/** quota → USD 转换因子（One API / New API 等中转站通用） */
const QUOTA_CONVERSION_FACTOR = 500000

/** 默认 CNY/USD 汇率 */
const DEFAULT_EXCHANGE_RATE = 7.2

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

function normalizeEndpointPath(path: string): string {
  const trimmed = path.trim()
  if (!trimmed) return '/api/user/self'
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

function applyBalanceTemplate(value: string, config: BalanceConfig): string {
  return value
    .replace(/\{\{userId\}\}/g, normalizeBalanceUserId(config.userId))
    .replace(/\{\{token\}\}/g, config.token || '')
}

function buildBalanceEndpoint(config: BalanceConfig, fallbackPath = '/api/user/self'): string {
  const base = applyBalanceTemplate(normalizeBaseUrl(config.baseUrl), config)
  const path = applyBalanceTemplate(normalizeEndpointPath(config.path || fallbackPath), config)
  return base + path
}

function getBalanceAuthHeader(config: BalanceConfig): string | undefined {
  const token = config.token?.trim()
  if (!token) return undefined
  return config.siteType === 'aihubmix' ? token : `Bearer ${token}`
}

function normalizeBalanceUserId(userId: string | undefined): string {
  return (userId || '')
    .trim()
    .replace(/^New-Api-User\s*:\s*/i, '')
    .replace(/^New-API-User\s*:\s*/i, '')
    .replace(/^X-User-Id\s*:\s*/i, '')
    .trim()
}

function applyBalanceUserHeaders(headers: Record<string, string>, config: BalanceConfig): void {
  const userId = normalizeBalanceUserId(config.userId)
  if (!userId) return

  // New API 明确要求该请求头。不要同时发送大小写/别名变体，避免服务端判定重复头格式错误。
  headers['New-Api-User'] ??= userId
}

// ── 代理请求（绕过 CORS） ──────────────────────────────────────────────────────

/**
 * 代理 HTTP 请求：优先使用 Electron 主进程，回退到浏览器直接请求
 * 在 Electron 环境中自动绕过 CORS 限制
 */
export async function proxyFetch(
  url: string,
  options: {
    method?: string
    headers?: Record<string, string>
    body?: string
    timeout?: number
  } = {}
): Promise<{
  ok: boolean
  status: number
  statusText: string
  data: unknown
  error?: string
}> {
  const { method = 'GET', headers = {}, body, timeout = 15000 } = options

  // 优先 Electron 主进程代理
  if (window.electronAPI?.fetchRequest) {
    const result = await window.electronAPI.fetchRequest({
      url,
      method,
      headers,
      body,
      timeout,
    })
    if (result.error) {
      return { ok: false, status: 0, statusText: 'Network Error', data: null, error: result.error }
    }
    return {
      ok: result.ok,
      status: result.status,
      statusText: result.statusText,
      data: result.body,
    }
  }

  // 浏览器开发环境：优先走 Vite 同源代理，避免第三方接口 CORS 拦截
  if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
    try {
      const proxyResp = await fetch('/__liang007_proxy_fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, method, headers, body, timeout }),
        signal: AbortSignal.timeout(timeout + 1000),
      })

      if (proxyResp.ok) {
        const data = await proxyResp.json()
        return {
          ok: Boolean(data.ok),
          status: Number(data.status || 0),
          statusText: String(data.statusText || ''),
          data: data.body,
          error: data.error,
        }
      }
    } catch {
      // 代理只在 Vite 开发服务器存在；不可用时继续回退到浏览器 fetch
    }
  }

  // 回退：浏览器直接请求（可能受 CORS 限制）
  try {
    const resp = await fetch(url, {
      method,
      headers,
      body: method !== 'GET' ? body : undefined,
      signal: AbortSignal.timeout(timeout),
    })
    const text = await resp.text()
    let data: unknown
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
    return { ok: resp.ok, status: resp.status, statusText: resp.statusText, data }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      status: 0,
      statusText: 'Network Error',
      data: null,
      error: `${msg}。如果在浏览器中使用，请通过 npm run dev 启动的开发服务访问，或使用 Electron 桌面端以绕过 CORS。`,
    }
  }
}

// ── 站点类型与对应的余额查询策略 ──────────────────────────────────────────────

/**
 * 支持的站点类型
 * 借鉴 all-api-hub 的 SITE_TYPES，按中转站架构分类
 */
export type SiteType =
  | 'one-api'      // One API (songquanpeng/one-api)
  | 'new-api'      // New API (QuantumNous/new-api)
  | 'one-hub'      // One Hub (MartialBE/one-hub)
  | 'done-hub'     // Done Hub (deanxv/done-hub)
  | 'veloera'      // Veloera
  | 'v-api'        // V-API
  | 'vo-api'       // VoAPI
  | 'super-api'    // Super-API
  | 'sub2api'      // Sub2API (Wei-Shaw/sub2api)
  | 'aihubmix'     // AIHubMix
  | 'custom'       // 自定义（用户手动配置端点和解析）

/** 站点类型配置表 */
const SITE_PRESETS: Record<string, {
  label: string
  /** 余额查询端点 */
  path: string
  method: 'GET' | 'POST'
  /** 从 JSON 响应中提取 quota 的函数 */
  extractQuota: (data: unknown) => number | null
  /** quota 是否需要除以 QUOTA_CONVERSION_FACTOR 得到 USD */
  quotaIsRaw: boolean
  /** 站点状态端点（公开，无需认证） */
  statusPath?: string
  /** 从 /api/status 响应中提取汇率 */
  extractExchangeRate?: (data: unknown) => number | null
}> = {
  // ── One API 系列（兼容接口）────────────────────────────────────────────
  'one-api': {
    label: 'One API',
    path: '/api/user/self',
    method: 'GET',
    extractQuota: extractOneApiQuota,
    quotaIsRaw: true,
    statusPath: '/api/status',
    extractExchangeRate: extractNewApiExchangeRate,
  },
  'new-api': {
    label: 'New API',
    path: '/api/user/self',
    method: 'GET',
    extractQuota: extractOneApiQuota,
    quotaIsRaw: true,
    statusPath: '/api/status',
    extractExchangeRate: extractNewApiExchangeRate,
  },
  'one-hub': {
    label: 'One Hub',
    path: '/api/user/self',
    method: 'GET',
    extractQuota: extractOneApiQuota,
    quotaIsRaw: true,
    statusPath: '/api/status',
    extractExchangeRate: extractNewApiExchangeRate,
  },
  'done-hub': {
    label: 'Done Hub',
    path: '/api/user/self',
    method: 'GET',
    extractQuota: extractOneApiQuota,
    quotaIsRaw: true,
    statusPath: '/api/status',
    extractExchangeRate: extractNewApiExchangeRate,
  },
  'veloera': {
    label: 'Veloera',
    path: '/api/user/self',
    method: 'GET',
    extractQuota: extractOneApiQuota,
    quotaIsRaw: true,
    statusPath: '/api/status',
    extractExchangeRate: extractNewApiExchangeRate,
  },
  'v-api': {
    label: 'V-API',
    path: '/api/user/self',
    method: 'GET',
    extractQuota: extractOneApiQuota,
    quotaIsRaw: true,
    statusPath: '/api/status',
    extractExchangeRate: extractNewApiExchangeRate,
  },
  'vo-api': {
    label: 'VoAPI',
    path: '/api/user/self',
    method: 'GET',
    extractQuota: extractOneApiQuota,
    quotaIsRaw: true,
    statusPath: '/api/status',
    extractExchangeRate: extractNewApiExchangeRate,
  },
  'super-api': {
    label: 'Super-API',
    path: '/api/user/self',
    method: 'GET',
    extractQuota: extractOneApiQuota,
    quotaIsRaw: true,
    statusPath: '/api/status',
    extractExchangeRate: extractNewApiExchangeRate,
  },
  // ── 独立架构 ─────────────────────────────────────────────────────────────
  'sub2api': {
    label: 'Sub2API',
    path: '/api/v1/auth/me',
    method: 'GET',
    extractQuota: (data) => {
      // 响应: { code: 0, data: { balance: USD浮点数 } }
      const obj = data as Record<string, unknown>
      if (obj.data && typeof obj.data === 'object') {
        const inner = obj.data as Record<string, unknown>
        if (typeof inner.balance === 'number') return inner.balance
        if (typeof inner.balanceUsd === 'number') return inner.balanceUsd
      }
      if (typeof (data as Record<string, unknown>).balance === 'number') return (data as Record<string, unknown>).balance as number
      return null
    },
    quotaIsRaw: false, // 已经是 USD
  },
  'aihubmix': {
    label: 'AIHubMix',
    path: '/api/user/self',
    method: 'GET',
    extractQuota: extractOneApiQuota,
    quotaIsRaw: true,
    statusPath: '/api/status',
    extractExchangeRate: extractNewApiExchangeRate,
  },
}

// ── 通用提取函数 ──────────────────────────────────────────────────────────────

/** One API 系列的统一 quota 提取 */
function extractOneApiQuota(data: unknown): number | null {
  const obj = data as Record<string, unknown>
  // 标准响应: { success: true, data: { quota: 数字 } }
  if (obj.data && typeof obj.data === 'object') {
    const inner = obj.data as Record<string, unknown>
    if (typeof inner.quota === 'number') return inner.quota
    if (typeof inner.balance === 'number') return inner.balance
  }
  // 直接在顶层找
  if (typeof obj.quota === 'number') return obj.quota
  if (typeof obj.balance === 'number') return obj.balance
  return null
}

/**
 * 从 /api/status 响应中提取汇率
 * 借鉴 all-api-hub 的 extractDefaultExchangeRate
 * 优先级: price → stripe_unit_price → PaymentUSDRate
 */
function extractNewApiExchangeRate(data: unknown): number | null {
  if (typeof data !== 'object' || data === null) return null
  const obj = data as Record<string, unknown>

  // 可能嵌套在 data 字段里
  const inner = (obj.data && typeof obj.data === 'object')
    ? obj.data as Record<string, unknown>
    : obj

  if (typeof inner.price === 'number' && inner.price > 0) return inner.price
  if (typeof inner.stripe_unit_price === 'number' && inner.stripe_unit_price > 0) return inner.stripe_unit_price
  if (typeof inner.PaymentUSDRate === 'number' && inner.PaymentUSDRate > 0) return inner.PaymentUSDRate

  return null
}

/** 获取站点类型预设列表（供 UI 选择） */
export function getSitePresets(): Array<{ value: string; label: string }> {
  return [
    ...Object.entries(SITE_PRESETS).map(([value, { label }]) => ({ value, label })),
    { value: 'custom', label: '自定义' },
  ]
}

export function buildBalanceTestRequest(config: BalanceConfig): {
  endpoint: string
  method: 'GET' | 'POST'
  headers: Record<string, string>
  body?: string
} {
  const siteType = (config.siteType || 'one-api') as SiteType
  const preset = SITE_PRESETS[siteType]
  const method = config.method || preset?.method || 'GET'
  const endpoint = buildBalanceEndpoint(config, preset?.path)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(config.headers || {}),
  }
  const authHeader = getBalanceAuthHeader(config)
  if (authHeader) {
    headers.Authorization = authHeader
  }
  applyBalanceUserHeaders(headers, config)

  return {
    endpoint,
    method,
    headers,
    body:
      method === 'POST' && config.bodyTemplate
        ? applyBalanceTemplate(config.bodyTemplate, config)
        : undefined,
  }
}

// ── 站点状态类型 ──────────────────────────────────────────────────────────────

/** 从 /api/status 获取的站点信息 */
export type SiteStatusInfo = {
  /** 站点系统名称 */
  systemName?: string
  /** CNY/USD 汇率 */
  exchangeRate?: number
  /** 汇率来源描述 */
  exchangeRateSource?: string
  /** 原始数据 */
  raw?: unknown
}

// ── 余额结果类型 ──────────────────────────────────────────────────────────────

export type BalanceResult =
  | {
      ok: true
      data: unknown
      /** 原始 quota 值 */
      rawQuota?: number
      /** 余额 USD */
      balanceUSD?: number
      /** 余额 CNY */
      balanceCNY?: number
      /** 格式化显示 */
      formatted?: string
      /** 使用的汇率 */
      exchangeRate?: number
      /** 汇率来源 */
      exchangeRateSource?: string
      /** 检测到的站点类型 */
      detectedSiteType?: string
    }
  | { ok: false; message: string; errorCode?: BalanceErrorCode }

/** 错误码分类（借鉴 all-api-hub 的错误分类） */
export type BalanceErrorCode =
  | 'no_base_url'         // 未配置地址
  | 'http_error'          // HTTP 错误（含状态码）
  | 'auth_failed'         // 认证失败 (401/403)
  | 'not_found'           // 端点不存在 (404)
  | 'html_response'       // 返回了 HTML
  | 'invalid_json'        // JSON 解析失败
  | 'api_error'           // API 层面返回失败
  | 'no_balance_field'    // 找不到余额字段
  | 'network_error'       // 网络连接失败
  | 'timeout'             // 请求超时

/** 单个中转站的查询结果 */
export type StationBalanceResult = {
  /** 配置 id */
  configId: string
  /** 站点名称 */
  name: string
  /** 备注 */
  remark?: string
  /** 是否当前激活 */
  isActive: boolean
  /** 检测到的站点类型 */
  siteType?: string
} & BalanceResult

/** 多站点并发查询结果 */
export type MultiBalanceResult = {
  stations: StationBalanceResult[]
  /** 总 USD 余额（仅 ok 的站点之和） */
  totalUSD?: number
  /** 总 CNY 余额 */
  totalCNY?: number
  /** 使用的汇率（如果所有站点一致） */
  exchangeRate?: number
}

// ── 站点状态查询 ──────────────────────────────────────────────────────────────

/**
 * 查询站点状态（公开端点，无需认证）
 * 借鉴 all-api-hub 的 fetchSiteStatus
 */
export async function fetchSiteStatus(
  baseUrl: string,
  siteType?: string,
): Promise<SiteStatusInfo | null> {
  const base = normalizeBaseUrl(baseUrl)
  if (!base) return null

  const preset = siteType ? SITE_PRESETS[siteType] : null
  const statusPath = preset?.statusPath || '/api/status'

  try {
    const fetchResult = await proxyFetch(`${base}${statusPath}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      timeout: 8000,
    })

    if (!fetchResult.ok || fetchResult.error) return null

    const data = fetchResult.data
    if (!data || typeof data === 'string') return null

    // 提取信息
    const result: SiteStatusInfo = { raw: data }
    const apiObj = data as Record<string, unknown>
    const inner = (apiObj.data && typeof apiObj.data === 'object')
      ? apiObj.data as Record<string, unknown>
      : apiObj

    // 系统名称
    if (typeof inner.system_name === 'string') result.systemName = inner.system_name

    // 汇率
    const rate = preset?.extractExchangeRate
      ? preset.extractExchangeRate(data)
      : extractNewApiExchangeRate(data)

    if (rate !== null && rate > 0) {
      result.exchangeRate = rate
      result.exchangeRateSource = '站点配置'
    }

    return result
  } catch {
    return null
  }
}

// ── 余额提取与格式化 ──────────────────────────────────────────────────────────

/**
 * 从响应数据中提取并计算余额
 */
function extractAndFormatBalance(
  data: unknown,
  siteType: SiteType,
  exchangeRate?: number,
  exchangeRateSource?: string,
): {
  rawQuota?: number
  balanceUSD?: number
  balanceCNY?: number
  formatted?: string
  exchangeRate?: number
  exchangeRateSource?: string
} {
  const preset = SITE_PRESETS[siteType]

  let rawQuota: number | null = null

  if (preset) {
    rawQuota = preset.extractQuota(data)
  } else {
    // custom 类型：尝试通用提取
    rawQuota = extractQuotaGeneric(data)
  }

  if (rawQuota === null || !Number.isFinite(rawQuota)) {
    return {}
  }

  const rate = exchangeRate || DEFAULT_EXCHANGE_RATE
  let balanceUSD: number
  let balanceCNY: number

  if (preset?.quotaIsRaw) {
    // quota 是原始值，需要转换
    balanceUSD = rawQuota / QUOTA_CONVERSION_FACTOR
    balanceCNY = balanceUSD * rate
  } else {
    // 已经是 USD
    balanceUSD = rawQuota
    balanceCNY = balanceUSD * rate
  }

  const formatted = formatBalanceDisplay(balanceUSD, balanceCNY)

  return {
    rawQuota,
    balanceUSD,
    balanceCNY,
    formatted,
    exchangeRate: rate,
    exchangeRateSource: exchangeRateSource || (rate !== DEFAULT_EXCHANGE_RATE ? '站点配置' : '默认'),
  }
}

/** 通用提取：尝试多种字段名 */
function extractQuotaGeneric(data: unknown): number | null {
  if (typeof data !== 'object' || data === null) return null

  const obj = data as Record<string, unknown>

  // 先检查 data 包装层
  if (obj.data && typeof obj.data === 'object') {
    const inner = obj.data as Record<string, unknown>
    for (const key of ['quota', 'balance', 'credit', 'amount', 'remaining', 'total_balance', 'available_balance']) {
      if (typeof inner[key] === 'number') return inner[key]
    }
  }

  // 顶层字段
  for (const key of ['quota', 'balance', 'credit', 'amount', 'remaining', 'total_balance', 'available_balance']) {
    if (typeof obj[key] === 'number') return obj[key]
  }

  return null
}

/** 格式化余额显示 */
function formatBalanceDisplay(usd: number, cny: number): string {
  if (usd < 0.01 && usd > 0) {
    return `$${usd.toFixed(6)} ≈ ¥${cny.toFixed(4)}`
  }
  return `$${usd.toFixed(2)} ≈ ¥${cny.toFixed(2)}`
}

// ── 错误信息优化 ──────────────────────────────────────────────────────────────

/** 将 HTTP 状态码和响应内容转化为用户友好的错误信息 */
function categorizeHttpError(
  status: number,
  body: string,
  siteName: string,
): { message: string; errorCode: BalanceErrorCode } {
  const isHtml = body.trim().startsWith('<')

  if (status === 401 || status === 403) {
    return {
      message: `${siteName}: 认证失败 (${status})，请检查 API Key 是否正确`,
      errorCode: 'auth_failed',
    }
  }
  if (status === 404) {
    return {
      message: `${siteName}: 端点不存在 (404)，请检查站点类型配置`,
      errorCode: 'not_found',
    }
  }
  if (status === 429) {
    return {
      message: `${siteName}: 请求过于频繁 (429)，请稍后再试`,
      errorCode: 'http_error',
    }
  }
  if (isHtml) {
    return {
      message: `${siteName}: 服务器返回了 HTML 页面 (${status})，可能地址配置错误`,
      errorCode: 'html_response',
    }
  }
  return {
    message: `${siteName}: HTTP ${status}\n${body.slice(0, 200)}`,
    errorCode: 'http_error',
  }
}

// ── 主入口 ────────────────────────────────────────────────────────────────────

/**
 * 查询单个余额（保留向后兼容，内部调 fetchAllBalances）：
 * 1. 若有激活的 balanceConfig，使用对应策略
 * 2. 否则用全局配置的 baseUrl + apiKey 自动探测
 */
export async function fetchBalance(): Promise<BalanceResult> {
  const cfg = getApiConfig()

  // 优先使用自定义余额配置
  if (cfg.balanceConfigs && cfg.balanceConfigs.length > 0) {
    const activeConfig = cfg.activeBalanceConfigId
      ? cfg.balanceConfigs.find(c => c.id === cfg.activeBalanceConfigId)
      : cfg.balanceConfigs.find(c => c.isDefault)

    if (activeConfig) {
      return fetchWithConfig(activeConfig)
    }
  }

  // 回退：用全局 baseUrl + apiKey 自动探测
  const active = getActiveImageModel(cfg)
  const baseUrl = active.baseUrl || cfg.globalBaseUrl
  const apiKey = active.apiKey || cfg.globalApiKey

  if (!baseUrl?.trim()) {
    return { ok: false, message: '未配置 API 地址，请在设置中配置 Base URL 或添加余额查询配置', errorCode: 'no_base_url' }
  }

  return fetchAutoDetect(baseUrl, apiKey)
}

/**
 * 并发查询所有已配置的中转站余额
 * 若没有任何配置，则回退到全局 baseUrl 自动探测
 */
export async function fetchAllBalances(): Promise<MultiBalanceResult> {
  const cfg = getApiConfig()

  if (cfg.balanceConfigs && cfg.balanceConfigs.length > 0) {
    // 只查询当前激活的配置
    const activeConfig = cfg.activeBalanceConfigId
      ? cfg.balanceConfigs.find(c => c.id === cfg.activeBalanceConfigId)
      : cfg.balanceConfigs.find(c => c.isDefault) || cfg.balanceConfigs[0]

    if (activeConfig) {
      const res = await fetchWithConfig(activeConfig)
      const result: StationBalanceResult = {
        configId: activeConfig.id,
        name: activeConfig.name,
        remark: activeConfig.remark,
        isActive: true,
        siteType: activeConfig.siteType || 'one-api',
        ...res,
      }
      return {
        stations: [result],
        ...(res.ok && res.balanceUSD !== undefined
          ? { totalUSD: res.balanceUSD, totalCNY: res.balanceCNY ?? 0 }
          : {}),
      }
    }
  }

  // 回退：无配置时用全局 URL 探测
  const active = getActiveImageModel(cfg)
  const baseUrl = active.baseUrl || cfg.globalBaseUrl
  const apiKey = active.apiKey || cfg.globalApiKey

  if (!baseUrl?.trim()) {
    return {
      stations: [
        {
          configId: '__auto__',
          name: '自动探测',
          isActive: true,
          siteType: 'one-api',
          ok: false,
          message: '未配置 API 地址，请在设置中配置 Base URL 或添加余额查询配置',
          errorCode: 'no_base_url',
        },
      ],
    }
  }

  const res = await fetchAutoDetect(baseUrl, apiKey)
  return {
    stations: [
      {
        configId: '__auto__',
        name: '全局 API',
        remark: baseUrl,
        isActive: true,
        siteType: res.ok && 'detectedSiteType' in res ? res.detectedSiteType : 'one-api',
        ...res,
      },
    ],
    ...(res.ok && res.balanceUSD !== undefined
      ? { totalUSD: res.balanceUSD, totalCNY: res.balanceCNY }
      : {}),
  }
}

// ── 按配置查询 ────────────────────────────────────────────────────────────────

async function fetchWithConfig(config: BalanceConfig): Promise<BalanceResult> {
  try {
    const base = normalizeBaseUrl(config.baseUrl)
    const siteType = (config.siteType || 'one-api') as SiteType
    const preset = SITE_PRESETS[siteType]

    if (!base) {
      return { ok: false, message: `配置 "${config.name}" 缺少查询地址`, errorCode: 'no_base_url' }
    }

    // ── Step 1: 并行获取站点状态（汇率）和余额 ─────────────────────────────
    let dynamicRate: number | undefined
    let rateSource: string | undefined

    if (preset?.statusPath) {
      const siteStatus = await fetchSiteStatus(base, siteType)
      if (siteStatus?.exchangeRate) {
        dynamicRate = siteStatus.exchangeRate
        rateSource = siteStatus.exchangeRateSource
      }
    }

    // ── Step 2: 查询余额 ────────────────────────────────────────────────────
    const path = normalizeEndpointPath(config.path || preset?.path || '/api/user/self')
    const method = config.method || preset?.method || 'GET'
    const endpoint = buildBalanceEndpoint({ ...config, path }, preset?.path)

    // 构建请求头
    const reqHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(config.headers || {}),
    }

    // 认证
    const authHeader = getBalanceAuthHeader(config)
    if (authHeader) {
      reqHeaders['Authorization'] = authHeader
    }
    applyBalanceUserHeaders(reqHeaders, config)

    // POST 请求体
    let body: string | undefined
    if (method === 'POST' && config.bodyTemplate) {
      body = applyBalanceTemplate(config.bodyTemplate, config)
    }

    // 发请求（通过代理绕过 CORS）
    const result = await proxyFetch(endpoint, {
      method,
      headers: reqHeaders,
      body,
      timeout: 15000,
    })

    if (result.error) {
      return { ok: false, message: `${config.name}: ${result.error}`, errorCode: 'network_error' }
    }

    if (!result.ok) {
      const text = typeof result.data === 'string' ? result.data : JSON.stringify(result.data)
      const err = categorizeHttpError(result.status, text, config.name)
      return { ok: false, message: err.message, errorCode: err.errorCode }
    }

    const data = result.data
    if (!data || typeof data === 'string') {
      return { ok: false, message: `${config.name}: 响应不是有效的 JSON`, errorCode: 'invalid_json' }
    }

    // 检查 API 层面是否返回错误
    const apiObj = data as Record<string, unknown>
    if (apiObj.success === false) {
      return {
        ok: false,
        message: `${config.name}: ${apiObj.message || '接口返回失败'}`,
        errorCode: 'api_error',
      }
    }

    // 提取余额（使用动态汇率）
    const balanceResult = extractAndFormatBalance(data, siteType, dynamicRate, rateSource)

    if (balanceResult.balanceUSD !== undefined) {
      return { ok: true as const, data, ...balanceResult, detectedSiteType: siteType }
    }

    // 没有找到余额字段，但请求成功了
    return {
      ok: true as const,
      data,
      formatted: '无法解析余额字段',
      detectedSiteType: siteType,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const isTimeout = msg.includes('timeout') || msg.includes('Timeout')
    const isNetwork = msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('fetch failed')

    return {
      ok: false,
      message: `${config.name}: ${msg}`,
      errorCode: isTimeout ? 'timeout' : isNetwork ? 'network_error' : 'network_error',
    }
  }
}

// ── 自动探测查询 ──────────────────────────────────────────────────────────────

/**
 * 用全局 baseUrl + apiKey 自动探测余额
 * 借鉴 all-api-hub 的三层降级策略：
 * 1. 先查 /api/status 获取站点信息（无需认证）
 * 2. 再查 /api/user/self 获取余额
 * 3. 尝试其他端点兜底
 */
async function fetchAutoDetect(baseUrl: string, apiKey: string): Promise<BalanceResult> {
  const base = normalizeBaseUrl(baseUrl)
  if (!base) return { ok: false, message: '请先配置 API 地址', errorCode: 'no_base_url' }

  const reqHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(apiKey?.trim() ? { Authorization: `Bearer ${apiKey.trim()}` } : {}),
  }

  // ── Phase 1: 尝试从 /api/status 获取站点信息（公开端点，无需认证）─────────
  let dynamicRate: number | undefined
  let rateSource: string | undefined
  let detectedSiteType: string = 'one-api'

  try {
    const statusResult = await proxyFetch(`${base}/api/status`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      timeout: 8000,
    })

    if (statusResult.ok && statusResult.data && typeof statusResult.data !== 'string') {
      const statusData = statusResult.data as Record<string, unknown>
        const rate = extractNewApiExchangeRate(statusData)
        if (rate !== null && rate > 0) {
          dynamicRate = rate
          rateSource = '站点配置'
        }

        // 尝试从 status 数据推断站点类型
        const inner = (statusData.data && typeof statusData.data === 'object')
          ? statusData.data as Record<string, unknown>
          : statusData

        // Veloera 特征: 有 app 前缀路径
        if (typeof inner.system_name === 'string') {
          const sysName = inner.system_name.toLowerCase()
          if (sysName.includes('veloera')) detectedSiteType = 'veloera'
          else if (sysName.includes('one-hub') || sysName.includes('onehub')) detectedSiteType = 'one-hub'
          else if (sysName.includes('done-hub') || sysName.includes('donehub')) detectedSiteType = 'done-hub'
          else if (sysName.includes('new-api') || sysName.includes('newapi')) detectedSiteType = 'new-api'
        }
    }
  } catch {
    // status 端点不可用，继续
  }

  // ── Phase 2: 按优先级尝试余额查询端点 ───────────────────────────────────
  const probePaths = [
    { path: '/api/user/self', siteType: detectedSiteType as SiteType },    // One API / New API / One Hub 等
    { path: '/api/v1/auth/me', siteType: 'sub2api' as SiteType },          // Sub2API
    { path: '/v1/dashboard/billing/credit_grants', siteType: 'one-api' as SiteType }, // OpenAI 官方（走通用提取）
  ]

  for (const { path, siteType } of probePaths) {
    try {
      const probeResult = await proxyFetch(`${base}${path}`, {
        method: 'GET',
        headers: reqHeaders,
        timeout: 10000,
      })

      // 401/403 说明端点存在但认证失败，返回明确的错误
      if (probeResult.status === 401 || probeResult.status === 403) {
        const errBody = typeof probeResult.data === 'string' ? probeResult.data : JSON.stringify(probeResult.data)
        const err = categorizeHttpError(probeResult.status, errBody, base)
        return { ok: false, ...err }
      }

      if (probeResult.status === 404) continue
      if (!probeResult.ok) continue

      const data = probeResult.data
      if (!data || typeof data === 'string') continue

      // 检查 API 是否返回成功
      const apiObj = data as Record<string, unknown>
      if (apiObj.success === false) continue

      // 提取余额（使用动态汇率）
      const probeBalance = extractAndFormatBalance(data, siteType, dynamicRate, rateSource)

      if (probeBalance.balanceUSD !== undefined) {
        return { ok: true as const, data, ...probeBalance, detectedSiteType: siteType }
      }
    } catch {
      continue
    }
  }

  return {
    ok: false,
    message: '未找到余额查询接口，请在设置中手动添加余额查询配置',
    errorCode: 'not_found',
  }
}
