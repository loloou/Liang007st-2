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

import {
  getApiConfig,
  getActiveImageModel,
  getApiSettings,
  resolveApiSpec,
  type ApiSpec,
  type ImageModel,
  type ApiConfig
} from "./settings";
import { type ResolutionPresetId, type SizeTierId } from "../utils/resolutionPresets";

// ── 请求参数类型 ──────────────────────────────────────────
export type GenerateParams = {
  prompt: string;
  negativePrompt?: string;
  batchSize: number;
  width: number;
  height: number;
  model: string;
  referenceImages: File[];
  /** 当前比例预设（用于 Gemini 规范精准 aspectRatio 传参） */
  resolutionPreset?: ResolutionPresetId;
  /** 当前尺寸档位（用于 Gemini 规范精准 imageSize 传参） */
  sizeTier?: SizeTierId;
};

// ── 返回图片类型 ──────────────────────────────────────────
export type GeneratedImage = {
  id: string;
  url: string;
};

// ── 常量 ──────────────────────────────────────────────────
/** Gemini 规范默认模型（用于 baseUrl 中没有指定模型时的接口路径） */
const GEMINI_DEFAULT_MODEL = "gemini-2.0-flash-preview-image-generation";

// ── 工具函数 ──────────────────────────────────────────────

/** 从配置中获取 baseUrl */
function getApiBaseUrl(): string {
  const cfg = getApiConfig();
  const active = getActiveImageModel(cfg);
  if (active.baseUrl?.trim()) return active.baseUrl.trim();
  return import.meta.env.VITE_API_BASE_URL ?? "";
}

/**
 * 构建 OpenAI 规范 endpoint：
 *   baseUrl → {baseUrl}/v1/images/generations
 *   已含完整路径则直接使用
 */
function buildOpenAIEndpoint(baseUrl: string): string {
  const clean = baseUrl.replace(/\/$/, "");
  if (/\/images\/generations\/?$/i.test(clean)) return clean;
  if (/\/generate\/?$/i.test(clean)) return clean;
  if (/\/v1\/?$/i.test(clean)) return `${clean.replace(/\/v1\/?$/, "")}/v1/images/generations`;
  return `${clean}/v1/images/generations`;
}

/**
 * 构建 Gemini 规范 endpoint：
 *   {baseUrl}/v1beta/models/{modelId}:generateContent
 *   若 baseUrl 已包含完整 Gemini 路径则直接使用
 */
function buildGeminiEndpoint(baseUrl: string, modelId: string): string {
  const clean = baseUrl.replace(/\/$/, "");
  if (/generateContent\/?$/i.test(clean)) return clean;
  // 修复：modelId 为空时必须回退到默认模型，否则会生成 /v1beta/models/:generateContent 的错误路径
  const resolvedModelId = modelId.trim() || GEMINI_DEFAULT_MODEL;
  // 移除已有的 /v1beta 前缀防止重复
  const base = clean.replace(/\/v1beta\/?$/, "");
  return `${base}/v1beta/models/${resolvedModelId}:generateContent`;
}

/** 根据规范选择 endpoint 构建策略 */
function buildEndpoint(baseUrl: string, spec: ApiSpec, modelId: string): string {
  if (spec === "gemini") return buildGeminiEndpoint(baseUrl, modelId);
  return buildOpenAIEndpoint(baseUrl);
}

/** OpenAI 支持的固定尺寸列表（按宽高比分组） */
const OPENAI_SUPPORTED_SIZES = [
  { label: "1:1",  width: 1024, height: 1024 },
  { label: "land", width: 1792, height: 1024 },
  { label: "port", width: 1024, height: 1792 },
] as const;
type OpenAISizeLabel = (typeof OPENAI_SUPPORTED_SIZES)[number]["label"];

/**
 * 任意宽高 → OpenAI API 支持的最近尺寸字符串
 * OpenAI 不支持任意尺寸如 3840×2160，必须映射到固定档位
 */
