// ─────────────────────────────────────────────────────────────────────────────
//  settings.ts — API 配置持久化层
//
//  数据结构：
//    globalBaseUrl / globalApiKey  — 全局默认，所有模型继承
//    chatModels[]   — Chat 类模型，对应 /v1/chat/completions
//    imageModels[]  — Image 类模型，对应 /v1/images/generations
//    每个模型可单独覆盖 apiKey / baseUrl（留空则使用全局值）
//
//  兼容旧版：读取旧结构时自动将 channels[0] 的 baseUrl/apiKey 迁移为全局配置
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = "liang007_api_settings_v2";
const LEGACY_KEY  = "liang007_api_settings";

// ── 模型类型 ────────────────────────────────────────────────────────────────

/** Chat 模型 — 对应 POST /v1/chat/completions */
export type ChatModel = {
  id: string;                 // 内部 UUID
  modelId: string;            // 传给 API 的 model 字段，如 "gpt-4o"
  label?: string;             // 展示名称，留空时用 modelId
  apiKey?: string;            // 覆盖全局 apiKey，留空用全局
  baseUrl?: string;           // 覆盖全局 baseUrl，留空用全局
};

/** 接口规范类型 */
export type ApiSpec = "openai" | "gemini";

/** Image 模型 — 对应 POST /v1/images/generations */
export type ImageModel = {
  id: string;
  modelId: string;            // 传给 API 的 model 字段，如 "nano-banana"
  label?: string;
  apiKey?: string;
  baseUrl?: string;
  /** 接口规范，不填则继承全局，默认 openai */
  apiSpec?: ApiSpec;
};

/** API 供应商 */
export type ApiVendor = {
  id: string;
  name: string;
  baseUrl: string;
  /** 供应商 API Key */
  apiKey?: string;
  /** 自定义备注 */
  remark?: string;
  /** 是否为默认供应商（启动时自动应用） */
  isDefault?: boolean;
};

/** 完整配置 */
export type ApiConfig = {
  /** 全局 BASE URL，如 https://ai.t8star.cn */
  globalBaseUrl: string;
  /** 全局 API KEY，作为所有模型的默认密钥 */
  globalApiKey: string;
  /** 全局接口规范，默认 openai */
  globalApiSpec: ApiSpec;
  /** Chat 类模型列表 */
  chatModels: ChatModel[];
  /** Image 类模型列表 */
  imageModels: ImageModel[];
  /** 主界面当前选中的 Image 模型 id（内部 UUID） */
  activeImageModelId: string;
  /** API 响应格式严格校验开关 */
  apiValidateJson: boolean;
  /** 自定义 API 供应商列表 */
  apiVendors: ApiVendor[];
  /** 当前激活的供应商 id（空表示使用手动输入的 globalBaseUrl） */
  activeVendorId: string;
};

// ── 工具函数 ────────────────────────────────────────────────────────────────

function genId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** 解析某个模型实际生效的 baseUrl（模型覆盖 > 全局） */
export function resolveBaseUrl(
  model: { baseUrl?: string },
  config: Pick<ApiConfig, "globalBaseUrl">
): string {
  return (model.baseUrl?.trim() || config.globalBaseUrl?.trim() || "").replace(/\/$/, "");
}

/** 解析某个模型实际生效的 apiKey（模型覆盖 > 全局） */
export function resolveApiKey(
  model: { apiKey?: string },
  config: Pick<ApiConfig, "globalApiKey">
): string {
  return model.apiKey?.trim() || config.globalApiKey?.trim() || "";
}

/** 解析某个模型实际生效的 apiSpec（模型覆盖 > 全局，默认 openai） */
export function resolveApiSpec(
  model: { apiSpec?: ApiSpec },
  config: Pick<ApiConfig, "globalApiSpec">
): ApiSpec {
  return model.apiSpec ?? config.globalApiSpec ?? "gemini";
}

// ── 预设服务商 ──────────────────────────────────────────────────────────────

export const API_PRESETS = [
  {
    id: "t8star",
    name: "贞贞的AI工坊",
    baseUrl: "https://ai.t8star.cn",
    docUrl: "https://ai.t8star.cn/api-set",
    steps: [
      "在「钱包」充值后，在「API令牌」页创建令牌并复制 key",
      "在「模型价格」页选择模型，复制模型名称",
      "将 BaseUrl 填写为 https://ai.t8star.cn，API Key 填写复制的令牌"
    ]
  }
] as const;

// ── 默认配置 ────────────────────────────────────────────────────────────────

function makeDefaultConfig(): ApiConfig {
  return {
    globalBaseUrl: "",
    globalApiKey: "",
    globalApiSpec: "gemini",
    chatModels: [],
    imageModels: [],
    // 修复：imageModels 为空时 activeImageModelId 必须是空字符串，
    //        之前错误地生成了一个随机 ID，导致永远匹配不到任何模型
    activeImageModelId: "",
    apiValidateJson: true,
    apiVendors: [],
    activeVendorId: ""
  };
}

// ── 兼容旧版数据迁移 ────────────────────────────────────────────────────────

