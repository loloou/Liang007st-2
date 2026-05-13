/**
 * SettingsDialog — 设置弹窗组件
 *
 * 包含：Global Config（供应商名称/BaseURL/API Key）、供应商管理入口、
 * Image/Chat 模型列表、自动获取模型、模型选择弹窗、测试连接。
 */
import React, { useState, useEffect } from "react";
import { getApiConfig, saveApiConfig, addApiVendor, switchApiVendor, type ApiConfig, type ImageModel, type ChatModel, type ApiSpec } from "../api/settings";
import VendorManager from "./VendorManager";

// ── 内联 API 函数 ──────────────────────────────────────────────────────────
async function fetchModelList(baseUrl: string, apiKey: string): Promise<{ ok: boolean; models: string[]; error?: string }> {
  try {
    const url = baseUrl.replace(/\/+$/, "") + "/v1/models";
    const headers: HeadersInit = { "Content-Type": "application/json" };
    if (apiKey?.trim()) headers["Authorization"] = `Bearer ${apiKey.trim()}`;
    const resp = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
    if (!resp.ok) return { ok: false, models: [], error: `HTTP ${resp.status}` };
    const data = await resp.json() as { data?: Array<{ id: string }> };
     const models = Array.isArray(data?.data) ? data.data.map((m) => m.id).filter(Boolean) : [];
    return { ok: models.length > 0, models, error: models.length === 0 ? "未获取到模型" : undefined };
  } catch (e) {
    return { ok: false, models: [], error: e instanceof Error ? e.message : "网络错误" };
  }
}

async function testModelConnection(baseUrl: string, apiKey: string, modelId: string): Promise<{ ok: boolean; message: string; detail?: string }> {
  try {
    const url = baseUrl.replace(/\/+$/, "") + "/v1/chat/completions";
    const headers: HeadersInit = { "Content-Type": "application/json" };
    if (apiKey?.trim()) headers["Authorization"] = `Bearer ${apiKey.trim()}`;
    const body = JSON.stringify({ model: modelId, messages: [{ role: "user", content: "hi" }], max_tokens: 1 });
    const resp = await fetch(url, { method: "POST", headers, body, signal: AbortSignal.timeout(15000) });
    if (resp.ok) return { ok: true, message: `HTTP ${resp.status} — 模型可用` };
    const text = await resp.text().catch(() => "");
    return { ok: false, message: `HTTP ${resp.status}`, detail: text.slice(0, 200) };
  } catch (e) {
    return { ok: false, message: "连接失败", detail: e instanceof Error ? e.message : "网络错误" };
  }
}

// ── 组件 ──────────────────────────────────────────────────────────────────
interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (modelIds: string[], activeModelId: string) => void;
}