function toOpenAISizeString(width: number, height: number): string {
  const isPortrait  = height > width;
  const isLandscape = width > height;

  if (width === height) return "1024x1024";
  if (isLandscape)     return "1792x1024";
  return "1024x1792";
}

/**
 * width × height → Gemini aspectRatio（精确映射）
 * 官方支持 10 种比例：1:1 / 16:9 / 9:16 / 4:3 / 3:4 / 21:9 / 3:2 / 2:3 / 5:4 / 4:5
 * presetId 存在时直接用预设 ratio；fallback 时通过宽高比像素值映射
 */
function toAspectRatio(width: number, height: number, presetId?: string): string {
  // Gemini 官方支持的 10 种比例
  const GEMINI_RATIOS = [
    "1:1", "16:9", "9:16", "4:3", "3:4",
    "21:9", "3:2", "2:3", "5:4", "4:5"
  ] as const;

  // 精确预设直接返回
  if (presetId && presetId !== "original") {
    if ((GEMINI_RATIOS as readonly string[]).includes(presetId)) return presetId;
    // 不支持的预设映射到最近似值
    const ratioMap: Record<string, string> = {
      "9:21": "9:16",  // 超竖 → 竖屏最接近
    };
    if (ratioMap[presetId]) return ratioMap[presetId];
    // 其余全部走像素比 fallback
  }

  // 按像素比映射（阈值参考官方 4K 尺寸表）
  const ratio = width / height;

  // 横向
  if (ratio > 2.1)    return "21:9";  // ~2.333
  if (ratio > 1.55)   return "16:9";  // ~1.778
  if (ratio > 1.25)   return "4:3";   // ~1.333
  if (ratio > 1.05)   return "5:4";   // ~1.25
  // 正方形
  if (ratio >= 0.95)  return "1:1";

  // 纵向
  if (ratio > 0.85)  return "4:5";   // ~0.8
  if (ratio > 0.65)  return "3:4";   // ~0.75
  if (ratio > 0.52)  return "2:3";   // ~0.667
  return "9:16";                      // ~0.5625
}

/**
 * SizeTierId → Gemini imageSize 档位值
 * 官方规范：imageSize 必须是 "1K" | "2K" | "4K"（大写 K）
 * 不支持传像素尺寸如 "4096x4096"
 */
function toGeminiImageSize(sizeTier?: string): string | undefined {
  if (!sizeTier) return undefined;
  const map: Record<string, string> = { "1K": "1K", "2K": "2K", "4K": "4K" };
  return map[sizeTier];
}

/** File → Base64 data URL 字符串（去掉前缀，只留 base64 数据） */
async function fileToBase64(file: File): Promise<{ mimeType: string; data: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const [header, data] = result.split(",");
      const mimeMatch = header.match(/data:([^;]+)/);
      resolve({ mimeType: mimeMatch?.[1] || file.type || "image/png", data: data ?? "" });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** 判断响应内容是否为 HTML */
function isHtmlContent(text: string): boolean {
  const t = text.trimStart().toLowerCase();
  return t.startsWith("<!doctype") || t.startsWith("<html");
}

/** 安全解析 JSON */
function safeParseJson(text: string): unknown | null {
  try { return JSON.parse(text); } catch { return null; }
}

/**
 * 从已解析 JSON 中提取可读错误描述，防止 [object Object]。
 * 支持：{ message }、{ error }、{ error.message }、{ detail }、FastAPI 数组
 */
function extractErrorMessage(parsed: unknown, rawFallback: string): string {
  if (!parsed || typeof parsed !== "object") return rawFallback;
  const obj = parsed as Record<string, unknown>;

  function stringify(val: unknown): string {
    if (typeof val === "string") return val;
    if (typeof val === "number" || typeof val === "boolean") return String(val);
    if (Array.isArray(val)) {
      const msgs = val.map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object") {
          const o = item as Record<string, unknown>;
          return String(o.msg ?? o.message ?? o.detail ?? JSON.stringify(item));
        }
        return String(item);
      }).filter(Boolean);
      return msgs.join("；") || JSON.stringify(val);
    }
    if (typeof val === "object" && val !== null) {
      const o = val as Record<string, unknown>;
      if (o.message) return stringify(o.message);
      if (o.msg) return stringify(o.msg);
      if (o.detail) return stringify(o.detail);
      return JSON.stringify(val);
    }
    return String(val);
  }

  for (const key of ["message", "error", "detail", "msg", "reason", "description"]) {
    if (obj[key] !== undefined) {
      const r = stringify(obj[key]);
      if (r) return r;
    }
  }
  return rawFallback || JSON.stringify(parsed);
}