function migrateFromLegacy(): ApiConfig | null {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    // 从旧版渠道中取 baseUrl / apiKey
    const channels = (parsed.channels as { baseUrl?: string; apiKey?: string }[] | undefined) ?? [];
    const active = channels[0] ?? {};
    const baseUrl = (active.baseUrl ?? (parsed.baseUrl as string) ?? "").trim();
    const apiKey  = (active.apiKey  ?? (parsed.apiKey  as string) ?? "").trim();

    // 旧版 selectedModelIds 作为 image 模型
    const oldModelIds = Array.isArray(parsed.selectedModelIds)
      ? (parsed.selectedModelIds as string[]).filter(Boolean)
      : [];

    const imageModels: ImageModel[] = oldModelIds.length > 0
      ? oldModelIds.map((mid) => ({ id: genId(), modelId: mid, label: mid, apiKey: "", baseUrl: "" }))
      : [{ id: genId(), modelId: "", label: "默认绘图模型", apiKey: "", baseUrl: "" }];

    const config: ApiConfig = {
      globalBaseUrl: baseUrl,
      globalApiKey: apiKey,
      globalApiSpec: "openai",
      chatModels: [],
      imageModels,
      activeImageModelId: imageModels[0].id,
      apiValidateJson: typeof parsed.apiValidateJson === "boolean" ? parsed.apiValidateJson : true,
      apiVendors: [],
      activeVendorId: ""
    };
    return config;
  } catch {
    return null;
  }
}

// ── 读 / 写 ─────────────────────────────────────────────────────────────────

export function getApiConfig(): ApiConfig {
  try {
    // 优先读新版配置
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ApiConfig>;
      return {
        globalBaseUrl:      parsed.globalBaseUrl      ?? "",
        globalApiKey:       parsed.globalApiKey       ?? "",
        globalApiSpec:      (parsed.globalApiSpec as ApiSpec | undefined) ?? "gemini",
        chatModels:         Array.isArray(parsed.chatModels)  ? parsed.chatModels  : [],
        imageModels:        Array.isArray(parsed.imageModels) ? parsed.imageModels : [],
        activeImageModelId: parsed.activeImageModelId ?? "",
        apiValidateJson:    typeof parsed.apiValidateJson === "boolean" ? parsed.apiValidateJson : true,
        apiVendors:         Array.isArray(parsed.apiVendors) ? parsed.apiVendors : [],
        activeVendorId:     (parsed.activeVendorId as string | undefined) ?? ""
      };
    }
  } catch {/* ignore */}

  // 尝试从旧版迁移
  const migrated = migrateFromLegacy();
  if (migrated) {
    saveApiConfig(migrated);
    return migrated;
  }

  // 全新默认
  const def = makeDefaultConfig();
  saveApiConfig(def);
  return def;
}

export function saveApiConfig(config: ApiConfig): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(config)); } catch { /* quota exceeded */ }
}

export function updateApiConfig(patch: Partial<ApiConfig>): ApiConfig {
  const current = getApiConfig();
  const next = { ...current, ...patch };
  saveApiConfig(next);
  return next;
}

// ── 全局 BaseUrl 同步 ────────────────────────────────────────────────────────

/**
 * 更新全局 BaseUrl 并同步到所有「未单独设置 baseUrl」的模型。
 * 已单独设置了 baseUrl 的模型不受影响。
 */
export function syncGlobalBaseUrl(newBaseUrl: string): ApiConfig {
  const current = getApiConfig();
  // 模型如果 baseUrl 为空（即继承全局），不需要改动（它们读取时走 resolveBaseUrl 自动取全局）
  // 这里只更新全局字段
  return updateApiConfig({ globalBaseUrl: newBaseUrl });
}

// ── 便捷：获取当前生效的 Image 模型信息 ────────────────────────────────────

export function getActiveImageModel(config?: ApiConfig): {
  model: ImageModel | null;
  baseUrl: string;
  apiKey: string;
  spec: ApiSpec;
} {
  const cfg = config ?? getApiConfig();
  const model = cfg.imageModels.find((m) => m.id === cfg.activeImageModelId)
    ?? cfg.imageModels[0]
    ?? null;
  return {
    model,
    baseUrl: model ? resolveBaseUrl(model, cfg) : cfg.globalBaseUrl,
    apiKey:  model ? resolveApiKey(model, cfg)  : cfg.globalApiKey,
    spec:    model ? resolveApiSpec(model, cfg)  : (cfg.globalApiSpec ?? "gemini")
  };
}

// ── 向后兼容层（供 imageClient.ts / models.ts 等旧模块使用）───────────────

/** @deprecated 使用 getApiConfig() + getActiveImageModel() 替代 */
export function getApiSettings() {
  const cfg = getApiConfig();
  const active = getActiveImageModel(cfg);
  return {
    // 新字段
    ...cfg,
    // 旧字段兼容
    baseUrl:          active.baseUrl,
    apiKey:           active.apiKey,
    selectedModelIds: cfg.imageModels.map((m) => m.modelId).filter(Boolean),
    modelList:        cfg.imageModels.map((m) => m.modelId).filter(Boolean),
    channels:         [{ id: "default", name: "默认", baseUrl: active.baseUrl, apiKey: active.apiKey }],
    activeChannelId:  "default"
  };
}