const SettingsDialog: React.FC<Props> = ({ open, onClose, onSave }) => {
  const [cfgDraft, setCfgDraft] = useState<ApiConfig>(() => getApiConfig());
  const [settingsTab, setSettingsTab] = useState<"image" | "chat">("image");
  const [modelTestStatus, setModelTestStatus] = useState<Record<string, "idle"|"testing"|"ok"|"fail">>({});
  const [modelTestMsg, setModelTestMsg] = useState<Record<string, string>>({});
  const [syncToast, setSyncToast] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [fetchErr, setFetchErr] = useState("");
  const [globalSaveVendorName, setGlobalSaveVendorName] = useState("");
  const [vendorDropdownOpen, setVendorDropdownOpen] = useState(false);

  // 供应商管理弹窗
  const [vendorManagerOpen, setVendorManagerOpen] = useState(false);

  // 模型选择弹窗（获取模型列表后弹出）
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [modelPickerMode, setModelPickerMode] = useState<"image" | "chat">("image");
  const [modelPickerList, setModelPickerList] = useState<string[]>([]);
  const [modelPickerSelected, setModelPickerSelected] = useState<Set<string>>(new Set());
  const [modelPickerSearch, setModelPickerSearch] = useState("");

  useEffect(() => {
    if (open) {
      setCfgDraft(getApiConfig());
      setModelTestStatus({});
      setModelTestMsg({});
      setFetchErr("");
      setModelPickerOpen(false);
    }
  }, [open]);

  if (!open) return null;

  const handleSave = () => {
    saveApiConfig(cfgDraft);
    const imgModelIds = cfgDraft.imageModels.map((m) => m.modelId).filter(Boolean);
    if (imgModelIds.length > 0) {
      const activeM = cfgDraft.imageModels.find((m) => m.id === cfgDraft.activeImageModelId);
      const activeMid = activeM?.modelId?.trim() || imgModelIds[0];
      onSave(imgModelIds, activeMid);
    } else {
      onSave([], "");
    }
    onClose();
  };

  const handleFetchModels = async (mode: "image" | "chat" = "image") => {
    setFetching(true);
    setFetchErr("");
    try {
      const baseUrl = cfgDraft.globalBaseUrl;
      const apiKey = cfgDraft.globalApiKey;
      if (!baseUrl.trim()) { setFetchErr("请先填写 Base URL"); return; }
      const result = await fetchModelList(baseUrl, apiKey);
      if (result.ok && result.models.length > 0) {
        setModelPickerMode(mode);
        setModelPickerList(result.models);
        // 默认全选
        setModelPickerSelected(new Set(result.models));
        setModelPickerSearch("");
        setModelPickerOpen(true);
      } else {
        setFetchErr(result.error || "获取模型列表失败");
      }
    } catch (e) {
      setFetchErr(e instanceof Error ? e.message : "网络错误");
    } finally {
      setFetching(false);
    }
  };

  const handleModelPickerConfirm = () => {
    const selectedModels = modelPickerList.filter((m) => modelPickerSelected.has(m));
    if (modelPickerMode === "image") {
      const newModels: ImageModel[] = selectedModels.map((mid) => ({
        id: `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}${Math.random().toString(36).slice(2, 4)}`,
        modelId: mid,
         label: mid,
         baseUrl: "",
         apiKey: "",
         apiSpec: undefined as ApiSpec | undefined,
      }));
      setCfgDraft((prev) => {
        const existingIds = new Set(prev.imageModels.map((m) => m.modelId));
        const toAdd = newModels.filter((nm) => !existingIds.has(nm.modelId));
        return { ...prev, imageModels: [...prev.imageModels, ...toAdd] };
      });
    } else {
      const newModels: ChatModel[] = selectedModels.map((mid) => ({
        id: `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}${Math.random().toString(36).slice(2, 4)}`,
        modelId: mid,
        label: mid,
        baseUrl: "",
        apiKey: "",
      }));
      setCfgDraft((prev) => {
        const existingIds = new Set(prev.chatModels.map((m) => m.modelId));
        const toAdd = newModels.filter((nm) => !existingIds.has(nm.modelId));
        return { ...prev, chatModels: [...prev.chatModels, ...toAdd] };
      });
    }
    setModelPickerOpen(false);
  };

  const updateModel = (id: string, patch: Partial<ImageModel>) => {
    setCfgDraft((prev) => ({
      ...prev,
      imageModels: prev.imageModels.map((m) => m.id === id ? { ...m, ...patch } : m),
    }));
  };

  const removeModel = (id: string) => {
    setCfgDraft((prev) => ({
      ...prev,
      imageModels: prev.imageModels.filter((m) => m.id !== id),
    }));
  };

  const updateChatModel = (id: string, patch: Partial<ChatModel>) => {
    setCfgDraft((prev) => ({
      ...prev,
      chatModels: prev.chatModels.map((m) => m.id === id ? { ...m, ...patch } : m),
    }));
  };

  const removeChatModel = (id: string) => {
    setCfgDraft((prev) => ({
      ...prev,
      chatModels: prev.chatModels.filter((m) => m.id !== id),
    }));
  };

  const addChatModel = () => {
    const newModel: ChatModel = {
      id: `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
      modelId: "",
      label: "",
      baseUrl: "",
      apiKey: "",
    };
    setCfgDraft((prev) => ({
      ...prev,
      chatModels: [...prev.chatModels, newModel],
    }));
  };

  const addModel = () => {
    const newModel: ImageModel = {
      id: `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
       modelId: "",
       label: "",
       baseUrl: "",
       apiKey: "",
       apiSpec: undefined as ApiSpec | undefined,
    };
    setCfgDraft((prev) => ({
      ...prev,
      imageModels: [...prev.imageModels, newModel],
    }));
  };

  // 模型选择弹窗过滤
  const filteredPickerModels = modelPickerSearch.trim()
    ? modelPickerList.filter((m) => m.toLowerCase().includes(modelPickerSearch.toLowerCase()))
    : modelPickerList;

  return (
    <>
      {/* ── 主设置弹窗 ── */}
      <div className="fixed inset-0 z-50 flex items-center justify-center overlay-dark p-4" onClick={onClose}>
        <div
          className="relative glass-popup w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden popup-enter"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 标题栏 */}
          <div className="flex items-center justify-between px-6 pt-5 pb-0 flex-shrink-0">
            <div>
              <h2 className="text-base font-bold text-slate-100">模型接口配置</h2>
              <p className="text-[11px] text-slate-500 mt-0.5">严格遵循 OpenAI API 格式，仅替换 BASE URL 和 API KEY 即可完成对接</p>
            </div>
            <button className="text-slate-500 hover:text-slate-300 text-xl leading-none p-1 ml-4 rounded-lg hover:bg-white/[0.06] transition" onClick={onClose} aria-label="关闭设置">×</button>
          </div>

          {/* 全局配置区 */}
          <div className="px-6 pt-3 pb-3 border-b border-white/[0.06] flex-shrink-0">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-1.5 h-1.5 rounded-full bg-primary-500 flex-shrink-0" />
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Global Config</span>
              <span className="text-[10px] text-slate-400 ml-1 hidden sm:inline">— 所有模型默认继承</span>
              {/* 供应商管理按钮 */}
              <button
                type="button"
                className="ml-auto px-2.5 py-1 rounded-lg border border-indigo-500/20 bg-indigo-500/10 text-indigo-400 text-[11px] font-medium hover:bg-indigo-500/15 transition flex items-center gap-1 flex-shrink-0"
                onClick={() => setVendorManagerOpen(true)}
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                供应商管理
                {cfgDraft.apiVendors?.length > 0 && <span className="px-1 bg-indigo-500/15 rounded text-indigo-400 text-[9px]">{cfgDraft.apiVendors.length}</span>}
              </button>
            </div>

            <div className="flex items-center gap-2">
              {/* 供应商名称 */}
              <div className="relative flex-shrink-0" style={{ width: 150 }}>
                <input
                  type="text"
                  className="w-full border border-white/[0.08] rounded-lg px-2.5 pr-7 py-1.5 bg-white/[0.06] focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 text-xs"
                  placeholder="供应商名称"
                  value={globalSaveVendorName}
                  onChange={(e) => setGlobalSaveVendorName(e.target.value)}
                  onFocus={() => cfgDraft.apiVendors?.length > 0 && setVendorDropdownOpen(true)}
                  onBlur={() => setTimeout(() => setVendorDropdownOpen(false), 150)}
                />
                {cfgDraft.apiVendors?.length > 0 && (
                  <svg className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                )}
                {vendorDropdownOpen && cfgDraft.apiVendors?.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 z-20 rounded-lg border border-white/[0.08] glass-popup shadow-xl max-h-48 overflow-y-auto">
                    <div className="px-2 py-1 border-b border-white/[0.06]">
                      <span className="text-[9px] text-slate-500 uppercase tracking-wider">已保存的供应商（点击切换）</span>
                    </div>
                    {cfgDraft.apiVendors.map((v) => {
                      const isActive = cfgDraft.activeVendorId === v.id;
                      return (
                        <button
                          key={v.id}
                          className={`w-full px-3 py-1.5 text-left text-xs transition flex items-center gap-2 ${
                            isActive ? "bg-primary-500/10 text-primary-400" : "text-slate-300 hover:bg-white/[0.06]"
                          }`}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            const updated = switchApiVendor(v.id);
                            setGlobalSaveVendorName(v.name);
                            setCfgDraft((prev) => ({
                              ...prev,
                              globalBaseUrl: v.baseUrl,
                              globalApiKey: v.apiKey || "",
                              activeVendorId: v.id,
                              apiVendors: updated.apiVendors,
                            }));
                            setVendorDropdownOpen(false);
                          }}
                        >
                          {isActive && <span className="text-[9px]">✓</span>}
                          <span className="flex-1 truncate">{v.name}</span>
                          <span className="text-[9px] text-slate-500 font-mono truncate max-w-[120px]">{v.baseUrl}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Base URL */}
              <input
                type="text"
                className="flex-1 min-w-0 border border-white/[0.08] rounded-lg px-2.5 py-1.5 bg-white/[0.06] focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 text-xs"
                placeholder="Base URL（如 https://api.openai.com）"
                value={cfgDraft.globalBaseUrl}
                onChange={(e) => setCfgDraft((prev) => ({ ...prev, globalBaseUrl: e.target.value }))}
              />

              {/* API Key */}
              <input
                type="password"
                className="w-40 flex-shrink-0 border border-white/[0.08] rounded-lg px-2.5 py-1.5 bg-white/[0.06] focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 text-xs"
                placeholder="API Key"
                value={cfgDraft.globalApiKey}
                onChange={(e) => setCfgDraft((prev) => ({ ...prev, globalApiKey: e.target.value }))}
              />

              {/* 同步按钮 */}
              <button
                type="button"
                className="px-2.5 py-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] text-[11px] text-slate-400 hover:bg-white/[0.08] transition flex-shrink-0"
                onClick={() => {
                  setCfgDraft((prev) => ({
                    ...prev,
                    imageModels: prev.imageModels.map((m) => ({
                      ...m,
                      baseUrl: m.baseUrl?.trim() ? m.baseUrl : prev.globalBaseUrl,
                      apiKey: m.apiKey?.trim() ? m.apiKey : prev.globalApiKey,
                    })),
                  }));
                  setSyncToast(true);
                  setTimeout(() => setSyncToast(false), 2000);
                }}
                title="将 Global Config 同步到所有模型（仅未自定义的字段）"
              >同步</button>

              {/* 保存为供应商 */}
              <button
                type="button"
                className="px-2.5 py-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-[11px] text-emerald-400 hover:bg-emerald-500/15 transition flex-shrink-0"
                onClick={() => {
                  const name = globalSaveVendorName.trim() || cfgDraft.globalBaseUrl.replace(/^https?:\/\//, "").split("/")[0] || "未命名供应商";
                  if (!cfgDraft.globalBaseUrl.trim()) return;
                  const updated = addApiVendor({
                    name,
                    baseUrl: cfgDraft.globalBaseUrl.trim(),
                    apiKey: cfgDraft.globalApiKey.trim() || undefined,
                  });
                  setCfgDraft((prev) => ({ ...prev, apiVendors: updated.apiVendors }));
                  setGlobalSaveVendorName("");
                  setSyncToast(true);
                  setTimeout(() => setSyncToast(false), 2000);
                }}
                disabled={!cfgDraft.globalBaseUrl.trim()}
                title="将当前 Base URL 和 API Key 保存为供应商"
              >保存为供应商</button>
            </div>
            {syncToast && <p className="text-[10px] text-emerald-400 mt-1">✓ 已同步到所有模型</p>}
          </div>

          {/* 标签页切换 */}
          <div className="flex border-b border-white/[0.06] px-6 flex-shrink-0">
            {(["image", "chat"] as const).map((tab) => (
              <button
                key={tab}
                className={`px-4 py-2.5 text-xs font-medium transition border-b-2 ${
                  settingsTab === tab ? "border-primary-500 text-primary-400" : "border-transparent text-slate-500 hover:text-slate-300"
                }`}
                onClick={() => setSettingsTab(tab)}
              >{tab === "image" ? "Image 模型" : "Chat 模型"}</button>
            ))}
          </div>

          {/* 模型列表 */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
            {settingsTab === "image" && (
              <>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-400">共 {cfgDraft.imageModels.length} 个模型</span>
                    <button
                      type="button"
                      className="px-2 py-1 rounded-lg bg-primary-500/10 text-primary-400 text-[11px] hover:bg-primary-500/20 transition"
                      onClick={() => handleFetchModels("image")}
                      disabled={fetching}
                    >{fetching ? "获取中…" : "自动获取模型"}</button>
                  </div>
                  <button
                    type="button"
                    className="px-2 py-1 rounded-lg bg-white/[0.04] text-slate-400 text-[11px] hover:bg-white/[0.08] transition"
                    onClick={addModel}
                  >+ 手动添加</button>
                </div>
                {fetchErr && <p className="text-[10px] text-red-400 mb-2">{fetchErr}</p>}

                {cfgDraft.imageModels.map((m) => {
                  const ts = modelTestStatus[m.id] || "idle";
                  const tmsg = modelTestMsg[m.id] || "";
                  return (
                    <div key={m.id} className="glass-card rounded-xl p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          className="flex-1 min-w-0 border border-white/[0.08] rounded-lg px-2.5 py-1.5 bg-white/[0.06] focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 text-xs"
                          placeholder="Model ID（如 gpt-image-1）"
                          value={m.modelId}
                          onChange={(e) => updateModel(m.id, { modelId: e.target.value })}
                        />
                        <input
                          type="text"
                          className="w-24 flex-shrink-0 border border-white/[0.08] rounded-lg px-2.5 py-1.5 bg-white/[0.06] focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 text-xs"
                          placeholder="别名"
                          value={m.label || ""}
                          onChange={(e) => updateModel(m.id, { label: e.target.value })}
                        />
                        {/* API 规范选择 */}
                        <select
                          className="w-20 flex-shrink-0 border border-white/[0.08] rounded-lg px-1.5 py-1.5 bg-white/[0.06] focus:outline-none focus:ring-1 focus:ring-indigo-100 text-[11px] text-slate-400"
                          value={m.apiSpec || ""}
                          onChange={(e) => updateModel(m.id, { apiSpec: (e.target.value || undefined) as ApiSpec | undefined })}
                          title="API 规范（留空自动检测）"
                        >
                          <option value="">自动</option>
                          <option value="openai">OpenAI</option>
                          <option value="gemini">Gemini</option>
                        </select>
                        <button
                          type="button"
                          className="text-slate-500 hover:text-red-400 text-sm p-1 rounded hover:bg-red-500/10 transition flex-shrink-0"
                          onClick={() => removeModel(m.id)}
                          title="删除此模型"
                        >×</button>
                      </div>

                      {/* 模型级 BaseUrl / ApiKey */}
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          className="flex-1 min-w-0 border border-white/[0.08] rounded-lg px-2.5 py-1.5 bg-white/[0.04] focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 text-[11px] text-slate-400"
                          placeholder="Base URL（留空继承全局）"
                          value={m.baseUrl || ""}
                          onChange={(e) => updateModel(m.id, { baseUrl: e.target.value })}
                        />
                        <input
                          type="password"
                          className="w-36 flex-shrink-0 border border-white/[0.08] rounded-lg px-2.5 py-1.5 bg-white/[0.04] focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 text-[11px] text-slate-400"
                          placeholder="API Key（留空继承全局）"
                          value={m.apiKey || ""}
                          onChange={(e) => updateModel(m.id, { apiKey: e.target.value })}
                        />
                      </div>

                      {/* 测试连接 */}
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className={`px-2.5 py-1 rounded-lg text-[11px] transition flex items-center gap-1 ${
                            ts === "ok" ? "bg-emerald-500/10 text-emerald-400" :
                            ts === "fail" ? "bg-red-500/10 text-red-400" :
                            ts === "testing" ? "bg-amber-500/10 text-amber-400" :
                            "bg-white/[0.04] text-slate-400 hover:bg-white/[0.08]"
                          }`}
                          disabled={ts === "testing"}
                          onClick={async () => {
                            setModelTestStatus((s) => ({ ...s, [m.id]: "testing" }));
                            setModelTestMsg((s) => ({ ...s, [m.id]: "" }));
                            const baseUrl = m.baseUrl?.trim() || cfgDraft.globalBaseUrl;
                            const apiKey = m.apiKey?.trim() || cfgDraft.globalApiKey;
                            const result = await testModelConnection(baseUrl, apiKey, m.modelId);
                            setModelTestStatus((s) => ({ ...s, [m.id]: result.ok ? "ok" : "fail" }));
                            setModelTestMsg((s) => ({ ...s, [m.id]: result.message + (result.ok ? "" : (result.detail ? `\n${result.detail}` : "")) }));
                          }}
                        >
                          {ts === "testing" ? (
                            <><svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>测试中…</>
                          ) : ts === "ok" ? (
                            <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>联通</>
                          ) : ts === "fail" ? (
                            <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>失败</>
                          ) : (
                            <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>测试连接</>
                          )}
                        </button>
                      </div>
                      {tmsg && (
                        <div className={`mt-2 px-2.5 py-1.5 rounded-lg text-[10px] whitespace-pre-wrap leading-relaxed ${
                          ts === "ok" ? "bg-emerald-500/10 border border-emerald-500/15 text-emerald-400" : "bg-red-500/10 border border-red-500/15 text-red-400"
                        }`}>{tmsg}</div>
                      )}
                    </div>
                  );
                })}
              </>
            )}

            {settingsTab === "chat" && (
              <>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-400">共 {cfgDraft.chatModels.length} 个模型</span>
                    <button
                      type="button"
                      className="px-2 py-1 rounded-lg bg-primary-500/10 text-primary-400 text-[11px] hover:bg-primary-500/20 transition"
                      onClick={() => handleFetchModels("chat")}
                      disabled={fetching}
                    >{fetching ? "获取中…" : "自动获取模型"}</button>
                  </div>
                  <button
                    type="button"
                    className="px-2 py-1 rounded-lg bg-white/[0.04] text-slate-400 text-[11px] hover:bg-white/[0.08] transition"
                    onClick={addChatModel}
                  >+ 手动添加</button>
                </div>
                {fetchErr && <p className="text-[10px] text-red-400 mb-2">{fetchErr}</p>}

                {cfgDraft.chatModels.map((m) => {
                  const ts = modelTestStatus[m.id] || "idle";
                  const tmsg = modelTestMsg[m.id] || "";
                  return (
                    <div key={m.id} className="glass-card rounded-xl p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          className="flex-1 min-w-0 border border-white/[0.08] rounded-lg px-2.5 py-1.5 bg-white/[0.06] focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 text-xs"
                          placeholder="Model ID（如 gpt-4o）"
                          value={m.modelId}
                          onChange={(e) => updateChatModel(m.id, { modelId: e.target.value })}
                        />
                        <input
                          type="text"
                          className="w-24 flex-shrink-0 border border-white/[0.08] rounded-lg px-2.5 py-1.5 bg-white/[0.06] focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 text-xs"
                          placeholder="别名"
                          value={m.label || ""}
                          onChange={(e) => updateChatModel(m.id, { label: e.target.value })}
                        />
                        <button
                          type="button"
                          className="text-slate-500 hover:text-red-400 text-sm p-1 rounded hover:bg-red-500/10 transition flex-shrink-0"
                          onClick={() => removeChatModel(m.id)}
                          title="删除此模型"
                        >×</button>
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          className="flex-1 min-w-0 border border-white/[0.08] rounded-lg px-2.5 py-1.5 bg-white/[0.04] focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 text-[11px] text-slate-400"
                          placeholder="Base URL（留空继承全局）"
                          value={m.baseUrl || ""}
                          onChange={(e) => updateChatModel(m.id, { baseUrl: e.target.value })}
                        />
                        <input
                          type="password"
                          className="w-36 flex-shrink-0 border border-white/[0.08] rounded-lg px-2.5 py-1.5 bg-white/[0.04] focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 text-[11px] text-slate-400"
                          placeholder="API Key（留空继承全局）"
                          value={m.apiKey || ""}
                          onChange={(e) => updateChatModel(m.id, { apiKey: e.target.value })}
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className={`px-2.5 py-1 rounded-lg text-[11px] transition flex items-center gap-1 ${
                            ts === "ok" ? "bg-emerald-500/10 text-emerald-400" :
                            ts === "fail" ? "bg-red-500/10 text-red-400" :
                            ts === "testing" ? "bg-amber-500/10 text-amber-400" :
                            "bg-white/[0.04] text-slate-400 hover:bg-white/[0.08]"
                          }`}
                          disabled={ts === "testing"}
                          onClick={async () => {
                            setModelTestStatus((s) => ({ ...s, [m.id]: "testing" }));
                            setModelTestMsg((s) => ({ ...s, [m.id]: "" }));
                            const baseUrl = m.baseUrl?.trim() || cfgDraft.globalBaseUrl;
                            const apiKey = m.apiKey?.trim() || cfgDraft.globalApiKey;
                            const result = await testModelConnection(baseUrl, apiKey, m.modelId);
                            setModelTestStatus((s) => ({ ...s, [m.id]: result.ok ? "ok" : "fail" }));
                            setModelTestMsg((s) => ({ ...s, [m.id]: result.message + (result.ok ? "" : (result.detail ? `\n${result.detail}` : "")) }));
                          }}
                        >
                          {ts === "testing" ? (
                            <><svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>测试中…</>
                          ) : ts === "ok" ? (
                            <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>联通</>
                          ) : ts === "fail" ? (
                            <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>失败</>
                          ) : (
                            <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>测试连接</>
                          )}
                        </button>
                      </div>
                      {tmsg && (
                        <div className={`mt-2 px-2.5 py-1.5 rounded-lg text-[10px] whitespace-pre-wrap leading-relaxed ${
                          ts === "ok" ? "bg-emerald-500/10 border border-emerald-500/15 text-emerald-400" : "bg-red-500/10 border border-red-500/15 text-red-400"
                        }`}>{tmsg}</div>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </div>

          {/* 底部操作栏 */}
          <div className="flex-shrink-0 border-t border-white/[0.06] px-6 py-4 flex items-center justify-between rounded-b-2xl">
            <p className="text-[10px] text-slate-400">
              请求头：<code className="bg-white/[0.06] px-1.5 py-0.5 rounded text-slate-400">Authorization: Bearer API_KEY</code>
            </p>
            <div className="flex gap-2">
              <button className="px-4 py-2 rounded-lg glass-button text-slate-300 text-sm transition" onClick={onClose}>取消</button>
              <button className="px-5 py-2 rounded-lg gradient-button text-white text-sm font-medium" onClick={handleSave}>保存</button>
            </div>
          </div>
        </div>
      </div>

      {/* ── 供应商管理弹窗（叠加在设置弹窗之上） ── */}
      <VendorManager
        open={vendorManagerOpen}
        onClose={() => setVendorManagerOpen(false)}
        cfgDraft={cfgDraft}
        setCfgDraft={setCfgDraft}
      />

      {/* ── 模型选择弹窗（获取模型后弹出） ── */}
      {modelPickerOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center overlay-dark p-4" onClick={() => setModelPickerOpen(false)}>
          <div
            className="glass-popup w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden popup-enter"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between flex-shrink-0">
              <div>
                <h3 className="text-sm font-bold text-slate-100">选择要添加的{modelPickerMode === "image" ? "Image" : "Chat"}模型</h3>
                <p className="text-[10px] text-slate-500 mt-0.5">已获取 {modelPickerList.length} 个模型，勾选后点击确认添加</p>
              </div>
              <button className="text-slate-500 hover:text-slate-300 text-xl leading-none p-1" onClick={() => setModelPickerOpen(false)}>×</button>
            </div>

            {/* 搜索 + 全选 */}
            <div className="px-5 py-2 border-b border-white/[0.06] flex items-center gap-2 flex-shrink-0">
              <div className="relative flex-1">
                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                <input
                  type="text"
                  className="w-full pl-8 pr-3 py-1.5 border border-white/[0.08] rounded-lg text-xs bg-white/[0.04] focus:outline-none focus:ring-1 focus:ring-primary-500/30 text-slate-200"
                  placeholder="搜索模型 id…"
                  value={modelPickerSearch}
                  onChange={(e) => setModelPickerSearch(e.target.value)}
                />
              </div>
              <button
                className="px-2.5 py-1.5 rounded-lg text-[11px] border border-white/[0.08] text-slate-400 hover:bg-white/[0.06] transition"
               onClick={() => {
                   const allSelected = filteredPickerModels.every((m) => modelPickerSelected.has(m));
                  setModelPickerSelected((prev) => {
                    const next = new Set(prev);
                    if (allSelected) {
                      filteredPickerModels.forEach((m) => next.delete(m));
                    } else {
                      filteredPickerModels.forEach((m) => next.add(m));
                    }
                    return next;
                  });
                }}
              >
                {filteredPickerModels.every((m) => modelPickerSelected.has(m)) ? "取消全选" : "全选"}
              </button>
            </div>

            {/* 模型列表 */}
            <div className="flex-1 overflow-y-auto app-scrollbar px-5 py-3 space-y-1 min-h-0">
              {filteredPickerModels.map((mid) => {
                const checked = modelPickerSelected.has(mid);
                return (
                  <label
                    key={mid}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition ${
                      checked ? "bg-primary-500/10 border border-primary-500/20" : "hover:bg-white/[0.04] border border-transparent"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="w-3.5 h-3.5 rounded border-white/[0.2] text-primary-500 focus:ring-primary-500/30 bg-transparent"
                      checked={checked}
                      onChange={() => {
                        setModelPickerSelected((prev) => {
                          const next = new Set(prev);
                          if (next.has(mid)) next.delete(mid); else next.add(mid);
                          return next;
                        });
                      }}
                    />
                    <span className="text-xs text-slate-300 font-mono truncate">{mid}</span>
                  </label>
                );
              })}
              {filteredPickerModels.length === 0 && (
                <p className="text-center text-xs text-slate-500 py-4">无匹配模型</p>
              )}
            </div>

            {/* 底部 */}
            <div className="px-5 py-3 border-t border-white/[0.06] flex items-center justify-between flex-shrink-0">
              <span className="text-[11px] text-slate-400">
                已选 <span className="font-semibold text-slate-200">{modelPickerSelected.size}</span> 个模型
              </span>
              <div className="flex gap-2">
                <button className="px-3 py-1.5 rounded-lg text-xs border border-white/[0.08] text-slate-400 hover:bg-white/[0.06] transition" onClick={() => setModelPickerOpen(false)}>取消</button>
                <button
                  className="px-4 py-1.5 rounded-lg text-xs font-medium gradient-button text-white"
                  onClick={handleModelPickerConfirm}
                  disabled={modelPickerSelected.size === 0}
                >确认添加</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default SettingsDialog;
