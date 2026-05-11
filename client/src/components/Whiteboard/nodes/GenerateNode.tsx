import React, { memo, useState } from "react";
import { Handle, Position, type NodeProps, NodeResizer } from "@xyflow/react";
import { useCanvasStore, type CanvasNodeData } from "../store/useCanvasStore";
import { useGenerationStore } from "../../../store/generationStore";

const STATUS_COLORS: Record<string, string> = {
  idle: "text-slate-500", queued: "text-blue-400",
  running: "text-amber-400", success: "text-emerald-400", error: "text-red-400",
};
const STATUS_LABELS: Record<string, string> = {
  idle: "待执行", queued: "排队中", running: "生成中", success: "完成", error: "失败",
};

const GenerateNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const d = data as CanvasNodeData;
  const updateNode = useCanvasStore((s) => s.updateNode);
  const runGenerate = useCanvasStore((s) => s.runGenerate);
  const setLightbox = useCanvasStore((s) => s.setLightboxUrl);
  const selectNode = useCanvasStore((s) => s.selectNode);
  const removeNode = useCanvasStore((s) => s.removeNode);
  const duplicateNode = useCanvasStore((s) => s.duplicateNode);
  const selectedModel = useGenerationStore((s) => s.model);
  const aspectRatio = useGenerationStore((s) => s.resolutionPreset);
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelInput, setLabelInput] = useState(d.label || "AI 生成");

  const status = d.status || "idle";
  const progress = d.progress || 0;
  const images = d.imageResults || [];

  const handleSaveLabel = () => {
    if (labelInput.trim()) updateNode(id, { label: labelInput.trim() });
    setEditingLabel(false);
  };

  return (
    <div
      onClick={() => selectNode(id)}
      className={`rounded-xl border transition-all bg-slate-900 flex flex-col ${
        selected ? "border-purple-400 ring-2 ring-purple-400/20" : "border-white/10 hover:border-white/20"
      }`}
      style={{ minWidth: 260, minHeight: 180 }}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={240}
        minHeight={160}
        handleStyle={{ width: 8, height: 8, borderRadius: 4, background: "#a855f7", border: "2px solid #0a0a0f" }}
        lineStyle={{ borderColor: "#a855f7", borderWidth: 1 }}
      />

      <Handle type="target" position={Position.Left} className="!w-3 !h-3 !bg-purple-500 !border-2 !border-slate-900" />

      {/* 头部 */}
      <div className="px-2.5 py-1.5 flex items-center gap-1.5 border-b border-white/[0.06] bg-slate-800/60 flex-shrink-0">
        <svg className="w-3 h-3 text-purple-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        {editingLabel ? (
          <input
            autoFocus
            value={labelInput}
            onChange={(e) => setLabelInput(e.target.value)}
            onBlur={handleSaveLabel}
            onKeyDown={(e) => { if (e.key === "Enter") handleSaveLabel(); if (e.key === "Escape") setEditingLabel(false); }}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 bg-transparent text-[10px] font-semibold text-purple-400 uppercase tracking-wider focus:outline-none border-b border-purple-400/40"
          />
        ) : (
          <span
            className="text-[10px] font-semibold text-purple-400 uppercase tracking-wider flex-1 cursor-text"
            onDoubleClick={(e) => { e.stopPropagation(); setEditingLabel(true); setLabelInput(d.label || "AI 生成"); }}
            title="双击重命名"
          >
            {d.label}
          </span>
        )}
        <span className={`text-[9px] font-medium ${STATUS_COLORS[status]}`}>{STATUS_LABELS[status]}</span>
        {selected && (
          <div className="flex items-center gap-0.5 ml-1">
            {d.prompt && (
              <button
                onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(String(d.prompt)).catch(() => {}); }}
                className="w-5 h-5 rounded text-slate-500 hover:text-slate-300 hover:bg-white/10 flex items-center justify-center transition"
                title="复制提示词"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
              </button>
            )}
            <button onClick={(e) => { e.stopPropagation(); duplicateNode(id); }} className="w-5 h-5 rounded text-slate-500 hover:text-slate-300 hover:bg-white/10 flex items-center justify-center transition" title="复制">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
            </button>
            <button onClick={(e) => { e.stopPropagation(); removeNode(id); }} className="w-5 h-5 rounded text-slate-500 hover:text-red-400 hover:bg-red-500/10 flex items-center justify-center transition" title="删除">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        )}
      </div>

      {/* 内容区 */}
      <div className="p-2.5 space-y-2 flex-1 flex flex-col">
        {/* 模型 + 比例显示 */}
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/[0.03] border border-white/[0.04]">
          <svg className="w-3 h-3 text-slate-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <span className="text-[9px] text-slate-500 truncate flex-1">{selectedModel || "未选择模型"}</span>
          <span className="text-[9px] text-slate-600 bg-white/[0.04] px-1 rounded flex-shrink-0">{aspectRatio}</span>
        </div>

        {/* 提示词输入 */}
        <textarea
          className="w-full bg-slate-800/60 text-xs text-slate-300 placeholder-slate-600 resize-none focus:outline-none rounded-lg px-2 py-1.5 border border-white/[0.06] focus:border-purple-500/30 leading-relaxed flex-1"
          style={{ minHeight: 60 }}
          placeholder="输入生成提示词..."
          value={d.prompt || ""}
          onChange={(e) => updateNode(id, { prompt: e.target.value })}
          onClick={(e) => e.stopPropagation()}
        />

        {/* 负向提示词 */}
        <div>
          <label className="text-[9px] text-slate-600 block mb-0.5">负向提示词（可选）</label>
          <textarea
            className="w-full bg-slate-800/40 text-xs text-slate-500 placeholder-slate-700 resize-none focus:outline-none rounded-lg px-2 py-1.5 border border-white/[0.04] focus:border-red-500/20 leading-relaxed"
            rows={2}
            placeholder="不想要的内容..."
            value={String(d.negativePrompt || "")}
            onChange={(e) => updateNode(id, { negativePrompt: e.target.value })}
            onClick={(e) => e.stopPropagation()}
          />
        </div>

        {/* 进度条 */}
        {status === "running" && (
          <div className="space-y-1">
            <div className="w-full h-1 bg-white/[0.06] rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-[9px] text-slate-500 text-right font-mono">{progress}%</p>
          </div>
        )}

        {/* 错误/警告 */}
        {d.lastError && (
          <p className="text-[9px] text-amber-400 bg-amber-500/10 rounded px-2 py-1 line-clamp-2">⚠️ {d.lastError}</p>
        )}

        {/* 生成结果 */}
        {images.length > 0 && (
          <div className="flex gap-1.5 flex-wrap">
            {images.slice(0, 6).map((img, i) => (
              <div key={i} className="relative group">
                <img
                  src={img.url}
                  alt=""
                  className="w-14 h-14 object-cover rounded-lg bg-slate-800 cursor-pointer hover:ring-2 hover:ring-purple-400/50 transition"
                  draggable={false}
                  onClick={(e) => { e.stopPropagation(); setLightbox(img.url); }}
                />
                <a
                  href={img.url}
                  download={`gen_${Date.now()}.png`}
                  onClick={(e) => e.stopPropagation()}
                  className="absolute bottom-0.5 right-0.5 w-4 h-4 rounded bg-black/70 text-white opacity-0 group-hover:opacity-100 transition flex items-center justify-center"
                  title="下载"
                >
                  <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </a>
              </div>
            ))}
          </div>
        )}

        {/* 执行按钮 */}
        <button
          onClick={(e) => { e.stopPropagation(); runGenerate(id); }}
          disabled={status === "running" || !d.prompt?.trim()}
          className="w-full py-1.5 rounded-lg bg-purple-500 hover:bg-purple-600 text-white text-[10px] font-bold uppercase tracking-wider transition disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 flex-shrink-0"
        >
          {status === "running" ? (
            <>
              <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
              生成中
            </>
          ) : (
            <>
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              执行生成
            </>
          )}
        </button>
      </div>

      <Handle type="source" position={Position.Right} className="!w-3 !h-3 !bg-purple-500 !border-2 !border-slate-900" />
    </div>
  );
};

export default memo(GenerateNode);
