/**
 * 根据获取到的模型 id 进行分类，用于弹窗内按类展示
 * 分类参考 ai.t8star.cn/models 等聚合站常见划分
 */

export type ModelGroup = { category: string; models: string[] };

const CATEGORY_RULES: { name: string; keywords: string[] }[] = [
  { name: "文生图", keywords: ["text-to-image", "text2img", "t2i", "文生图", "txt2img", "text2im", "t2i"] },
  { name: "图生图", keywords: ["image-to-image", "img2img", "i2i", "图生图", "im2im"] },
  { name: "视频生成", keywords: ["video", "sora", "kling", "可灵", "runway", "minimax", "hailuo", "海螺", "wan", "万", "veo", "luma"] },
  { name: "FLUX", keywords: ["flux", "flux-dev", "flux-pro", "flux-schnell"] },
  { name: "SDXL / SD", keywords: ["sdxl", "stable-diffusion", "sd-", "sd1", "sd2"] },
  { name: "豆包 / 字节", keywords: ["doubao", "豆包", "seedream", "byte"] },
  { name: "通义 / 阿里", keywords: ["tongyi", "通义", "wanx", "composer", "qwen"] },
  { name: "Kimi / 月之暗面", keywords: ["kimi", "moonshot", "月之暗面"] },
  { name: "图像增强 / 超分", keywords: ["upscale", "enhance", "超分", "增强", "remaster"] },
  { name: "其他", keywords: [] }
];

function matchCategory(id: string): string {
  const lower = id.toLowerCase();
  for (const { name, keywords } of CATEGORY_RULES) {
    if (keywords.length === 0) continue;
    if (keywords.some((k) => lower.includes(k.toLowerCase()))) return name;
  }
  return "其他";
}

/**
 * 将模型 id 列表按分类分组，返回有序分组（含「其他」）
 */
export function groupModelsByCategory(modelIds: string[]): ModelGroup[] {
  const map = new Map<string, string[]>();
  for (const name of CATEGORY_RULES.map((r) => r.name)) {
    map.set(name, []);
  }
  for (const id of modelIds) {
    const cat = matchCategory(id);
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat)!.push(id);
  }
  return CATEGORY_RULES.map(({ name }) => ({ category: name, models: map.get(name) ?? [] })).filter(
    (g) => g.models.length > 0
  );
}

/** 按搜索关键词过滤分组（关键词匹配模型 id，不区分大小写） */
export function filterGroupsBySearch(groups: ModelGroup[], searchText: string): ModelGroup[] {
  const q = searchText.trim().toLowerCase();
  if (!q) return groups;
  return groups
    .map((g) => ({
      category: g.category,
      models: g.models.filter((id) => id.toLowerCase().includes(q))
    }))
    .filter((g) => g.models.length > 0);
}

/** 模型厂商规则（参考 ai.t8star.cn/models 等聚合站厂商划分，先匹配的优先） */
const VENDOR_RULES: { name: string; keywords: string[] }[] = [
  { name: "字节跳动", keywords: ["doubao", "豆包", "seedream", "byte", "字节"] },
  { name: "阿里巴巴", keywords: ["tongyi", "通义", "wanx", "composer", "qwen", "阿里"] },
  { name: "月之暗面", keywords: ["kimi", "moonshot", "月之暗面"] },
  { name: "OpenAI", keywords: ["openai", "dall-e", "dalle", "gpt-4", "gpt-3", "chatgpt"] },
  { name: "Google", keywords: ["gemini", "imagen", "veo", "google"] },
  { name: "Anthropic", keywords: ["claude", "anthropic"] },
  { name: "可灵", keywords: ["kling", "可灵"] },
  { name: "Stability AI", keywords: ["stability", "sdxl", "stable-diffusion", "sd-"] },
  { name: "FLUX", keywords: ["flux", "black-forest-labs"] },
  { name: "MiniMax", keywords: ["minimax", "海螺"] },
  { name: "Runway", keywords: ["runway"] },
  { name: "Luma", keywords: ["luma", "dream-machine"] },
  { name: "腾讯", keywords: ["tencent", "腾讯", "hunyuan"] },
  { name: "百度", keywords: ["baidu", "百度", "ernie", "文心"] },
  { name: "其他", keywords: [] }
];

/** 获取单个模型的分类标签（模型标签） */
export function getModelCategoryTag(modelId: string): string {
  return matchCategory(modelId);
}

/** 获取单个模型的厂商标签 */
export function getModelVendorTag(modelId: string): string {
  const lower = modelId.toLowerCase();
  for (const { name, keywords } of VENDOR_RULES) {
    if (keywords.length === 0) continue;
    if (keywords.some((k) => lower.includes(k.toLowerCase()))) return name;
  }
  return "";
}

/** 用于弹窗展示：{ 模型id, 模型标签, 厂商标签 } */
export function getModelDisplayInfo(modelId: string): { id: string; categoryTag: string; vendorTag: string } {
  return {
    id: modelId,
    categoryTag: getModelCategoryTag(modelId),
    vendorTag: getModelVendorTag(modelId)
  };
}

