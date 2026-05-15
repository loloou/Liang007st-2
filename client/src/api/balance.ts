import { getApiConfig, getActiveImageModel, type BalanceConfig } from "./settings";

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/$/, "");
}

/** 常见余额查询路径 */
const BALANCE_PATHS = ["/v1/balance", "/v1/user/balance", "/balance", "/api/balance", "/api/user/self"];

/** 免费 CORS 代理列表 */
const CORS_PROXIES = [
  "https://api.allorigins.win/raw?url=",
  "https://cors-anywhere.herokuapp.com/",
];

export type BalanceResult = { ok: true; data: unknown; balance?: number; formatted?: string } | { ok: false; message: string };

/**
 * 从响应数据中提取余额值
 * 支持多种格式：quota, balance, credit, amount, remaining 等
 */
function extractBalance(data: unknown): { balance?: number; formatted?: string } {
  if (typeof data !== "object" || data === null) {
    return {};
  }

  const obj = data as Record<string, unknown>;
  
  // 尝试多种常见的余额字段名
  const balanceValue = 
    obj.quota ?? 
    obj.balance ?? 
    obj.credit ?? 
    obj.amount ?? 
    obj.remaining ?? 
    obj.total_balance ??
    obj.available_balance;

  if (typeof balanceValue === "number") {
    // 格式化余额显示
    const formatted = balanceValue >= 1 
      ? `¥${balanceValue.toFixed(2)}`
      : `${(balanceValue * 1000).toFixed(0)} 积分`;
    
    return { balance: balanceValue, formatted };
  }

  return {};
}

/**
 * 查询余额：
 * 1. 若 ApiConfig 配置了 balanceConfigs，则使用激活的配置
 * 2. 否则用服务商余额查询
 */
export async function fetchBalance(): Promise<BalanceResult> {
  const cfg = getApiConfig();

  // 优先查自定义余额配置
  if (cfg.balanceConfigs && cfg.balanceConfigs.length > 0) {
    const activeConfig = cfg.activeBalanceConfigId
      ? cfg.balanceConfigs.find(c => c.id === cfg.activeBalanceConfigId)
      : cfg.balanceConfigs.find(c => c.isDefault);
    
    if (activeConfig) {
      // 如果是 GET 请求且没有配置 userId/token，直接使用 API Key
      if (activeConfig.method === "GET" && !activeConfig.userId?.trim()) {
        return fetchCustomBalance(activeConfig);
      }
      // 如果是 POST 请求且配置了 userId/token
      if (activeConfig.method === "POST" && activeConfig.userId?.trim() && activeConfig.token?.trim()) {
        return fetchCustomBalance(activeConfig);
      }
    }
  }

  // 回退服务商余额
  const active = getActiveImageModel(cfg);
  const baseUrl = active.baseUrl || cfg.globalBaseUrl;
  const apiKey = active.apiKey || cfg.globalApiKey;
  return fetchServiceBalance(baseUrl, apiKey);
}

async function fetchCustomBalance(config: BalanceConfig): Promise<BalanceResult> {
  try {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
      ...(config.headers || {})
    };

    // 如果配置了 token，添加到 Authorization header
    if (config.token?.trim() && !headers["Authorization"]) {
      headers["Authorization"] = `Bearer ${config.token.trim()}`;
    }

    let body: string | undefined;
    if (config.method === "POST" && config.bodyTemplate) {
      // 替换占位符
      body = config.bodyTemplate
        .replace(/\{\{userId\}\}/g, config.userId || "")
        .replace(/\{\{token\}\}/g, config.token || "");
    }

    let endpoint = config.endpoint;
    
    // 如果启用 CORS 代理，尝试多个代理
    if (config.useCorsProxy) {
      for (const proxy of CORS_PROXIES) {
        try {
          const proxyEndpoint = proxy + encodeURIComponent(config.endpoint);
          const resp = await fetch(proxyEndpoint, {
            method: config.method,
            headers,
            body,
            signal: AbortSignal.timeout(10000)
          });

          if (resp.ok) {
            const text = await resp.text();
            try {
              const data = JSON.parse(text);
              const { balance, formatted } = extractBalance(data);
              return { ok: true, data, balance, formatted };
            } catch {
              // 响应不是 JSON，返回原始文本
              return { ok: true, data: text };
            }
          }
        } catch {
          // 尝试下一个代理
          continue;
        }
      }
      // 所有代理都失败，返回错误
      return { 
        ok: false, 
        message: `${config.name} 通过 CORS 代理查询失败，请检查端点是否正确或尝试禁用 CORS 代理` 
      };
    }

    const resp = await fetch(endpoint, {
      method: config.method,
      headers,
      body,
      signal: AbortSignal.timeout(15000)
    });

    if (resp.ok) {
      const text = await resp.text();
      try {
        const data = JSON.parse(text);
        const { balance, formatted } = extractBalance(data);
        return { ok: true, data, balance, formatted };
      } catch {
        // 响应不是 JSON，返回原始文本
        return { ok: true, data: text };
      }
    }

    const text = await resp.text();
    // 检测是否是 HTML 响应
    const isHtml = text.trim().startsWith("<");
    const preview = isHtml ? "（HTML 响应，可能是错误页面）" : text.slice(0, 120);
    return { 
      ok: false, 
      message: `${config.name} 余额查询失败: HTTP ${resp.status} ${preview}` 
    };
  } catch (err) {
    return { 
      ok: false, 
      message: `${config.name} 余额查询失败: ${err instanceof Error ? err.message : String(err)}` 
    };
  }
}

async function fetchServiceBalance(baseUrl: string, apiKey: string): Promise<BalanceResult> {
  const base = normalizeBaseUrl(baseUrl);
  if (!base) return { ok: false, message: "请先配置 API 地址" };
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(apiKey?.trim() ? { Authorization: `Bearer ${apiKey.trim()}` } : {})
  };

  for (const path of BALANCE_PATHS) {
    try {
      const resp = await fetch(`${base}${path}`, { method: "GET", headers });
      if (resp.ok) {
        const text = await resp.text();
        try {
          const data = JSON.parse(text);
          const { balance, formatted } = extractBalance(data);
          return { ok: true, data, balance, formatted };
        } catch {
          // 响应不是 JSON，返回原始文本
          return { ok: true, data: text };
        }
      }
      if (resp.status === 404) continue;
      const text = await resp.text();
      return { ok: false, message: `HTTP ${resp.status}: ${text.slice(0, 80)}` };
    } catch {
      continue;
    }
  }
  return { ok: false, message: "未找到余额查询接口" };
}