/** 从 OpenAI 兼容格式响应中提取图片列表 */
function extractImagesOpenAI(data: unknown): GeneratedImage[] | null {
  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;

  // { data: [{ url | b64_json }] }
  if (Array.isArray(obj.data) && obj.data.length > 0) {
    const first = obj.data[0] as Record<string, unknown>;
    if (typeof first.url === "string" || typeof first.b64_json === "string") {
      return (obj.data as { url?: string; b64_json?: string }[]).map((item, idx) => ({
        id: String(idx),
        url: item.url ?? (item.b64_json ? `data:image/png;base64,${item.b64_json}` : "")
      }));
    }
  }
  // { images: string[] }
  if (Array.isArray(obj.images) && obj.images.length > 0) {
    if (typeof obj.images[0] === "string")
      return (obj.images as string[]).map((url, idx) => ({ id: String(idx), url }));
    return (obj.images as { id?: string; url: string }[]).map((img, idx) => ({
      id: img.id ?? String(idx), url: img.url
    }));
  }
  // 直接数组
  if (Array.isArray(data) && data.length > 0) {
    if (typeof data[0] === "string")
      return (data as string[]).map((url, idx) => ({ id: String(idx), url }));
    if (typeof (data[0] as Record<string, unknown>).url === "string")
      return (data as { id?: string; url: string }[]).map((img, idx) => ({
        id: img.id ?? String(idx), url: img.url
      }));
  }
  return null;
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
  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;
  const candidates = obj.candidates as unknown[] | undefined;
  if (!Array.isArray(candidates) || candidates.length === 0) return null;

  const images: GeneratedImage[] = [];
  let idx = 0;

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const content = (candidate as Record<string, unknown>).content as Record<string, unknown> | undefined;
    if (!content) continue;
    const parts = content.parts as unknown[] | undefined;
    if (!Array.isArray(parts)) continue;

    for (const part of parts) {
      if (!part || typeof part !== "object") continue;
      const partObj = part as Record<string, unknown>;

      // 优先：inlineData.base64（原生 Gemini 图生图格式）
      const inlineData = partObj.inlineData as Record<string, unknown> | undefined;
      if (inlineData) {
        const mimeType = (inlineData.mimeType as string) ?? "image/png";
        const b64data = inlineData.data as string | undefined;
        if (b64data) {
          images.push({ id: String(idx++), url: `data:${mimeType};base64,${b64data}` });
          continue;
        }
      }

      // 兜底：text 字段里含 markdown 图片语法 `![](url)`
      const text = partObj.text as string | undefined;
      if (text) {
        const mdMatches = [...text.matchAll(/!\[.*?\]\((https?:\/\/[^\s)]+\.(?:jpg|jpeg|png|gif|webp)[^\s)]*)\)/gi)];
        for (const m of mdMatches) {
          images.push({ id: String(idx++), url: m[1] });
        }
        // 直接是图片 URL（非 markdown 语法）
        if (mdMatches.length === 0) {
          const urlMatch = text.match(/^(https?:\/\/[^\s]+)$/i);
          if (urlMatch) {
            const u = urlMatch[1];
            if (/\.(?:jpg|jpeg|png|gif|webp)(?:\?|$)/i.test(u)) {
              images.push({ id: String(idx++), url: u });
            }
          }
        }
      }
    }
  }

  return images.length > 0 ? images : null;
}

// ── 构造请求体 ────────────────────────────────────────────

