/**
 * ControlPanel — 右侧控制栏（提示词 + 参考图 + 生图参数 + 生图按钮）
 *
 * 从 App.tsx 提取的独立组件。
 * 所有状态通过 props 传入，保持与主界面同步。
 */
import React, { useState, useRef } from "react";
import { getApiConfig } from "../api/settings";
import { SIZE_TIERS, getResolution, type SizeTierId, type ResolutionPresetId } from "../utils/resolutionPresets";
import { safeUrl } from "../utils/safeUrl";
import AspectRatioSelect from "./AspectRatioSelect";

interface Props {
  prompt: string;
  setPrompt: (v: string) => void;
  negativePrompt: string;
  setNegativePrompt: (v: string) => void;
  promptHistory: string[];
  referenceSlots: (File | null)[];
  setReferenceSlots: React.Dispatch<React.SetStateAction<(File | null)[]>>;
  referencePreviewUrls: (string | null)[];
  setReferencePreviewUrls: React.Dispatch<React.SetStateAction<(string | null)[]>>;
  setReferenceSize: (s: { width: number; height: number } | null) => void;
  model: string;
  setModel: (v: string) => void;
  modelList: string[];
  resolutionPreset: ResolutionPresetId;
  setResolutionPreset: (v: ResolutionPresetId) => void;
  sizeTier: SizeTierId;
  setSizeTier: (v: SizeTierId) => void;
  batchSize: number;
  setBatchSize: (v: number) => void;
  width: number;
  height: number;
  status: "idle" | "running";
  handleGenerate: () => void;
  onOpenModelPicker: () => void;
  onOptimize: () => void;
}

