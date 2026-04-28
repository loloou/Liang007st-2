// ─────────────────────────────────────────────────────────────────────────────
//  settingsStore.ts — 设置弹窗的状态中心
//
//  职责：
//    - 设置弹窗开关 & 当前 Tab
//    - API 配置草稿（cfgDraft）—— 打开时从 localStorage 拷贝，保存时写回
//    - 模型测试状态（testStatus / testMsg per modelId）
//    - 模型获取 & 选择弹窗流程
//    - 供应商管理表单
//    - Global Config 快速保存供应商
// ─────────────────────────────────────────────────────────────────────────────

import { create } from "zustand";
import {
  getApiConfig,
  saveApiConfig,
  updateApiConfig,
  syncGlobalBaseUrl,
  addApiVendor,
  removeApiVendor,
  switchApiVendor,
  updateApiVendor,
  setDefaultApiVendor,
  type ApiConfig,
  type ImageModel,
  type ChatModel,
  type ApiVendor,
} from "../api/settings";
import { testChatModel, testImageModel, fetchModelList, type TestResult } from "../api/modelConfig";

// ── 类型 ─────────────────────────────────────────────────────────────────────

type ModelTestStatus = "idle" | "testing" | "ok" | "fail";

interface SettingsState {
  // 弹窗开关
  settingsOpen: boolean;
  settingsTab: "image" | "chat";

  // 配置草稿（编辑中，尚未保存）
  cfgDraft: ApiConfig;

  // 每个模型的测试状态 { [modelInternalId]: status }
  modelTestStatus: Record<string, ModelTestStatus>;
  modelTestMsg: Record<string, string>;

  // 全局 BaseUrl 同步 toast
  syncToast: boolean;

  // 获取模型列表
  settingsModelsFetching: boolean;
  settingsModelsFetchErr: string;

  // 模型选择弹窗（获取模型列表后弹出）
  modelPickerOpen: boolean;
  modelPickerMode: "image" | "chat";
  modelPickerList: string[];
  modelPickerSelected: Set<string>;
  modelPickerSearch: string;
  modelPickerCategoryTag: string | null;
  modelPickerVendorTag: string | null;

  // 供应商管理弹窗
  vendorDialogOpen: boolean;
  vendorEditingId: string | null;    // null = 新增模式
  vendorNameInput: string;
  vendorUrlInput: string;
  vendorApiKeyInput: string;
  vendorRemarkInput: string;
  vendorDeleteConfirm: string | null;
  vendorDropdownOpen: boolean;

  // Global Config 快速保存供应商
  globalSaveVendorRemark: string;
  globalSaveVendorName: string;
  globalSaveVendorToast: boolean;

  // ── actions ────────────────────────────────────────────────────────────────

  /** 打开设置弹窗，从 localStorage 重新拷贝草稿 */
  openSettings: (tab?: "image" | "chat") => void;
  closeSettings: () => void;
  setSettingsTab: (tab: "image" | "chat") => void;

  /** 更新草稿字段 */
  patchCfgDraft: (patch: Partial<ApiConfig>) => void;

  /** 保存草稿到 localStorage */
  saveDraft: () => void;

  /** 同步全局 BaseUrl 到所有没有单独覆盖 baseUrl 的模型 */
  handleSyncGlobalBaseUrl: () => void;

  // 模型测试
  testImageModel: (model: ImageModel) => Promise<void>;
  testChatModel: (model: ChatModel) => Promise<void>;
  clearModelTestStatus: () => void;

  // 获取模型列表
  fetchModels: (mode: "image" | "chat") => Promise<void>;

  // 模型选择弹窗
  openModelPicker: (mode: "image" | "chat", list: string[]) => void;
  closeModelPicker: () => void;
  toggleModelPickerItem: (modelId: string) => void;
  setModelPickerSearch: (v: string) => void;
  setModelPickerCategoryTag: (v: string | null) => void;
  setModelPickerVendorTag: (v: string | null) => void;
  /** 确认选择，将选中的模型写入草稿 */
  confirmModelPicker: () => void;