/** 构造 OpenAI 规范请求体 */
async function buildOpenAIBody(params: GenerateParams, resolvedModel: string): Promise<Record<string, unknown>> {
  const hasRef = params.referenceImages.length > 0;

  if (hasRef) {
    // 参考图存在：使用 messages 格式，支持 image_url
    const messageParts: Record<string, unknown>[] = [];

    // 参考图 → base64 image_url
    const imageUrls: string[] = [];
    for (const file of params.referenceImages.slice(0, 4)) {
      try {
        const { mimeType, data } = await fileToBase64(file);
        imageUrls.push(`data:${mimeType};base64,${data}`);
      } catch {/* 跳过无法读取的文件 */}
    }

    // 参考图 content
    const imageContents = imageUrls.map((url) => ({ type: "image_url" as const, image_url: { url } }));
    // prompt content（支持多段）
    const promptParts: Record<string, unknown>[] = [{ type: "text" as const, text: params.prompt }];

    const messages: Record<string, unknown>[] = [
      { role: "user", content: [...imageContents, ...promptParts] }
    ];

    const body: Record<string, unknown> = {
      model: resolvedModel,
      messages,
      size: toOpenAISizeString(params.width, params.height),
      n: params.batchSize
    };
    if (params.negativePrompt?.trim()) body.negative_prompt = params.negativePrompt.trim();
    return body;
  }

  // 无参考图：简洁 prompt 格式
  const body: Record<string, unknown> = {
    model: resolvedModel,
    prompt: params.prompt,
    size: toOpenAISizeString(params.width, params.height),
    n: params.batchSize
  };
  if (params.negativePrompt?.trim()) body.negative_prompt = params.negativePrompt.trim();
  return body;
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
  const textParts: unknown[] = [{ text: params.prompt }];
  if (params.negativePrompt?.trim()) {
    textParts.push({ text: `Negative prompt: ${params.negativePrompt.trim()}` });
  }

  // 参考图 → Base64 inlineData
  const imageParts: unknown[] = [];
  for (const file of params.referenceImages.slice(0, 4)) {
    try {
      const { mimeType, data } = await fileToBase64(file);
      imageParts.push({ inlineData: { mimeType, data } });
    } catch {/* 跳过无法读取的文件 */}
  }

  // ── aspectRatio：精确映射到 Gemini 支持的 10 种标准比例 ──────────────────
  const aspectRatio = toAspectRatio(params.width, params.height, params.resolutionPreset);
  const imageSize = toGeminiImageSize(params.sizeTier);
  // Gemini 官方规范：aspectRatio 和 imageSize 必须放在 generationConfig.imageConfig 内
  const generationConfig: Record<string, unknown> = {
    // 纯图生图模型不带 responseModalities（或仅 IMAGE），带 TEXT 会导致挂起超时
  };
  generationConfig.imageConfig = { aspectRatio };
  // imageSize 仅在非空时传入（1K/2K/4K）
  if (imageSize) {
    (generationConfig.imageConfig as Record<string, unknown>).imageSize = imageSize;
  }

  return {
    contents: [{
      parts: [...textParts, ...imageParts]
    }],
    generationConfig
  };
}

// ── 核心生图接口 ──────────────────────────────────────────

/** generateImages 返回值，包含图片列表与详细请求日志；失败时 images=[] 同时附上 error 字段 */
export type GenerateResult = {
  images: GeneratedImage[];
  /** 完整请求 endpoint */
  endpoint: string;
  /** 接口规范 */
  spec: ApiSpec;
  /** 完整请求体（JSON 字符串） */
  requestBodyJson: string;
  /** HTTP 状态码 */
  httpStatus: number;
  /** 响应原始文本摘要（最多 2000 字符） */
  responseSummary: string;
  /** 响应是否为有效 JSON */
  jsonValid: boolean;
  /** 失败时包含错误信息 */
  error?: string;
  /** 失败时的 HTTP 响应体原始文本 */
  httpErrorBody?: string;
};

