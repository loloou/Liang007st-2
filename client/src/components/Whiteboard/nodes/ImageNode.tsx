import React, { memo, useRef, useState } from "react";
import { Handle, Position, type NodeProps, NodeResizer } from "@xyflow/react";
import { useCanvasStore, type CanvasNodeData } from "../store/useCanvasStore";
import { safeUrl } from "../../../utils/safeUrl";

const ImageNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const d = data as CanvasNodeData;
  const setLightbox = useCanvasStore((s) => s.setLightboxUrl);
  const selectNode = useCanvasStore((s) => s.selectNode);
  const updateNode = useCanvasStore((s) => s.updateNode);
  const removeNode = useCanvasStore((s) => s.removeNode);
  const duplicateNode = useCanvasStore((s) => s.duplicateNode);
  const addNode = useCanvasStore((s) => s.addNode);
  const nodes = useCanvasStore((s) => s.nodes);
  const [editingUrl, setEditingUrl] = useState(false);
  const [urlInput, setUrlInput] = useState(d.imageUrl || "");
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelInput, setLabelInput] = useState(d.label || "图片");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        updateNode(id, { imageUrl: reader.result, label: file.name.replace(/\.[^.]+$/, ""), lastError: undefined });
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleDoubleClickUpload = (e: React.MouseEvent) => {
    e.stopPropagation();
    fileInputRef.current?.click();
  };

  const handleSaveUrl = () => {
    if (urlInput.trim()) updateNode(id, { imageUrl: urlInput.trim(), lastError: undefined });
    setEditingUrl(false);
  };

  const handlePasteFromClipboard = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find((t) => t.startsWith("image/"));
        if (imageType) {
          const blob = await item.getType(imageType);
          const reader = new FileReader();
          reader.onload = () => {
            if (typeof reader.result === "string") {
              updateNode(id, { imageUrl: reader.result, lastError: undefined });
            }
          };
          reader.readAsDataURL(blob);
          return;
        }
      }
      // 尝试读取文本（URL）
      const text = await navigator.clipboard.readText();
      if (text.trim().startsWith("http")) {
        updateNode(id, { imageUrl: text.trim(), lastError: undefined });
      }
    } catch {
      setEditingUrl(true);
      setUrlInput("");
    }
  };

  const handleSaveLabel = () => {
    if (labelInput.trim()) updateNode(id, { label: labelInput.trim() });
    setEditingLabel(false);
  };

  const handleGenerateVariant = (e: React.MouseEvent) => {
    e.stopPropagation();
    const thisNode = nodes.find((n) => n.id === id);
    if (!thisNode) return;
    const newId = addNode("generate", {
      x: thisNode.position.x + (Number(d.width) || 240) + 60,
      y: thisNode.position.y,
    }, { prompt: d.label || "" });
    setTimeout(() => {
      useCanvasStore.getState().onConnect({
        source: id, target: newId,
        sourceHandle: null, targetHandle: null,
      });
    }, 50);
  };

  return (
    <div
      onClick={() => selectNode(id)}
      className={`rounded-xl overflow-hidden border transition-all bg-slate-900 h-full ${
        selected ? "border-indigo-400 ring-2 ring-indigo-400/20" : "border-white/10 hover:border-white/20"
      }`}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={160}
        minHeight={160}
        handleStyle={{ width: 8, height: 8, borderRadius: 4, background: "#6366f1", border: "2px solid #0a0a0f" }}
        lineStyle={{ borderColor: "#6366f1", borderWidth: 1 }}
      />

      <Handle type="target" position={Position.Left} className="!w-3 !h-3 !bg-indigo-500 !border-2 !border-slate-900" />

      <div className="px-2.5 py-1.5 flex items-center gap-1.5 border-b border-white/[0.06] bg-slate-800/60">
        <svg className="w-3 h-3 text-indigo-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        {editingLabel ? (
          <input
            autoFocus
            value={labelInput}
            onChange={(e) => setLabelInput(e.target.value)}
            onBlur={handleSaveLabel}
            onKeyDown={(e) => { if (e.key === "Enter") handleSaveLabel(); if (e.key === "Escape") setEditingLabel(false); }}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 bg-transparent text-[10px] font-semibold text-indigo-400 uppercase tracking-wider focus:outline-none border-b border-indigo-400/40"
          />
        ) : (
          <span
            className="text-[10px] font-semibold text-indigo-400 uppercase tracking-wider truncate flex-1 cursor-text"
            onDoubleClick={(e) => { e.stopPropagation(); setEditingLabel(true); setLabelInput(d.label || "图片"); }}
            title="双击重命名"
          >
            {d.label}
          </span>
        )}
        {selected && (
          <div className="flex items-center gap-0.5">
            {d.imageUrl && (
              <>
                <button
                  onClick={handleGenerateVariant}
                  className="w-5 h-5 rounded text-slate-500 hover:text-purple-400 hover:bg-purple-500/10 flex items-center justify-center transition"
                  title="用此图生成变体"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                </button>
                <a
                  href={d.imageUrl}
                  download={`${d.label || "image"}_${Date.now()}.png`}
                  onClick={(e) => e.stopPropagation()}
                  className="w-5 h-5 rounded text-slate-500 hover:text-emerald-400 hover:bg-emerald-500/10 flex items-center justify-center transition"
                  title="下载图片"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                </a>
              </>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); duplicateNode(id); }}
              className="w-5 h-5 rounded text-slate-500 hover:text-slate-300 hover:bg-white/10 flex items-center justify-center transition"
              title="复制"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); removeNode(id); }}
              className="w-5 h-5 rounded text-slate-500 hover:text-red-400 hover:bg-red-500/10 flex items-center justify-center transition"
              title="删除"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        )}
      </div>

      {d.imageUrl ? (
        <div className="relative group cursor-pointer" style={{ height: "calc(100% - 32px)" }} onClick={(e) => { e.stopPropagation(); setLightbox(d.imageUrl!); }} onDoubleClick={handleDoubleClickUpload}>
           <img src={safeUrl(d.imageUrl)} alt="" className="w-full h-full object-cover bg-slate-950" draggable={false} onError={() => updateNode(id, { lastError: "图片加载失败" })} />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition flex items-center justify-center">
            <svg className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" /></svg>
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
        </div>
      ) : (
        <div
          className="flex items-center justify-center bg-slate-950/50 border-2 border-dashed border-white/[0.06] p-3 cursor-pointer"
          style={{ height: "calc(100% - 32px)" }}
          onDoubleClick={handleDoubleClickUpload}
        >
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
          {editingUrl ? (
            <div className="w-full space-y-2" onClick={(e) => e.stopPropagation()}>
              <input type="text" placeholder="粘贴图片 URL..." value={urlInput} onChange={(e) => setUrlInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleSaveUrl(); if (e.key === "Escape") setEditingUrl(false); }} autoFocus className="w-full px-2 py-1.5 text-[10px] bg-slate-800 border border-white/[0.08] rounded-lg text-slate-300 placeholder-slate-600 focus:outline-none focus:border-indigo-500/30" />
              <div className="flex gap-1">
                <button onClick={handleSaveUrl} className="flex-1 px-2 py-1 rounded text-[9px] bg-indigo-500 hover:bg-indigo-600 text-white transition">确认</button>
                <button onClick={() => setEditingUrl(false)} className="px-2 py-1 rounded text-[9px] bg-white/[0.04] text-slate-400 transition">取消</button>
              </div>
            </div>
          ) : (
            <div className="text-center">
              <svg className="w-8 h-8 text-slate-600 mx-auto mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-[9px] text-slate-600 mb-2">双击上传图片</p>
              <div className="flex gap-1 justify-center">
                <button
                  onClick={(e) => { e.stopPropagation(); setEditingUrl(true); setUrlInput(""); }}
                  className="px-2 py-0.5 rounded text-[9px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 hover:bg-indigo-500/20 transition"
                >
                  URL
                </button>
                <button
                  onClick={handlePasteFromClipboard}
                  className="px-2 py-0.5 rounded text-[9px] bg-slate-700/50 text-slate-400 border border-white/[0.06] hover:bg-slate-700 transition"
                >
                  粘贴
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {d.lastError && (
        <div className="px-2 py-1 bg-red-500/10 border-t border-red-500/20 absolute bottom-0 left-0 right-0">
          <p className="text-[9px] text-red-400 truncate">{d.lastError}</p>
        </div>
      )}

      <Handle type="source" position={Position.Right} className="!w-3 !h-3 !bg-indigo-500 !border-2 !border-slate-900" />
    </div>
  );
};

export default memo(ImageNode);