  // 供应商管理
  openVendorDialog: (vendorId?: string) => void;
  closeVendorDialog: () => void;
  setVendorNameInput: (v: string) => void;
  setVendorUrlInput: (v: string) => void;
  setVendorApiKeyInput: (v: string) => void;
  setVendorRemarkInput: (v: string) => void;
  setVendorDeleteConfirm: (id: string | null) => void;
  setVendorDropdownOpen: (v: boolean) => void;
  saveVendor: () => void;
  deleteVendor: (id: string) => void;
  switchVendor: (id: string) => void;
  setAsDefaultVendor: (id: string) => void;

  // Global Config 快速保存
  setGlobalSaveVendorName: (v: string) => void;
  setGlobalSaveVendorRemark: (v: string) => void;
  quickSaveGlobalAsVendor: () => void;
  setSyncToast: (v: boolean) => void;
}

// ── Store 实现 ────────────────────────────────────────────────────────────────

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  // ── 初始值 ────────────────────────────────────────────────────────────────
  settingsOpen: false,
  settingsTab: "image",
  cfgDraft: getApiConfig(),
  modelTestStatus: {},
  modelTestMsg: {},
  syncToast: false,
  settingsModelsFetching: false,
  settingsModelsFetchErr: "",
  modelPickerOpen: false,
  modelPickerMode: "image",
  modelPickerList: [],
  modelPickerSelected: new Set(),
  modelPickerSearch: "",
  modelPickerCategoryTag: null,
  modelPickerVendorTag: null,
  vendorDialogOpen: false,
  vendorEditingId: null,
  vendorNameInput: "",
  vendorUrlInput: "",
  vendorApiKeyInput: "",
  vendorRemarkInput: "",
  vendorDeleteConfirm: null,
  vendorDropdownOpen: false,
  globalSaveVendorRemark: "",
  globalSaveVendorName: "",
  globalSaveVendorToast: false,

  // ── 弹窗开关 ──────────────────────────────────────────────────────────────
  openSettings: (tab = "image") => {
    set({
      settingsOpen: true,
      settingsTab: tab,
      cfgDraft: getApiConfig(),      // 重新拷贝最新配置
      modelTestStatus: {},
      modelTestMsg: {},
      syncToast: false,
      settingsModelsFetching: false,
      settingsModelsFetchErr: "",
    });
  },

  closeSettings: () => set({ settingsOpen: false }),
  setSettingsTab: (tab) => set({ settingsTab: tab }),

  patchCfgDraft: (patch) =>
    set((s) => ({ cfgDraft: { ...s.cfgDraft, ...patch } })),

  saveDraft: () => {
    const { cfgDraft } = get();
    saveApiConfig(cfgDraft);
  },

  handleSyncGlobalBaseUrl: () => {
    const { cfgDraft } = get();
    const synced = syncGlobalBaseUrl(cfgDraft.globalBaseUrl);
    set({ cfgDraft: synced, syncToast: true });
    setTimeout(() => set({ syncToast: false }), 2000);
    updateApiConfig(synced);
  },

  setSyncToast: (v) => set({ syncToast: v }),

  // ── 模型测试 ──────────────────────────────────────────────────────────────
  testImageModel: async (model) => {
    const { cfgDraft } = get();
    set((s) => ({
      modelTestStatus: { ...s.modelTestStatus, [model.id]: "testing" },
      modelTestMsg: { ...s.modelTestMsg, [model.id]: "" },
    }));
    const res: TestResult = await testImageModel(model, cfgDraft);
    set((s) => ({
      modelTestStatus: { ...s.modelTestStatus, [model.id]: res.ok ? "ok" : "fail" },
      modelTestMsg: { ...s.modelTestMsg, [model.id]: res.message },
    }));
  },

  testChatModel: async (model) => {
    const { cfgDraft } = get();
    set((s) => ({
      modelTestStatus: { ...s.modelTestStatus, [model.id]: "testing" },
      modelTestMsg: { ...s.modelTestMsg, [model.id]: "" },
    }));
    const res: TestResult = await testChatModel(model, cfgDraft);
    set((s) => ({
      modelTestStatus: { ...s.modelTestStatus, [model.id]: res.ok ? "ok" : "fail" },
      modelTestMsg: { ...s.modelTestMsg, [model.id]: res.message },
    }));
  },

  clearModelTestStatus: () => set({ modelTestStatus: {}, modelTestMsg: {} }),

  // ── 获取模型列表 ──────────────────────────────────────────────────────────
  fetchModels: async (mode) => {
    set({ settingsModelsFetching: true, settingsModelsFetchErr: "" });
    try {
      const { cfgDraft } = get();
      const r = await fetchModelList(cfgDraft.globalBaseUrl, cfgDraft.globalApiKey);
      set({ settingsModelsFetching: false });
      if (r.ok) {
        get().openModelPicker(mode, r.models ?? []);
      } else {
        set({ settingsModelsFetchErr: r.message ?? "获取模型列表失败" });
      }
    } catch (e) {
      set({
        settingsModelsFetching: false,
        settingsModelsFetchErr: e instanceof Error ? e.message : String(e),
      });
    }
  },

  // ── 模型选择弹窗 ──────────────────────────────────────────────────────────
  openModelPicker: (mode, list) => {
    const { cfgDraft } = get();
    const existing = mode === "image"
      ? new Set(cfgDraft.imageModels.map((m) => m.modelId))
      : new Set(cfgDraft.chatModels.map((m) => m.modelId));
    set({
      modelPickerOpen: true,
      modelPickerMode: mode,
      modelPickerList: list,
      modelPickerSelected: existing,
      modelPickerSearch: "",
      modelPickerCategoryTag: null,
      modelPickerVendorTag: null,
    });
  },

  closeModelPicker: () => set({ modelPickerOpen: false }),

  toggleModelPickerItem: (modelId) => {
    const next = new Set(get().modelPickerSelected);
    if (next.has(modelId)) next.delete(modelId); else next.add(modelId);
    set({ modelPickerSelected: next });
  },

  setModelPickerSearch: (v) => set({ modelPickerSearch: v }),
  setModelPickerCategoryTag: (v) => set({ modelPickerCategoryTag: v }),
  setModelPickerVendorTag: (v) => set({ modelPickerVendorTag: v }),

  confirmModelPicker: () => {
    const { modelPickerMode, modelPickerSelected, cfgDraft } = get();
    const selectedIds = [...modelPickerSelected];

    if (modelPickerMode === "image") {
      // 保留旧有配置（apiKey/baseUrl/apiSpec），只补充新选的
      const existingMap = new Map(cfgDraft.imageModels.map((m) => [m.modelId, m]));
      const newModels: ImageModel[] = selectedIds.map((mid) =>
        existingMap.get(mid) ?? {
          id: Math.random().toString(36).slice(2) + Date.now().toString(36),
          modelId: mid,
        }
      );
      const newCfg: ApiConfig = { ...cfgDraft, imageModels: newModels };
      set({ cfgDraft: newCfg });
      updateApiConfig(newCfg);
    } else {
      const existingMap = new Map(cfgDraft.chatModels.map((m) => [m.modelId, m]));
      const newModels: ChatModel[] = selectedIds.map((mid) =>
        existingMap.get(mid) ?? {
          id: Math.random().toString(36).slice(2) + Date.now().toString(36),
          modelId: mid,
        }
      );
      const newCfg: ApiConfig = { ...cfgDraft, chatModels: newModels };
      set({ cfgDraft: newCfg });
      updateApiConfig(newCfg);
    }
    set({ modelPickerOpen: false });
  },

  // ── 供应商管理 ────────────────────────────────────────────────────────────
  openVendorDialog: (vendorId) => {
    if (vendorId) {
      const vendor = get().cfgDraft.apiVendors.find((v) => v.id === vendorId);
      if (vendor) {
        set({
          vendorDialogOpen: true,
          vendorEditingId: vendorId,
          vendorNameInput: vendor.name,
          vendorUrlInput: vendor.baseUrl,
          vendorApiKeyInput: vendor.apiKey ?? "",
          vendorRemarkInput: vendor.remark ?? "",
        });
        return;
      }
    }
    set({
      vendorDialogOpen: true,
      vendorEditingId: null,
      vendorNameInput: "",
      vendorUrlInput: "",
      vendorApiKeyInput: "",
      vendorRemarkInput: "",
    });
  },

  closeVendorDialog: () => set({ vendorDialogOpen: false, vendorEditingId: null }),

  setVendorNameInput: (v) => set({ vendorNameInput: v }),
  setVendorUrlInput: (v) => set({ vendorUrlInput: v }),
  setVendorApiKeyInput: (v) => set({ vendorApiKeyInput: v }),
  setVendorRemarkInput: (v) => set({ vendorRemarkInput: v }),
  setVendorDeleteConfirm: (id) => set({ vendorDeleteConfirm: id }),
  setVendorDropdownOpen: (v) => set({ vendorDropdownOpen: v }),

  saveVendor: () => {
    const {
      vendorEditingId,
      vendorNameInput,
      vendorUrlInput,
      vendorApiKeyInput,
      vendorRemarkInput,
      cfgDraft,
    } = get();

    const vendorData: Omit<ApiVendor, "id"> = {
      name: vendorNameInput.trim(),
      baseUrl: vendorUrlInput.trim(),
      apiKey: vendorApiKeyInput.trim() || undefined,
      remark: vendorRemarkInput.trim() || undefined,
    };

    let newCfg: ApiConfig;
    if (vendorEditingId) {
      newCfg = updateApiVendor(vendorEditingId, vendorData);
    } else {
      newCfg = addApiVendor(vendorData);
    }
    set({ cfgDraft: newCfg, vendorDialogOpen: false, vendorEditingId: null });
    updateApiConfig(newCfg);
  },

  deleteVendor: (id) => {
    const newCfg = removeApiVendor(id);
    set({ cfgDraft: newCfg, vendorDeleteConfirm: null });
    updateApiConfig(newCfg);
  },

  switchVendor: (id) => {
    const newCfg = switchApiVendor(id);
    set({ cfgDraft: newCfg, vendorDropdownOpen: false });
    updateApiConfig(newCfg);
  },

  setAsDefaultVendor: (id) => {
    const newCfg = setDefaultApiVendor(id);
    set({ cfgDraft: newCfg });
    updateApiConfig(newCfg);
  },

  // ── Global Config 快速保存供应商 ──────────────────────────────────────────
  setGlobalSaveVendorName: (v) => set({ globalSaveVendorName: v }),
  setGlobalSaveVendorRemark: (v) => set({ globalSaveVendorRemark: v }),

  quickSaveGlobalAsVendor: () => {
    const { cfgDraft, globalSaveVendorName, globalSaveVendorRemark } = get();
    if (!cfgDraft.globalBaseUrl.trim() || !globalSaveVendorName.trim()) return;

    const vendorData: Omit<ApiVendor, "id"> = {
      name: globalSaveVendorName.trim(),
      baseUrl: cfgDraft.globalBaseUrl.trim(),
      apiKey: cfgDraft.globalApiKey.trim() || undefined,
      remark: globalSaveVendorRemark.trim() || undefined,
    };
    const newCfg = addApiVendor(vendorData);
    set({
      cfgDraft: newCfg,
      globalSaveVendorName: "",
      globalSaveVendorRemark: "",
      globalSaveVendorToast: true,
    });
    updateApiConfig(newCfg);
    setTimeout(() => set({ globalSaveVendorToast: false }), 2000);
  },
}));