/** 构造失败结果对象（替代 throw），确保详细日志有完整上下文 */
function errResult(
  endpoint: string, spec: ApiSpec, requestBodyJson: string,
  message: string, httpStatus = 0, httpErrorBody?: string
): GenerateResult {
  return { images: [], endpoint, spec, requestBodyJson, httpStatus, responseSummary: "", jsonValid: false, error: message, httpErrorBody };
}

export async function generateImages(params: GenerateParams): Promise<GenerateResult> {
  const API_BASE_URL = getApiBaseUrl();
  if (!API_BASE_URL) {
    return errResult("", "openai" as ApiSpec, "", "请在「设置」中配置生图 API 地址后再生成。");
  }

  const cfg = getApiConfig();
  const activeInfo = getActiveImageModel(cfg);
  const apiKey = activeInfo.apiKey || "";
  const apiValidateJson = cfg.apiValidateJson ?? true;
  const spec = activeInfo.spec;

  // model 优先用 UI 传入值，回退激活模型 modelId
  const resolvedModel =
    params.model?.trim() ||
    activeInfo.model?.modelId?.trim() ||
    "";

  const endpoint = buildEndpoint(API_BASE_URL, spec, resolvedModel);

  // ── Gemini 规范：每次只返回 1 张，需循环调用 batchSize 次 ──────────────
  // 修复：使用 Promise.allSettled 并发调用，某张失败不影响其他；
  //       通过 params 透传已快照的参数，避免子调用重读 localStorage 导致配置不一致
  if (spec === "gemini" && params.batchSize > 1) {
    const tasks = Array.from({ length: params.batchSize }, (_, i) =>
      generateImages({ ...params, batchSize: 1 }).then((r) => ({
        ...r,
        images: r.images.map((img) => ({ ...img, id: `${i}-${img.id}` }))
      }))
    );
    const settled = await Promise.allSettled(tasks);

    const allImages: GeneratedImage[] = [];
    let lastResult: GenerateResult | null = null;
    let failedCount = 0;

    for (const s of settled) {
      if (s.status === "fulfilled" && !s.value.error) {
        allImages.push(...s.value.images);
        lastResult = s.value;
      } else {
        failedCount++;
        if (!lastResult) lastResult = s.status === "fulfilled" ? s.value : null;
      }
    }

    // 全部失败时返回第一个错误结果
    if (allImages.length === 0 && lastResult) {
      return { ...lastResult, images: [], responseSummary: `共调用 ${params.batchSize} 次，成功 0 张，失败 ${failedCount} 张` };
    }

    return {
      images: allImages,
      endpoint: lastResult?.endpoint ?? "",
      spec,
      requestBodyJson: lastResult?.requestBodyJson ?? "",
      httpStatus: lastResult?.httpStatus ?? 200,
      responseSummary: `共调用 ${params.batchSize} 次，成功 ${allImages.length} 张${failedCount > 0 ? `，失败 ${failedCount} 张` : ""}`,
      jsonValid: lastResult?.jsonValid ?? true
    };
  }

  // ── 构造请求体 ──────────────────────────────────────────
  let requestBody: Record<string, unknown>;
  if (spec === "gemini") {
    requestBody = await buildGeminiBody(params);
  } else {
    requestBody = await buildOpenAIBody(params, resolvedModel);
  }

  // ── 请求头 ──────────────────────────────────────────────
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    Accept: "application/json"
  };
  if (apiKey?.trim()) headers["Authorization"] = `Bearer ${apiKey.trim()}`;

  // 请求体 JSON 字符串（用于日志，参考图 base64 截断）
  const requestBodyForLog = JSON.stringify(requestBody, (key, value) => {
    // Gemini inlineData.data
    if (key === "data" && typeof value === "string" && value.length > 100) {
      return `[base64 data, ${value.length} chars]`;
    }
    // OpenAI image_url data URI
    if (key === "url" && typeof value === "string" && value.startsWith("data:")) {
      const base64 = value.split(",")[1] ?? "";
      if (base64.length > 100) {
        return `data:${value.split(",")[0]};base64,[${base64.length} chars]`;
      }
    }
    return value;
  }, 2);

  // ── 请求 + 超时（600s）──────────────────────────────────
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 600_000);

  let resp: Response;
  let rawText: string;
  try {
    resp = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });
    // 修复：resp.text() 也可能抛异常（网络中断等），必须在 finally 中清理 timer
    rawText = await resp.text();
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof DOMException && err.name === "AbortError") {
      const specLabel = spec === "gemini" ? "Gemini 规范" : "OpenAI 规范";
      const displayEndpoint = endpoint || "(未构建)";
      return errResult(
        endpoint, spec, requestBodyForLog,
        `❌ API 对接失败：请求超时（600s）\n` +
        `\n📌 错误详情：接口 ${displayEndpoint} 在 600 秒内未响应\n\n` +
        `🔍 排查建议：\n` +
        `· 确认接口地址是否正确且可访问\n` +
        `· 检查服务器端是否存在负载过高或死循环\n` +
        `· 验证网络代理 / VPN 设置是否影响连接\n` +
        `· 尝试用浏览器直接访问该地址测试\n\n` +
        `🌐 请求地址：${displayEndpoint}\n` +
        `📦 规范类型：${specLabel}`
      );
    }
    return errResult(
      endpoint, spec, requestBodyForLog,
      `API 对接失败：网络请求异常，请检查接口地址 / 密钥是否正确。\n详情：${
        err instanceof Error ? err.message : String(err)
      }`
    );
  } finally {
    clearTimeout(timer);
  }
  const contentType = resp.headers.get("content-type") ?? "";
  const httpStatus = resp.status;

  // HTML 响应 → 地址/密钥有误
  if (contentType.includes("text/html") || isHtmlContent(rawText)) {
    return errResult(
      endpoint, spec, requestBodyForLog,
      `API 返回了 HTML 页面而非 JSON，请确认：\n` +
      `· 接口地址是否正确（当前：${endpoint}）\n` +
      `· API 密钥是否有效\n` +
      `· 接口路径 / 格式是否匹配\n` +
      `HTTP ${resp.status}  Content-Type: ${contentType || "未知"}`,
      resp.status, rawText.slice(0, 500)
    );
  }

  // 非 2xx 错误：按状态码分类给出具体排查提示
  if (!resp.ok) {
    const parsed = safeParseJson(rawText);
    const detail = extractErrorMessage(parsed, rawText || `HTTP ${resp.status}`);
    const rawSnippet = rawText.slice(0, 200);

    const specLabel = spec === "gemini" ? "Gemini 规范" : "OpenAI 规范";
    const specPath  = spec === "gemini"
      ? "/v1beta/models/.../generateContent"
      : "/v1/images/generations";

    let hint = "";
    switch (resp.status) {
      case 400: // Bad Request
        hint = `请求参数有误，请检查：\n` +
          `· 提示词是否包含特殊字符或过长\n` +
          `· 分辨率 / 比例参数是否符合 ${specLabel} 支持范围\n` +
          `· 模型 ID（${resolvedModel || "未指定"}）是否正确`;
        break;
      case 401:
      case 403:
        hint = `认证失败，请检查：\n` +
          `· API 密钥是否已填写且有效\n` +
          `· 密钥是否已过期或被禁用\n` +
          `· 是否开通了对应模型的访问权限`;
        break;
      case 404:
        hint = `接口地址不存在，请确认：\n` +
          `· BaseUrl 是否正确（当前：${endpoint.replace(/\/[^/]+\/?$/, "")}）\n` +
          `· 模型 ID 是否存在（当前：${resolvedModel || "未指定"}）`;
        break;
      case 408:
        hint = "请求超时，请检查网络连接或接口是否响应缓慢";
        break;
      case 429:
        hint = `请求被限流（Too Many Requests），请：\n` +
          `· 稍等片刻后重试\n` +
          `· 降低生图频率或减少 batchSize\n` +
          `· 检查 API 配额是否已用尽`;
        break;
      case 500:
      case 502:
      case 503:
      case 504:
        hint = `上游服务异常（HTTP ${resp.status}），请：\n` +
          `· 等待片刻后重试\n` +
          `· 联系 API 提供方确认服务状态`;
        break;
      default:
        hint = `请检查：\n` +
          `· 接口地址是否正确（${specPath}）\n` +
          `· API 密钥是否有效\n` +
          `· 接口服务是否支持 ${specLabel}`;
    }

    return errResult(
      endpoint, spec, requestBodyForLog,
      `❌ API 对接失败（HTTP ${resp.status}）\n` +
      `📌 错误详情：${detail}\n\n` +
      `🔍 排查建议：\n${hint}\n\n` +
      `🌐 请求地址：${endpoint}\n` +
      `📦 规范类型：${specLabel}\n` +
      `🤖 模型 ID：${resolvedModel || "未指定"}\n` +
      (rawSnippet ? `📨 响应内容：${rawSnippet}` : ""),
      resp.status, rawText.slice(0, 500)
    );
  }

  // 解析 JSON
  const data = safeParseJson(rawText);
  if (!data) {
    return errResult(
      endpoint, spec, requestBodyForLog,
      `API 返回内容无法解析为 JSON。\n` +
      `响应预览：${rawText.slice(0, 300)}\n` +
      `请求地址：${endpoint}`,
      resp.status, rawText.slice(0, 500)
    );
  }

  // 按规范提取图片
  let images = spec === "gemini"
    ? extractImagesGemini(data)
    : extractImagesOpenAI(data);

  if (!images) {
    const hint = spec === "gemini"
      ? "期望 candidates[].content.parts[].inlineData.data"
      : "期望 data[].url 或 images[]";
    // 尝试用另一规范解析（容错）
    const fallback = spec === "gemini"
      ? extractImagesOpenAI(data)
      : extractImagesGemini(data);
    if (fallback && fallback.length > 0) {
      images = fallback;
    } else {
      return errResult(
        endpoint, spec, requestBodyForLog,
        `API 返回数据结构不符合预期（${hint}）。\n` +
        `实际返回：${rawText.slice(0, 300)}`,
        resp.status, rawText.slice(0, 500)
      );
    }
  }

  // 构建响应摘要（截断 base64，避免过长）
  let jsonValid = false;
  const responseSummary = (() => {
    try {
      const parsed2 = JSON.parse(rawText) as Record<string, unknown>;
      jsonValid = true;
      // 截断 inlineData.data (Gemini base64 图片)
      const cleaned = JSON.stringify(parsed2, (key, value) => {
        if (key === "data" && typeof value === "string" && value.length > 100) {
          return `[base64 image, ${value.length} chars]`;
        }
        if (key === "b64_json" && typeof value === "string" && value.length > 100) {
          return `[base64 image, ${value.length} chars]`;
        }
        return value;
      }, 2);
      return cleaned.slice(0, 2000) + (cleaned.length > 2000 ? "\n… (已截断)" : "");
    } catch {
      jsonValid = false;
      return rawText.slice(0, 2000) + (rawText.length > 2000 ? "\n… (已截断)" : "");
    }
  })();

  return {
    images,
    endpoint,
    spec,
    requestBodyJson: requestBodyForLog,
    httpStatus,
    responseSummary,
    jsonValid
  };
}

