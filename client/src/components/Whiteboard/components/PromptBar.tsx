import React, { useState, useRef, useCallback, useEffect } from "react";
import { useCanvasStore } from "../store/useCanvasStore";
import { getApiConfig } from "../../../api/settings";
import { ASPECT_LIST } from "../store/useCanvasStore";
import { useGenerationStore } from "../../../store/generationStore";
import { SIZE_TIERS, RESOLUTION_PRESETS, type SizeTierId } from "../../../utils/resolutionPresets";

const ASPECTS = ASPECT_LIST;

const PromptBar: React.FC = () => {
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [showNegative, setShowNegative] = useState(false);
  const [refImages, setRefImages] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [showAspectPicker, setShowAspectPicker] = useState(false);
  const [showSizePicker, setShowSizePicker] = useState(false);
  const [showBatchPicker, setShowBatchPicker] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    runGenerateFromPrompt, chatPanelOpen, setChatPanelOpen, chatHistory,
  } = useCanvasStore();

  const selectedModel = useGenerationStore((s) => s.model);
  const aspectRatio = useGenerationStore((s) => s.resolutionPreset);
  const batchSize = useGenerationStore((s) => s.batchSize);
  const sizeTier = useGenerationStore((s) => s.sizeTier);
  const setSelectedModel = (m: string) => useGenerationStore.setState({ model: m });
  const setAspectRatio = (a: string) => useGenerationStore.getState().setResolutionPreset(a as import("../../../utils/resolutionPresets").ResolutionPresetId);
  const setBatchSize = (n: number) => useGenerationStore.getState().setBatchSize(n);
  const setSizeTier = (t: SizeTierId) => useGenerationStore.getState().setSizeTier(t);

  const modelList = (() => {
    try { return getApiConfig().imageModels.map((m) => ({ id: m.modelId, label: m.label || m.modelId })).filter((m) => m.id); }
    catch { return []; }
  })();

  const handleSend = useCallback(async () => {
    if (!prompt.trim() || isRunning) return;
    setIsRunning(true);
    try {
      await runGenerateFromPrompt(
        prompt.trim(),
        refImages.length > 0 ? refImages : undefined,
        negativePrompt.trim() || undefined,
      );
      setPrompt("");
      setNegativePrompt("");
      setRefImages([]);
    } finally {
      setIsRunning(false);
    }
  }, [prompt, refImages, isRunning, runGenerateFromPrompt, negativePrompt]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
    if (e.key === "Escape") { setShowModelPicker(false); setShowAspectPicker(false); setShowSizePicker(false); setShowBatchPicker(false); }
  }, [handleSend]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    Array.from(e.target.files || []).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") setRefImages((p) => [...p, reader.result as string].slice(-4));
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  };

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + "px";
    }
  }, [prompt]);

  const currentModelLabel = modelList.find((m) => m.id === selectedModel)?.label || selectedModel || "选择模型";

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 w-full max-w-2xl px-4">
      <div className="rounded-2xl border border-white/[0.08] bg-slate-900/95 backdrop-blur-xl shadow-2xl">

        {/* 参考图预览 */}
        {refImages.length > 0 && (
          <div className="px-3 pt-3 flex gap-2 overflow-x-auto pb-1">
            {refImages.map((url, i) => (
              <div key={i} className="relative group flex-shrink-0">
                <img src={url} className="w-12 h-12 object-cover rounded-lg border border-white/10" alt="" />
                <button
                  onClick={() => setRefImages((p) => p.filter((_, j) => j !== i))}
                  className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 transition"
                >✕</button>
              </div>
            ))}
          </div>
        )}

        {/* 主输入区 */}
        <div className="flex items-end gap-2 p-2">
          {/* 对话历史按钮 */}
          <button
            onClick={() => setChatPanelOpen(!chatPanelOpen)}
            className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition relative ${
              chatPanelOpen ? "bg-indigo-500/20 text-indigo-400" : "bg-white/[0.04] text-slate-500 hover:text-slate-300"
            }`}
            title="对话历史"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            {chatHistory.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-indigo-500 text-[8px] text-white flex items-center justify-center font-bold">
                {chatHistory.length > 9 ? "9+" : chatHistory.length}
              </span>
            )}
          </button>

          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isRunning ? "生成中..." : "描述你想创作的画面，Enter 发送 · Shift+Enter 换行"}
            disabled={isRunning}
            rows={1}
            className="flex-1 bg-transparent text-sm text-slate-200 placeholder-slate-600 resize-none focus:outline-none py-2.5 px-1 max-h-[120px] disabled:opacity-50"
          />

          <div className="flex items-center gap-1.5 pb-0.5">
            <button
              onClick={() => setShowNegative(!showNegative)}
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition text-xs font-bold ${
                showNegative ? "bg-red-500/15 text-red-400 border border-red-500/20" : "bg-white/[0.04] text-slate-600 hover:text-slate-400"
              }`}
              title="负向提示词"
            >
              N-
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-10 h-10 rounded-xl bg-white/[0.04] text-slate-500 hover:text-slate-300 flex items-center justify-center transition"
              title="添加参考图（若模型不支持将自动忽略）"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </button>
            <button
              onClick={handleSend}
              disabled={!prompt.trim() || isRunning}
              className="w-10 h-10 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white flex items-center justify-center transition shadow-lg shadow-indigo-500/20 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {isRunning ? (
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* 负向提示词 */}
        {showNegative && (
          <div className="px-3 pb-2 border-t border-white/[0.04] pt-2">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-[9px] text-slate-600 font-medium">负向提示词</span>
              <span className="text-[9px] text-slate-700">（不想要的内容）</span>
            </div>
            <textarea
              value={negativePrompt}
              onChange={(e) => setNegativePrompt(e.target.value)}
              placeholder="模糊, 低质量, 变形..."
              rows={2}
              className="w-full bg-slate-800/40 text-xs text-slate-500 placeholder-slate-700 resize-none focus:outline-none rounded-lg px-2 py-1.5 border border-white/[0.04] focus:border-red-500/20 leading-relaxed"
            />
          </div>
        )}

        {/* 底部参数栏 */}
        <div className="px-3 pb-2.5 flex items-center gap-3 border-t border-white/[0.04] pt-2">
          {/* 模型选择 */}
          <div className="relative flex-1 min-w-0">
            <button
              onClick={() => setShowModelPicker(!showModelPicker)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.06] transition text-xs text-slate-400 max-w-full"
            >
              <svg className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <span className="truncate max-w-[140px]">{currentModelLabel}</span>
              <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showModelPicker && (
              <div className="absolute bottom-full mb-2 left-0 z-30 rounded-xl border border-white/[0.08] bg-slate-900/98 backdrop-blur-xl shadow-2xl min-w-[220px] max-h-60 overflow-y-auto">
                <div className="px-3 py-2 border-b border-white/[0.06]">
                  <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">选择模型</span>
                </div>
                {modelList.length === 0 ? (
                  <div className="px-3 py-4 text-center">
                    <p className="text-xs text-slate-500">暂无模型</p>
                    <p className="text-[10px] text-slate-600 mt-1">请在「设置 → Image」中添加模型</p>
                  </div>
                ) : (
                  modelList.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => { setSelectedModel(m.id); setShowModelPicker(false); }}
                      className={`w-full px-3 py-2.5 text-left text-xs transition flex items-center gap-2 ${
                        selectedModel === m.id
                          ? "bg-indigo-500/15 text-indigo-400"
                          : "text-slate-300 hover:bg-white/[0.04]"
                      }`}
                    >
                      {selectedModel === m.id && (
                        <svg className="w-3 h-3 text-indigo-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                      <span className="truncate">{m.label}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* 比例选择 */}
          <div className="relative flex-shrink-0">
            <button
              onClick={() => { setShowAspectPicker(!showAspectPicker); setShowSizePicker(false); setShowBatchPicker(false); }}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.06] transition text-xs text-slate-400"
            >
              <span>{RESOLUTION_PRESETS.find((p) => p.id === aspectRatio)?.label ?? aspectRatio}</span>
              <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showAspectPicker && (
              <div className="absolute bottom-full mb-2 left-0 z-30 rounded-xl border border-white/[0.08] bg-slate-900/98 backdrop-blur-xl shadow-2xl min-w-[100px] max-h-60 overflow-y-auto">
                <div className="px-3 py-2 border-b border-white/[0.06]">
                  <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">比例</span>
                </div>
                {ASPECTS.map((a) => (
                  <button
                    key={a}
                    onClick={() => { setAspectRatio(a); setShowAspectPicker(false); }}
                    className={`w-full px-3 py-2 text-left text-xs transition flex items-center gap-2 ${
                      aspectRatio === a ? "bg-indigo-500/15 text-indigo-400" : "text-slate-300 hover:bg-white/[0.04]"
                    }`}
                  >
                    {aspectRatio === a && (
                      <svg className="w-3 h-3 text-indigo-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                    <span>{RESOLUTION_PRESETS.find((p) => p.id === a)?.label ?? a}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 分辨率档位 */}
          <div className="relative flex-shrink-0">
            <button
              onClick={() => { setShowSizePicker(!showSizePicker); setShowAspectPicker(false); setShowBatchPicker(false); }}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.06] transition text-xs text-slate-400"
            >
              <span>{sizeTier}</span>
              <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showSizePicker && (
              <div className="absolute bottom-full mb-2 left-0 z-30 rounded-xl border border-white/[0.08] bg-slate-900/98 backdrop-blur-xl shadow-2xl min-w-[90px]">
                <div className="px-3 py-2 border-b border-white/[0.06]">
                  <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">分辨率</span>
                </div>
                {SIZE_TIERS.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => { setSizeTier(t.id); setShowSizePicker(false); }}
                    className={`w-full px-3 py-2 text-left text-xs transition flex items-center gap-2 ${
                      sizeTier === t.id ? "bg-indigo-500/15 text-indigo-400" : "text-slate-300 hover:bg-white/[0.04]"
                    }`}
                  >
                    {sizeTier === t.id && (
                      <svg className="w-3 h-3 text-indigo-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                    <span>{t.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 批量数量 */}
          <div className="relative flex-shrink-0">
            <button
              onClick={() => { setShowBatchPicker(!showBatchPicker); setShowAspectPicker(false); setShowSizePicker(false); }}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.06] transition text-xs text-slate-400"
            >
              <span>×{batchSize}</span>
              <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showBatchPicker && (
              <div className="absolute bottom-full mb-2 left-0 z-30 rounded-xl border border-white/[0.08] bg-slate-900/98 backdrop-blur-xl shadow-2xl min-w-[80px]">
                <div className="px-3 py-2 border-b border-white/[0.06]">
                  <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">批量</span>
                </div>
                {[1, 2, 4].map((n) => (
                  <button
                    key={n}
                    onClick={() => { setBatchSize(n); setShowBatchPicker(false); }}
                    className={`w-full px-3 py-2 text-left text-xs transition flex items-center gap-2 ${
                      batchSize === n ? "bg-indigo-500/15 text-indigo-400" : "text-slate-300 hover:bg-white/[0.04]"
                    }`}
                  >
                    {batchSize === n && (
                      <svg className="w-3 h-3 text-indigo-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                    <span>×{n}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <span className="text-[9px] text-slate-700 font-mono flex-shrink-0">{prompt.length}/1000</span>
        </div>
      </div>

      <input ref={fileInputRef} type="file" multiple accept="image/*" className="hidden" onChange={handleFileChange} />
    </div>
  );
};

export default PromptBar;