/** @deprecated 使用 updateApiConfig() 替代 */
export function setApiSettings(settings: Record<string, unknown>): void {
  const cfg = getApiConfig();
  const patch: Partial<ApiConfig> = {};
  if (typeof settings.apiValidateJson === "boolean") patch.apiValidateJson = settings.apiValidateJson;
  if (Array.isArray(settings.selectedModelIds)) {
    // 将 selectedModelIds 同步为 imageModels
    const newIds = settings.selectedModelIds as string[];
    const existing = cfg.imageModels;
    const merged = newIds.map((mid) => {
      const found = existing.find((m) => m.modelId === mid);
      return found ?? { id: genId(), modelId: mid, label: mid, apiKey: "", baseUrl: "" };
    });
    if (merged.length > 0) {
      patch.imageModels = merged;
      const stillActive = merged.find((m) => m.id === cfg.activeImageModelId);
      if (!stillActive) patch.activeImageModelId = merged[0].id;
    }
  }
  updateApiConfig(patch);
}

/** @deprecated */
export function updateCurrentChannel(channel: { id: string; baseUrl?: string; apiKey?: string; name?: string }): void {
  const cfg = getApiConfig();
  const patch: Partial<ApiConfig> = {};
  if (channel.baseUrl !== undefined) patch.globalBaseUrl = channel.baseUrl;
  if (channel.apiKey  !== undefined) patch.globalApiKey  = channel.apiKey;
  updateApiConfig(patch);
}

/** @deprecated */
export function addChannel() {
  return { id: genId(), name: "渠道", baseUrl: "", apiKey: "" };
}
/** @deprecated */
export function removeChannel(_id: string): void { /* no-op */ }
/** @deprecated */
export function setActiveChannel(_id: string): void { /* no-op */ }

// ── 供应商管理 ────────────────────────────────────────────────────────────────

/** 新增供应商 */
export function addApiVendor(vendor: Omit<ApiVendor, "id">): ApiConfig {
  const cfg = getApiConfig();
  const newVendor: ApiVendor = { ...vendor, id: genId() };
  return updateApiConfig({ apiVendors: [...cfg.apiVendors, newVendor] });
}

/** 更新供应商（名称/URL/备注） */
export function updateApiVendor(vendorId: string, patch: Partial<Omit<ApiVendor, "id">>): ApiConfig {
  const cfg = getApiConfig();
  const vendors = cfg.apiVendors.map((v) =>
    v.id === vendorId ? { ...v, ...patch } : v
  );
  // 如果更新了正在使用的供应商的 baseUrl，同步全局 baseUrl
  const updatedVendor = vendors.find((v) => v.id === vendorId);
  const patch2: Partial<ApiConfig> = { apiVendors: vendors };
  if (updatedVendor && cfg.activeVendorId === vendorId && patch.baseUrl !== undefined) {
    patch2.globalBaseUrl = updatedVendor.baseUrl;
  }
  return updateApiConfig(patch2);
}

/** 设置默认供应商（只有一个能是默认；传入空字符串可清除所有默认标记） */
export function setDefaultApiVendor(vendorId: string): ApiConfig {
  const cfg = getApiConfig();
  const vendors = cfg.apiVendors.map((v) => ({
    ...v,
    isDefault: vendorId ? v.id === vendorId : false
  }));
  return updateApiConfig({ apiVendors: vendors });
}

/** 删除供应商 */
export function removeApiVendor(vendorId: string): ApiConfig {
  const cfg = getApiConfig();
  const remaining = cfg.apiVendors.filter((v) => v.id !== vendorId);
  const patch: Partial<ApiConfig> = { apiVendors: remaining };
  // 若删除的是当前激活供应商，重置 globalBaseUrl 和 activeVendorId
  if (cfg.activeVendorId === vendorId) {
    patch.activeVendorId = "";
    patch.globalBaseUrl = "";
  }
  return updateApiConfig(patch);
}

/** 切换激活供应商（同时同步 globalBaseUrl，如果供应商保存了 apiKey 也一并同步） */
export function switchApiVendor(vendorId: string): ApiConfig {
  const cfg = getApiConfig();
  const vendor = cfg.apiVendors.find((v) => v.id === vendorId);
  if (!vendor) return cfg;
  const patch: Partial<ApiConfig> = { activeVendorId: vendorId, globalBaseUrl: vendor.baseUrl };
  if (vendor.apiKey?.trim()) patch.globalApiKey = vendor.apiKey.trim();
  return updateApiConfig(patch);
}

// ── 旧版类型兼容 ─────────────────────────────────────────────────────────────

export type ApiChannel = { id: string; name: string; baseUrl: string; apiKey: string };
export type ApiSettings = ApiConfig & { baseUrl: string; apiKey: string; channels: ApiChannel[]; activeChannelId: string; selectedModelIds: string[]; modelList: string[] };
export type ApiSettingsWithLegacy = ApiSettings;