// ── 测试对接接口 ──────────────────────────────────────────

export type TestApiResult =
  | { ok: true; message: string }
  | { ok: false; message: string; detail?: string };

export async function testApiGenerate(
  baseUrl: string,
  apiKey: string,
  model?: string,
  spec?: ApiSpec
): Promise<TestApiResult> {
  const cfg = getApiConfig();
  const activeInfo = getActiveImageModel(cfg);
  const resolvedModel = model?.trim() || activeInfo.model?.modelId?.trim() || "";
  const resolvedSpec = spec ?? activeInfo.spec;

  const endpoint = buildEndpoint(baseUrl, resolvedSpec, resolvedModel);

  let testBody: Record<string, unknown>;
  if (resolvedSpec === "gemini") {
    // 与生产代码保持一致：aspectRatio 放在 imageConfig 内，不带 responseModalities
    testBody = {
      contents: [{ parts: [{ text: "__api_connectivity_test__" }] }],
      generationConfig: {
        imageConfig: { aspectRatio: "1:1" }
      }
    };
  } else {
    testBody = { prompt: "__api_connectivity_test__", size: "1024x1024", n: 1 };
    if (resolvedModel) testBody.model = resolvedModel;
  }

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    Accept: "application/json"
  };
  if (apiKey?.trim()) headers["Authorization"] = `Bearer ${apiKey.trim()}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);

  try {
    const resp = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(testBody),
      signal: controller.signal
    });
    clearTimeout(timer);

    const rawText = await resp.text();
    const contentType = resp.headers.get("content-type") ?? "";

    if (contentType.includes("text/html")) {
      return {
        ok: false,
        message: `接口返回了 HTML 页面（Content-Type: text/html），请确认地址 / 密钥 / 格式是否正确。`,
        detail: `实际请求地址：${endpoint}\nHTTP ${resp.status}\nContent-Type: ${contentType}\n\n排查提示：\n· BaseUrl 是否正确（支持填域名或完整接口地址）\n· API 密钥是否已填写且有效\n· 接口服务是否支持所选规范（${resolvedSpec === "gemini" ? "Gemini" : "OpenAI"}）格式`
      };
    }

    if (isHtmlContent(rawText)) {
      return {
        ok: false,
        message: `接口返回了 HTML 内容（非 JSON），请确认地址 / 密钥 / 格式是否正确。`,
        detail: `实际请求地址：${endpoint}\nHTTP ${resp.status}\n\n排查提示：\n· 确认 BaseUrl 填写正确\n· 确认 API 密钥有效\n· 接口路径已自动补全为 ${resolvedSpec === "gemini" ? "/v1beta/models/.../generateContent" : "/v1/images/generations"}`
      };
    }

    const parsed = safeParseJson(rawText);
    if (!parsed) {
      return {
        ok: false,
        message: `接口返回了非 JSON 内容（Content-Type: ${contentType || "未知"}），请确认地址 / 密钥 / 格式是否正确。`,
        detail: `实际请求地址：${endpoint}\n响应预览：${rawText.slice(0, 200)}`
      };
    }

    if (!resp.ok) {
      const errMsg = extractErrorMessage(parsed, rawText || `HTTP ${resp.status}`);
      const compatHint = resolvedSpec === "openai"
        ? `\n\n⚠ 当前 Base URL 可能不兼容 OpenAI 规范，请确认：\n1. 接口路径是否为 /v1/images/generations\n2. 请求体字段是否为 prompt/size 格式\n3. 若使用 Gemini 系列模型，请切换规范为「Gemini 规范」`
        : "";
      return {
        ok: false,
        message: `接口格式正常（返回 JSON），但请求被拒绝：${errMsg}`,
        detail: [
          `实际请求地址：${endpoint}`,
          `HTTP ${resp.status}  Content-Type: ${contentType}`,
          `接口规范：${resolvedSpec === "gemini" ? "Gemini" : "OpenAI"}`,
          resolvedModel ? `使用模型：${resolvedModel}` : `⚠ 未指定模型（请在主界面选择模型后再测试）`,
          `请求 Body：${JSON.stringify(testBody)}`,
          compatHint
        ].join("\n")
      };
    }

    return {
      ok: true,
      message: `接口联通且返回标准 JSON ✓\n实际请求地址：${endpoint}\n接口规范：${resolvedSpec === "gemini" ? "Gemini" : "OpenAI"}\nContent-Type: ${contentType || "application/json"}`
    };
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof DOMException && err.name === "AbortError") {
      return {
        ok: false,
        message: `❌ 测试超时（15s）：接口 ${endpoint || "(未构建)"} 在 15 秒内无响应`,
        detail: `排查：确认接口地址可访问、服务器无死循环、检查代理/VPN设置`
      };
    }
    return {
      ok: false,
      message: `网络请求失败：${err instanceof Error ? err.message : String(err)}`,
      detail: `实际请求地址：${endpoint}`
    };
  }
}