const ControlPanel: React.FC<Props> = ({
  prompt, setPrompt,
  negativePrompt, setNegativePrompt,
  promptHistory,
  referenceSlots, setReferenceSlots,
  referencePreviewUrls, setReferencePreviewUrls,
  setReferenceSize,
  model, setModel,
  modelList,
  resolutionPreset, setResolutionPreset,
  sizeTier, setSizeTier,
  batchSize, setBatchSize,
  width, height,
  status,
  handleGenerate,
  onOpenModelPicker,
  onOptimize,
}) => {
  const [refImgOpen, setRefImgOpen] = useState(true);
  const [showPromptHistory, setShowPromptHistory] = useState(true);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  const handleReferenceSlotDrop = (index: number, e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) {
      setReferenceSlots((prev) => {
        const next = [...prev];
        next[index] = file;
        return next;
      });
    }
  };

  const setReferenceSlot = (index: number, file: File | null) => {
    setReferenceSlots((prev) => {
      const next = [...prev];
      next[index] = file;
      return next;
    });
  };

  const referenceImages = referenceSlots.filter((f): f is File => f != null);

  return (
    <aside className="flex-shrink-0 flex flex-col gap-2 overflow-hidden" style={{ width: 340, height: "100%", maxHeight: "100%" }}>
      {/* ── 提示词模块 ── */}
      <div className="glass-card rounded-xl px-3 pt-2.5 pb-2 flex flex-col gap-1.5 flex-shrink-0">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-300">提示词</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="text-[10px] text-slate-500 hover:text-slate-300 px-1.5 py-0.5 rounded hover:bg-white/[0.06] transition"
                  onClick={() => setShowPromptHistory(!showPromptHistory)}
                  title="提示词历史"
                >历史</button>
                <button
                  type="button"
                  className="text-[10px] text-amber-400 hover:text-amber-300 px-1.5 py-0.5 rounded hover:bg-amber-500/10 transition"
                  onClick={onOptimize}
                  title="提示词优化"
                  disabled={!prompt.trim()}
                >优化</button>
              </div>
        </div>

        {showPromptHistory && promptHistory.length > 0 && (
          <div className="max-h-32 overflow-y-auto app-scrollbar border border-white/[0.06] rounded-lg divide-y divide-white/[0.04]">
            {promptHistory.slice(0, 20).map((p, i) => (
              <button
                key={i}
                className="w-full text-left px-2.5 py-1.5 text-[11px] text-slate-400 hover:bg-white/[0.06] hover:text-slate-200 transition truncate"
                onClick={() => { setPrompt(p); setShowPromptHistory(false); }}
              >{p}</button>
            ))}
          </div>
        )}

        <textarea
          ref={promptRef}
          className="w-full text-xs glass-input px-2.5 py-2 resize-none app-scrollbar rounded-none border-0"
          style={{ height: 100 }}
          placeholder="输入提示词，描述你想生成的图像…"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleGenerate();
            }
          }}
        />

        {/* 反向提示词 */}
        <div className="border border-white/[0.06] rounded-lg overflow-hidden">
          <textarea
            className="w-full text-xs glass-input px-2.5 py-2 resize-none app-scrollbar rounded-none border-0"
            style={{ height: 68 }}
            placeholder="反向提示词（可选）"
            value={negativePrompt}
            onChange={(e) => setNegativePrompt(e.target.value)}
          />
        </div>
      </div>

      {/* ── 参考图 - 可折叠 ── */}
      <div className="glass-card rounded-xl overflow-hidden flex-shrink-0">
        <button
          type="button"
          className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/[0.04] transition-colors"
          onClick={() => setRefImgOpen((v) => !v)}
        >
          <span className="flex items-center gap-1.5">
            <svg className="w-3 h-3 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            参考图
            {referenceImages.length > 0 && <span className="px-1.5 py-0.5 rounded-full bg-primary-500/15 text-primary-400 text-[10px] font-medium">{referenceImages.length}</span>}
          </span>
          <svg className={`w-3 h-3 text-slate-500 transition-transform duration-200 ${refImgOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
        </button>
        <div className={`transition-all duration-200 overflow-hidden ${refImgOpen ? "max-h-52" : "max-h-0"}`}>
          <div className="px-3 pb-3 grid grid-cols-4 gap-2">
            {[0, 1, 2, 3].map((index) => (
              <label
                key={index}
                className="aspect-square max-h-24 border border-dashed border-white/[0.1] rounded-lg cursor-pointer bg-white/[0.03] hover:bg-white/[0.06] transition flex flex-col items-center justify-center overflow-hidden relative"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => handleReferenceSlotDrop(index, e)}
              >
                <input
                  type="file"
                  className="hidden"
                  accept="image/*"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    setReferenceSlot(index, f ?? null);
                    e.target.value = "";
                  }}
                />
                {referencePreviewUrls[index] ? (
                  <>
                    <img src={safeUrl(referencePreviewUrls[index])} alt="" className="absolute inset-0 w-full h-full object-cover" />
                    <button
                      type="button"
                      className="absolute top-0 right-0 w-5 h-5 flex items-center justify-center rounded-bl bg-black/60 text-white text-xs hover:bg-red-500/100 transition-colors"
                      title="删除图片"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setReferenceSlot(index, null); }}
                    >×</button>
                    <span className="absolute bottom-0 left-0 right-0 py-0.5 bg-black/50 text-white text-[9px] text-center">点击可替换</span>
                  </>
                ) : (
                  <span className="text-[9px] text-slate-400 text-center px-0.5">点击/拖拽</span>
                )}
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* ── 生图参数 ── */}
      <div className="glass-card rounded-xl px-3 py-2.5 flex flex-col gap-2 flex-shrink-0">
        <div className="text-xs font-semibold text-slate-300">生图参数</div>
        <div className="flex items-center gap-2">
          <div className="flex flex-col gap-0.5 flex-1">
            <span className="text-slate-500 text-[10px]">宽高比</span>
            <AspectRatioSelect value={resolutionPreset} onChange={setResolutionPreset} />
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-slate-500 text-[10px]">分辨率</span>
            <div className="flex gap-1">
              {SIZE_TIERS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`px-3 py-1.5 rounded-lg border text-[11px] font-medium transition ${
                    sizeTier === t.id
                      ? "border-primary-500/30 bg-primary-500/10 text-primary-400"
                      : "border-white/[0.08] text-slate-400 hover:bg-white/[0.06]"
                  }`}
                  onClick={() => setSizeTier(t.id as SizeTierId)}
                >{t.label}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex flex-col gap-0.5 flex-1">
            <span className="text-slate-500 text-[10px]">模型</span>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="border border-white/[0.08] rounded-lg px-1.5 py-1.5 text-[11px] bg-white/[0.04] focus:outline-none focus:ring-1 focus:ring-primary-500/30 text-slate-300 w-full truncate"
              title={model}
            >
              {[...new Set(model ? [model, ...modelList] : modelList)].map((id) => (
                <option key={id} value={id}>{id}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-slate-500 text-[10px]">数量</span>
            <select
              value={batchSize}
              onChange={(e) => setBatchSize(Number(e.target.value))}
              className="border border-white/[0.08] rounded-lg px-1.5 py-1.5 text-[11px] bg-white/[0.04] focus:outline-none focus:ring-1 focus:ring-primary-500/30 text-slate-300 w-16"
            >
              {[1, 2, 4].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between text-[10px]">
          <span className="text-slate-500 tabular-nums">{width} × {height} px</span>
          <button
            type="button"
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 transition font-medium border ${
              modelList.length > 0
                ? "text-primary-400 bg-primary-500/10 hover:bg-primary-500/20 border-primary-500/20"
                : "text-slate-500 bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.08]"
            }`}
            onClick={onOpenModelPicker}
          >
            <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
            {modelList.length > 0
              ? <>已选 <span className="font-bold tabular-nums">{modelList.length}</span> 个模型 · 点击管理</>
              : "点击选择模型"
            }
          </button>
        </div>
      </div>

      {/* ── 生图按钮 ── */}
      <div className="glass-card rounded-xl px-3 py-2 flex flex-col gap-1.5 flex-shrink-0">
        <button
          onClick={handleGenerate}
          disabled={status === "running"}
          aria-label={status === "running" ? "正在生成中" : "开始生图"}
          className={`w-full h-10 rounded-xl text-white text-sm font-semibold transition-all relative overflow-hidden ${
            status === "running"
              ? "bg-primary-500/40 cursor-not-allowed opacity-70 generating-pulse"
              : "gradient-button"
          }`}
        >
          {status === "running" ? (
            <div className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span>生图中...</span>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span>开始生图</span>
            </div>
          )}
        </button>
      </div>
    </aside>
  );
};

export default ControlPanel;