/** 模型标签列表（用于筛选按钮，不含「其他」） */
export const MODEL_CATEGORY_TAGS = CATEGORY_RULES.filter((r) => r.keywords.length > 0).map((r) => r.name);

/** 厂商标签列表（用于筛选按钮，不含「其他」） */
export const MODEL_VENDOR_TAGS = VENDOR_RULES.filter((r) => r.keywords.length > 0).map((r) => r.name);

/** 按模型标签、厂商标签过滤分组 */
export function filterGroupsByTags(
  groups: ModelGroup[],
  categoryTag: string | null,
  vendorTag: string | null
): ModelGroup[] {
  let out = groups;
  if (categoryTag) {
    out = out.filter((g) => g.category === categoryTag);
  }
  if (vendorTag) {
    out = out
      .map((g) => ({ category: g.category, models: g.models.filter((id) => getModelVendorTag(id) === vendorTag) }))
      .filter((g) => g.models.length > 0);
  }
  return out;
}

/**
 * 模型价格数据（参考 ai.t8star.cn/models 等聚合站定价，单位：元/张 或 元/次）
 * 未知定价显示 "询价"
 */
const MODEL_PRICE_MAP: Record<string, { price: string; note?: string }> = {
  // FLUX 系列
  "flux-dev":                       { price: "¥0.12/张" },
  "flux-schnell":                   { price: "¥0.06/张" },
  "flux-pro":                       { price: "¥0.25/张" },
  "flux-1.1-pro":                   { price: "¥0.25/张" },
  "flux-1.1-pro-ultra":             { price: "¥0.35/张" },
  "flux-realism":                   { price: "¥0.15/张" },
  "flux-lora":                      { price: "¥0.12/张" },
  "flux-canny-dev":                 { price: "¥0.12/张" },
  "flux-depth-dev":                 { price: "¥0.12/张" },
  "flux-fill-dev":                  { price: "¥0.12/张" },
  "flux-redux-dev":                 { price: "¥0.12/张" },
  // SDXL / SD 系列
  "sdxl":                           { price: "¥0.04/张" },
  "stable-diffusion-xl-base-1.0":   { price: "¥0.04/张" },
  "stable-diffusion-3":             { price: "¥0.10/张" },
  "stable-diffusion-3-medium":      { price: "¥0.10/张" },
  "sd-3.5-large":                   { price: "¥0.12/张" },
  "sd-3.5-large-turbo":             { price: "¥0.08/张" },
  "sd-3.5-medium":                  { price: "¥0.08/张" },
  // 豆包 / 字节跳动
  "doubao-seedream-3-0-t2i-250415": { price: "¥0.05/张" },
  "seedream-3.0":                   { price: "¥0.05/张" },
  "seedream-3-0-t2i":               { price: "¥0.05/张" },
  // 通义 / 阿里
  "wanx2.1-t2i-turbo":              { price: "¥0.04/张" },
  "wanx2.1-t2i-plus":               { price: "¥0.08/张" },
  "wanx-v1":                        { price: "¥0.04/张" },
  "wanx2.0-t2i-turbo":              { price: "¥0.04/张" },
  // 可灵 / Kling
  "kling-v1":                       { price: "¥0.35/张" },
  "kling-v1-5":                     { price: "¥0.50/张" },
  "kling-v2":                       { price: "¥0.60/张" },
  "kling-v2-master":                { price: "¥0.80/张" },
  // MiniMax / 海螺
  "minimax-image-01":               { price: "¥0.06/张" },
  "minimax-video-01":               { price: "¥0.40/段" },
  // Runway
  "runway-gen3-alpha-turbo":        { price: "¥0.50/段" },
  "runway-gen3-alpha":              { price: "¥0.90/段" },
  "gen-3-alpha-turbo":              { price: "¥0.50/段" },
  "gen-3-alpha":                    { price: "¥0.90/段" },
  // Luma
  "luma-photon":                    { price: "¥0.05/张" },
  "luma-photon-flash":              { price: "¥0.03/张" },
  "dream-machine":                  { price: "¥0.55/段" },
  // Ideogram
  "ideogram-v2":                    { price: "¥0.08/张" },
  "ideogram-v2-turbo":              { price: "¥0.05/张" },
  "ideogram-v3":                    { price: "¥0.10/张" },
  // Recraft
  "recraft-v3":                     { price: "¥0.08/张" },
  // Kolors / 快手
  "kolors":                         { price: "¥0.04/张" },
  // Playground
  "playground-v2-5":                { price: "¥0.04/张" },
  "playground-v3":                  { price: "¥0.06/张" },
  // Hunyuan / 腾讯
  "hunyuan-dit":                    { price: "¥0.05/张" },
  "hunyuan-video":                  { price: "¥0.80/段" },
  // nano-banana（内部自建）
  "nano-banana-pro":                { price: "¥0.03/张", note: "内部" },
  "nano-banana":                    { price: "¥0.02/张", note: "内部" },
  // OpenAI DALL-E
  "dall-e-3":                       { price: "¥0.28/张" },
  "dall-e-2":                       { price: "¥0.14/张" },
  // Google Imagen
  "imagen-3.0-generate-002":        { price: "¥0.20/张" },
  "imagen-3.0-fast-generate-001":   { price: "¥0.10/张" },
};

