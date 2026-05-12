/**
 * URL 安全校验
 * 防止 javascript: / data:text/html 等恶意 URI 注入到 img src / fetch 等场景
 */

const SAFE_PROTOCOLS = ["http:", "https:", "data:", "blob:", "file:"];

/** 校验 URL 是否安全用于 img src / fetch。不安全时返回空字符串。 */
export function safeUrl(url: string | undefined | null): string {
  if (!url || typeof url !== "string") return "";
  // data: URI 必须是图片类型
  if (url.startsWith("data:") && !url.startsWith("data:image/")) return "";
  try {
    // 相对路径和 data: URI 用 base URL 解析
    const parsed = new URL(url, "https://x.co");
    if (!SAFE_PROTOCOLS.includes(parsed.protocol)) return "";
  } catch {
    // URL 解析失败 — 可能是相对路径，允许通过
    return url;
  }
  return url;
}
