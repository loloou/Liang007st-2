import { getApiConfig, getActiveImageModel } from "./settings";

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/$/, "");
}

/** 常见余额查询路径 */
const BALANCE_PATHS = ["/v1/balance", "/v1/user/balance", "/balance", "/api/balance"];

export type BalanceResult = { ok: true; data: unknown } | { ok: false; message: string };

/**
 * 尝试查询余额，优先级：
 * 1. 如果配置了 balanceUserId + balanceToken，调用令牌余额接口
 * 2. 否则尝试调用服务商余额查询接口
 */
export async function fetchBalance(): Promise<BalanceResult> {
  const cfg = getApiConfig();

  // 优先使用令牌余额（USER ID + Token）
  if (cfg.balanceUserId?.trim() && cfg.balanceToken?.trim()) {
    return fetchTokenBalance(cfg.balanceUserId.trim(), cfg.balanceToken.trim());
  }

  // 回退到服务商余额查询
  const active = getActiveImageModel(cfg);
  const baseUrl = active.baseUrl || cfg.globalBaseUrl;
  const apiKey = active.apiKey || cfg.globalApiKey;
  return fetchServiceBalance(baseUrl, apiKey);
}

async function fetchTokenBalance(userId: string, token: string): Promise<BalanceResult> {
  try {
    const resp = await fetch("https://api.wuaiapi.com/v1/user/credits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, token }),
    });
    if (resp.ok) {
      const data = await resp.json();
      return { ok: true, data };
    }
    const text = await resp.text();
    return { ok: false, message: `令牌余额查询失败: HTTP ${resp.status}: ${text.slice(0, 120)}` };
  } catch (err) {
    return { ok: false, message: `令牌余额查询失败: ${err instanceof Error ? err.message : String(err)}` };
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
        const data = await resp.json();
        return { ok: true, data };
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