/** 关键词模糊匹配价格（先匹配更精确的规则） */
const PRICE_KEYWORD_RULES: { keywords: string[]; price: string; note?: string }[] = [
  // FLUX
  { keywords: ["flux-1.1-pro-ultra"],             price: "¥0.35/张" },
  { keywords: ["flux-1.1-pro", "flux-pro"],       price: "¥0.25/张" },
  { keywords: ["flux-schnell"],                   price: "¥0.06/张" },
  { keywords: ["flux-realism"],                   price: "¥0.15/张" },
  { keywords: ["flux"],                           price: "¥0.12/张" },
  // SD / SDXL
  { keywords: ["sd-3.5-large-turbo"],             price: "¥0.08/张" },
  { keywords: ["sd-3.5-large"],                   price: "¥0.12/张" },
  { keywords: ["sd-3.5-medium"],                  price: "¥0.08/张" },
  { keywords: ["stable-diffusion-3", "sd-3"],     price: "¥0.10/张" },
  { keywords: ["sdxl", "stable-diffusion-xl"],    price: "¥0.04/张" },
  { keywords: ["stable-diffusion", "sd-"],        price: "¥0.04/张" },
  // 豆包 / 字节
  { keywords: ["doubao", "seedream"],             price: "¥0.05/张" },
  // 通义 / 阿里
  { keywords: ["wanx"],                           price: "¥0.04~0.08/张" },
  // 可灵
  { keywords: ["kling-v2-master"],                price: "¥0.80/张" },
  { keywords: ["kling-v2"],                       price: "¥0.60/张" },
  { keywords: ["kling-v1-5"],                     price: "¥0.50/张" },
  { keywords: ["kling"],                          price: "¥0.35/张" },
  // MiniMax
  { keywords: ["minimax-video", "hailuo-video"],  price: "¥0.40/段" },
  { keywords: ["minimax", "hailuo"],              price: "¥0.06/张" },
  // Runway
  { keywords: ["gen-3-alpha-turbo", "runway-gen3-alpha-turbo"], price: "¥0.50/段" },
  { keywords: ["gen-3-alpha", "runway-gen3-alpha"],             price: "¥0.90/段" },
  { keywords: ["runway", "gen-"],                price: "¥0.50/段" },
  // Luma
  { keywords: ["luma-photon-flash"],              price: "¥0.03/张" },
  { keywords: ["luma-photon"],                    price: "¥0.05/张" },
  { keywords: ["dream-machine", "luma-video"],    price: "¥0.55/段" },
  { keywords: ["luma"],                           price: "¥0.05/张" },
  // Ideogram
  { keywords: ["ideogram-v3"],                    price: "¥0.10/张" },
  { keywords: ["ideogram-v2-turbo"],              price: "¥0.05/张" },
  { keywords: ["ideogram"],                       price: "¥0.08/张" },
  // Recraft
  { keywords: ["recraft"],                        price: "¥0.08/张" },
  // Kolors
  { keywords: ["kolors"],                         price: "¥0.04/张" },
  // Playground
  { keywords: ["playground-v3"],                  price: "¥0.06/张" },
  { keywords: ["playground"],                     price: "¥0.04/张" },
  // Hunyuan
  { keywords: ["hunyuan-video"],                  price: "¥0.80/段" },
  { keywords: ["hunyuan"],                        price: "¥0.05/张" },
  // DALL-E
  { keywords: ["dall-e-3"],                       price: "¥0.28/张" },
  { keywords: ["dall-e"],                         price: "¥0.14/张" },
  // Imagen (Google)
  { keywords: ["imagen-3.0-fast"],                price: "¥0.10/张" },
  { keywords: ["imagen"],                         price: "¥0.20/张" },
  // Wan / 万象
  { keywords: ["wan-", "wanx", "wan2"],           price: "¥0.06/张" },
  // Sora (OpenAI 视频)
  { keywords: ["sora"],                           price: "¥1.20/段" },
  // Veo (Google 视频)
  { keywords: ["veo-2", "veo2"],                  price: "¥0.90/段" },
  { keywords: ["veo"],                            price: "¥0.70/段" },
  // nano-banana
  { keywords: ["nano-banana"],                    price: "¥0.02~0.03/张", note: "内部" },
];

/** 获取模型价格信息 */
export function getModelPrice(modelId: string): { price: string; note?: string } {
  // 精确匹配
  if (MODEL_PRICE_MAP[modelId]) return MODEL_PRICE_MAP[modelId];
  // 关键词模糊匹配
  const lower = modelId.toLowerCase();
  for (const rule of PRICE_KEYWORD_RULES) {
    if (rule.keywords.some((k) => lower.includes(k.toLowerCase()))) {
      return { price: rule.price, note: rule.note };
    }
  }
  return { price: "询价" };
}
