// ─────────────────────────────────────────────────────────────────────────────
//  useAppState.ts — App.tsx 状态迁移适配层
//
//  用法：
//    const s = useAppState();
//    s.prompt / s.setPrompt / s.handleGenerate …
//
//  通过这个 hook 将三个 store 的状态汇聚，App.tsx 只需一行替换：
//    - 删除所有 useState 声明
//    - 在 function App() 顶部加一行 `const s = useAppState();`
//    - 将所有 `prompt` → `s.prompt`，`setPrompt` → `s.setPrompt` 等
//
//  优势：
//    1. App.tsx 改动最小化（批量搜索替换即可）
//    2. store 测试与 UI 测试完全解耦
//    3. 后续可按需拆分子组件，各自直接订阅对应 store
// ─────────────────────────────────────────────────────────────────────────────

import { useGenerationStore } from "../store/generationStore";
import { useSettingsStore }   from "../store/settingsStore";
import { useUiStore }         from "../store/uiStore";

export function useAppState() {
  const gen  = useGenerationStore();
  const cfg  = useSettingsStore();
  const ui   = useUiStore();

  return {
    // ── 生图参数（原 App.tsx useState）─────────────────────────────────────
    prompt:             gen.prompt,
    setPrompt:          gen.setPrompt,
    negativePrompt:     gen.negativePrompt,
    setNegativePrompt:  gen.setNegativePrompt,
    batchSize:          gen.batchSize,
    setBatchSize:       gen.setBatchSize,
    width:              gen.width,
    height:             gen.height,
    resolutionPreset:   gen.resolutionPreset,
    setResolutionPreset:gen.setResolutionPreset,
    sizeTier:           gen.sizeTier,
    setSizeTier:        gen.setSizeTier,
    model:              gen.model,
    setModel:           gen.setModel,
    modelList:          gen.modelList,
    setModelList:       gen.setModelList,
    referenceSlots:     gen.referenceSlots,
    referencePreviewUrls: gen.referencePreviewUrls,
    referenceSize:      gen.referenceSize,
    setReferenceSlot:   gen.setReferenceSlot,
    syncReferencePreviewUrls: gen.syncReferencePreviewUrls,

    // ── 生图状态 ─────────────────────────────────────────────────────────────
    status:             gen.status,
    elapsedSeconds:     gen.elapsedSeconds,
    progressPct:        gen.progressPct,
    lastDuration:       gen.lastDuration,
    error:              gen.error,
    setError:           (v: string | null) => useGenerationStore.setState({ error: v }),

    // ── 生图结果 ─────────────────────────────────────────────────────────────
    results:            gen.results,
    setResults:         gen.setResults,
    resultActiveIdx:    gen.resultActiveIdx,
    setResultActiveIdx: gen.setResultActiveIdx,
    selectedImageIds:   gen.selectedImageIds,
    toggleImageSelection: gen.toggleImageSelection,
    toggleSelectAll:    gen.toggleSelectAll,
    downloadStatus:     gen.downloadStatus,
    ratioMismatchDialog: gen.ratioMismatchDialog,
    setRatioMismatchDialog: gen.setRatioMismatchDialog,

    // ── 历史 & 模板 ──────────────────────────────────────────────────────────
    generationHistory:  gen.generationHistory,
    promptHistory:      gen.promptHistory,
    setPromptHistory:   (updater: ((prev: string[]) => string[]) | string[]) => {
      const prev = useGenerationStore.getState().promptHistory;
      const next = typeof updater === "function" ? updater(prev) : updater;
      useGenerationStore.setState({ promptHistory: next });
    },
    promptTemplates:    gen.promptTemplates,
    deleteHistory:      gen.deleteHistory,
    deletePromptHistory:gen.deletePromptHistory,
    addPromptTemplate:  gen.addPromptTemplate,
    updatePromptTemplate: gen.updatePromptTemplate,
    deletePromptTemplate: gen.deletePromptTemplate,
    applyTemplate:      gen.applyTemplate,
    restoreFromHistory: gen.restoreFromHistory,

    // ── 生图动作 ─────────────────────────────────────────────────────────────
    handleGenerate:     gen.handleGenerate,
    handleDownloadSingle: gen.handleDownloadSingle,
    handleBatchDownload: gen.handleBatchDownload,

    // ── 设置弹窗 ─────────────────────────────────────────────────────────────
    settingsOpen:       cfg.settingsOpen,
    setSettingsOpen:    (v: boolean) => v ? cfg.openSettings() : cfg.closeSettings(),
    settingsTab:        cfg.settingsTab,
    setSettingsTab:     cfg.setSettingsTab,
    cfgDraft:           cfg.cfgDraft,
    setCfgDraft:        cfg.patchCfgDraft,
    saveDraft:          cfg.saveDraft,
    modelTestStatus:    cfg.modelTestStatus,
    setModelTestStatus: (v: Record<string, "idle"|"testing"|"ok"|"fail">) =>
      useSettingsStore.setState({ modelTestStatus: v }),
    modelTestMsg:       cfg.modelTestMsg,
    setModelTestMsg:    (v: Record<string, string>) =>
      useSettingsStore.setState({ modelTestMsg: v }),
    syncToast:          cfg.syncToast,
    setSyncToast:       cfg.setSyncToast,
    settingsModelsFetching:  cfg.settingsModelsFetching,
    settingsModelsFetchErr:  cfg.settingsModelsFetchErr,
    modelPickerOpen:    cfg.modelPickerOpen,
    setModelPickerOpen: (v: boolean) => v ? undefined : cfg.closeModelPicker(),
    modelPickerMode:    cfg.modelPickerMode,
    modelPickerList:    cfg.modelPickerList,
    modelPickerSelected: cfg.modelPickerSelected,
    modelPickerSearch:  cfg.modelPickerSearch,
    setModelPickerSearch: cfg.setModelPickerSearch,
    modelPickerCategoryTag: cfg.modelPickerCategoryTag,
    setModelPickerCategoryTag: cfg.setModelPickerCategoryTag,
    modelPickerVendorTag: cfg.modelPickerVendorTag,
    setModelPickerVendorTag: cfg.setModelPickerVendorTag,
    handleFetchModels:  cfg.fetchModels,
    confirmModelPicker: cfg.confirmModelPicker,
    vendorDialogOpen:   cfg.vendorDialogOpen,
    vendorEditingId:    cfg.vendorEditingId,
    vendorNameInput:    cfg.vendorNameInput,
    setVendorNameInput: cfg.setVendorNameInput,
    vendorUrlInput:     cfg.vendorUrlInput,
    setVendorUrlInput:  cfg.setVendorUrlInput,
    vendorApiKeyInput:  cfg.vendorApiKeyInput,
    setVendorApiKeyInput: cfg.setVendorApiKeyInput,
    vendorRemarkInput:  cfg.vendorRemarkInput,
    setVendorRemarkInput: cfg.setVendorRemarkInput,
    vendorDeleteConfirm: cfg.vendorDeleteConfirm,
    setVendorDeleteConfirm: cfg.setVendorDeleteConfirm,
    vendorDropdownOpen: cfg.vendorDropdownOpen,
    setVendorDropdownOpen: cfg.setVendorDropdownOpen,
    openVendorDialog:   cfg.openVendorDialog,
    closeVendorDialog:  cfg.closeVendorDialog,
    saveVendor:         cfg.saveVendor,
    deleteVendor:       cfg.deleteVendor,
    switchVendor:       cfg.switchVendor,
    setAsDefaultVendor: cfg.setAsDefaultVendor,
    globalSaveVendorName:   cfg.globalSaveVendorName,
    setGlobalSaveVendorName: cfg.setGlobalSaveVendorName,
    globalSaveVendorRemark:  cfg.globalSaveVendorRemark,
    setGlobalSaveVendorRemark: cfg.setGlobalSaveVendorRemark,
    globalSaveVendorToast: cfg.globalSaveVendorToast,
    quickSaveGlobalAsVendor: cfg.quickSaveGlobalAsVendor,
    handleSyncGlobalBaseUrl: cfg.handleSyncGlobalBaseUrl,
    testImageModelFn:   cfg.testImageModel,
    testChatModelFn:    cfg.testChatModel,

    // ── UI 状态 ──────────────────────────────────────────────────────────────
    rightPanelWidth:    ui.rightPanelWidth,
    setRightPanelWidth: ui.setRightPanelWidth,
    isDragging:         ui.isDraggingPanel,
    setIsDragging:      ui.setIsDraggingPanel,

    theme:              ui.theme,
    setThemeState:      ui.setTheme,
    themeMenuOpen:      ui.themeMenuOpen,
    setThemeMenuOpen:   ui.setThemeMenuOpen,

    balanceStatus:      ui.balanceStatus,
    setBalanceStatus:   ui.setBalanceStatus,
    balanceMessage:     ui.balanceMessage,
    setBalanceMessage:  ui.setBalanceMessage,
    balancePopupOpen:   ui.balancePopupOpen,
    setBalancePopupOpen:ui.setBalancePopupOpen,
    comfyPopupOpen:     ui.comfyPopupOpen,
    setComfyPopupOpen:  ui.setComfyPopupOpen,
    enginePopupOpen:    ui.enginePopupOpen,
    setEnginePopupOpen: ui.setEnginePopupOpen,

    performanceMonitorOpen: ui.performanceMonitorOpen,
    setPerformanceMonitorOpen: ui.setPerformanceMonitorOpen,
    perfPanelOffset:    ui.perfPanelOffset,
    setPerfPanelOffset: ui.setPerfPanelOffset,
    isDraggingPerf:     ui.isDraggingPerf,
    setIsDraggingPerf:  ui.setIsDraggingPerf,
    performanceData:    ui.performanceData,
    setPerformanceData: ui.setPerformanceData,

    previewImage:       ui.previewImage,
    setPreviewImage:    ui.setPreviewImage,
    imageEditorUrl:     ui.imageEditorUrl,
    setImageEditorUrl:  ui.setImageEditorUrl,
    imgZoom:            ui.imgZoom,
    setImgZoom:         ui.setImgZoom,
    imgOffset:          ui.imgOffset,
    setImgOffset:       ui.setImgOffset,
    isDraggingImg:      ui.isDraggingImg,
    setIsDraggingImg:   ui.setIsDraggingImg,

    historyPanelOpen:   ui.historyPanelOpen,
    setHistoryPanelOpen:ui.setHistoryPanelOpen,
    historyFullPreview: ui.historyFullPreview,
    setHistoryFullPreview: ui.setHistoryFullPreview,
    historyBatchMode:   ui.historyBatchMode,
    setHistoryBatchMode:ui.setHistoryBatchMode,
    historySelected:    ui.historySelected,
    toggleHistorySelected: ui.toggleHistorySelected,
    clearHistorySelected: ui.clearHistorySelected,
    errorDetailDialog:  ui.errorDetailDialog,
    setErrorDetailDialog: ui.setErrorDetailDialog,
    histPreviewZoom:    ui.histPreviewZoom,
    setHistPreviewZoom: ui.setHistPreviewZoom,
    histPreviewOffset:  ui.histPreviewOffset,
    setHistPreviewOffset: ui.setHistPreviewOffset,
    isDraggingHistPreview: ui.isDraggingHistPreview,
    setIsDraggingHistPreview: ui.setIsDraggingHistPreview,
    histPreviewDownloading: ui.histPreviewDownloading,
    setHistPreviewDownloading: ui.setHistPreviewDownloading,
    historyBtnPosition: ui.historyBtnPosition,
    setHistoryBtnPosition: ui.setHistoryBtnPosition,
    isDraggingHistory:  ui.isDraggingHistoryBtn,
    setIsDraggingHistory: ui.setIsDraggingHistoryBtn,

    mainModelPickerOpen:    ui.mainModelPickerOpen,
    setMainModelPickerOpen: ui.setMainModelPickerOpen,
    mainModelPickerSelected:    ui.mainModelPickerSelected,
    setMainModelPickerSelected: ui.setMainModelPickerSelected,
    modelModalSize:     ui.modelModalSize,
    setModelModalSize:  ui.setModelModalSize,

    manageDialogOpen:   ui.manageDialogOpen,
    setManageDialogOpen:(v: boolean) => v ? undefined : ui.closeManageDialog(),
    openManageDialog:   ui.openManageDialog,
    closeManageDialog:  ui.closeManageDialog,
    manageDialogType:   ui.manageDialogType,
    setManageDialogType:(v: "history" | "template") =>
      useUiStore.setState({ manageDialogType: v }),
    manageModalSize:    ui.manageModalSize,
    setManageModalSize: ui.setManageModalSize,

    inlineEditing:      ui.inlineEditing,
    setInlineEditing:   ui.setInlineEditing,
    inlineEditName:     ui.inlineEditName,
    setInlineEditName:  ui.setInlineEditName,
    inlineEditPrompt:   ui.inlineEditPrompt,
    setInlineEditPrompt:ui.setInlineEditPrompt,
    inlineEditNegative: ui.inlineEditNegative,
    setInlineEditNegative: ui.setInlineEditNegative,
    showNewTemplateForm:ui.showNewTemplateForm,
    setShowNewTemplateForm: ui.setShowNewTemplateForm,
    newTplName:         ui.newTplName,
    setNewTplName:      ui.setNewTplName,
    newTplPrompt:       ui.newTplPrompt,
    setNewTplPrompt:    ui.setNewTplPrompt,

    templateNameInput:  ui.templateNameInput,
    setTemplateNameInput: ui.setTemplateNameInput,
    showTemplateSave:   ui.showTemplateSave,
    setShowTemplateSave:ui.setShowTemplateSave,
    historyTemplateValue: ui.historyTemplateValue,
    setHistoryTemplateValue: ui.setHistoryTemplateValue,

    refImgOpen:         ui.refImgOpen,
    setRefImgOpen:      ui.setRefImgOpen,

    promptOptimizeDialogOpen: ui.promptOptimizeDialogOpen,
    setPromptOptimizeDialogOpen: ui.setPromptOptimizeDialogOpen,
    isOptimizing:       ui.isOptimizing,
    setIsOptimizing:    ui.setIsOptimizing,

    showDetailedLog:    ui.showDetailedLog,
    setShowDetailedLog: ui.setShowDetailedLog,
    logEntries:         ui.logEntries,
    appendLogEntry:     ui.appendLogEntry,
    updateLastLogEntry: ui.updateLastLogEntry,

    showAbout:          ui.showAbout,
    setShowAbout:       ui.setShowAbout,

    // ── 补充：还未映射的状态 ───────────────────────────────────────────────

    // 提示词预览弹窗
    promptPreviewOpen:        ui.promptPreviewOpen,
    setPromptPreviewOpen:     ui.setPromptPreviewOpen,
    promptPreviewOffset:      ui.promptPreviewOffset,
    setPromptPreviewOffset:    ui.setPromptPreviewOffset,
    isDraggingPromptPreview:   ui.isDraggingPromptPreview,
    setIsDraggingPromptPreview: ui.setIsDraggingPromptPreview,

    // 设置表单（legacy，尚未迁移到 settingsStore）
    settingsForm:          ui.settingsForm,
    setSettingsForm:       ui.setSettingsForm,
    apiCheckStatus:        ui.apiCheckStatus,
    setApiCheckStatus:     ui.setApiCheckStatus,
    apiCheckMessage:       ui.apiCheckMessage,
    setApiCheckMessage:    ui.setApiCheckMessage,
    testApiStatus:         ui.testApiStatus,
    setTestApiStatus:      ui.setTestApiStatus,
    testApiMessage:        ui.testApiMessage,
    setTestApiMessage:     ui.setTestApiMessage,
    modelsFetchStatus:     ui.modelsFetchStatus,
    setModelsFetchStatus:  ui.setModelsFetchStatus,
    modelsFetchError:      ui.modelsFetchError,
    setModelsFetchError:   ui.setModelsFetchError,
    modelSelectOpen:       ui.modelSelectOpen,
    setModelSelectOpen:    ui.setModelSelectOpen,
    fetchedModelList:      ui.fetchedModelList,
    setFetchedModelList:   ui.setFetchedModelList,
    selectedModelIdsInModal: ui.selectedModelIdsInModal,
    setSelectedModelIdsInModal: ui.setSelectedModelIdsInModal,
    modelSearchQuery:      ui.modelSearchQuery,
    setModelSearchQuery:   ui.setModelSearchQuery,
    filterCategoryTag:     ui.filterCategoryTag,
    setFilterCategoryTag:  ui.setFilterCategoryTag,
    filterVendorTag:       ui.filterVendorTag,
    setFilterVendorTag:    ui.setFilterVendorTag,
    selectedModelManageOpen: ui.selectedModelManageOpen,
    setSelectedModelManageOpen: ui.setSelectedModelManageOpen,

  };
}
