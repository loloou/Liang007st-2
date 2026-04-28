import { getApiConfig, getActiveImageModel } from "./settings";

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/$/, "");
}

/** 常见余额查询路径 */
const BALANCE_PATHS = ["/v1/balance", "/v1/user/balance", "/balance", "/api/balance"];

export type BalanceResult = { ok: true; data: unknown } | { ok: false; message: string };

/**
 * 尝试调用服务商余额查询接口；若不存在则不修改（返回 ok: false）
 * 使用新版配置结构 getApiConfig() + getActiveImageModel() 确保读取正确的 baseUrl/apiKey
 */
export async function fetchBalance(): Promise<BalanceResult> {
  const cfg = getApiConfig();
  const active = getActiveImageModel(cfg);
  const baseUrl = active.baseUrl || cfg.globalBaseUrl;
  const apiKey = active.apiKey || cfg.globalApiKey;

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
