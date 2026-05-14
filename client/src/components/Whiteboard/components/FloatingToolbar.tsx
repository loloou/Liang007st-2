import React, { useRef, useState, useCallback } from "react";
import { useCanvasStore, type NodeKind } from "../store/useCanvasStore";
import { useReactFlow } from "@xyflow/react";

interface FloatingToolbarProps {
  onClose: () => void;
}

const NODE_TYPES: Array<{ kind: NodeKind; icon: React.ReactNode; label: string; color: string }> = [
  {
    kind: "image",
    label: "图片节点",
    color: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20 hover:bg-indigo-500/20",
    icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>,
  },
  {
    kind: "text",
    label: "提示词节点",
    color: "text-amber-400 bg-amber-500/10 border-amber-500/20 hover:bg-amber-500/20",
    icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>,
  },
  {
    kind: "generate",
    label: "AI 生成节点",
    color: "text-purple-400 bg-purple-500/10 border-purple-500/20 hover:bg-purple-500/20",
    icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>,
  },
];

const TEMPLATES = [
  {
    id: "text2img",
    name: "文生图",
    desc: "提示词 → AI 生成",
    icon: "✨",
    create: (addNode: ReturnType<typeof useCanvasStore.getState>["addNode"], onConnect: ReturnType<typeof useCanvasStore.getState>["onConnect"], center?: { x: number; y: number }) => {
      const cx = center?.x ?? 200;
      const cy = center?.y ?? 200;
      const textId = addNode("text", { x: cx - 160, y: cy }, { label: "提示词", prompt: "一只可爱的猫咪，写实风格" });
      const genId = addNode("generate", { x: cx + 160, y: cy }, { label: "AI 生成" });
      setTimeout(() => onConnect({ source: textId, target: genId, sourceHandle: null, targetHandle: null }), 50);
    },
  },
  {
    id: "img2img",
    name: "图生图",
    desc: "图片 + 提示词 → AI 生成",
    icon: "🖼️",
    create: (addNode: ReturnType<typeof useCanvasStore.getState>["addNode"], onConnect: ReturnType<typeof useCanvasStore.getState>["onConnect"], center?: { x: number; y: number }) => {
      const cx = center?.x ?? 200;
      const cy = center?.y ?? 200;
      const imgId = addNode("image", { x: cx - 160, y: cy - 90 }, { label: "参考图", width: 200, height: 200 });
      const textId = addNode("text", { x: cx - 160, y: cy + 130 }, { label: "提示词", prompt: "保持风格，改变背景为星空" });
      const genId = addNode("generate", { x: cx + 160, y: cy }, { label: "AI 生成" });
      setTimeout(() => {
        onConnect({ source: imgId, target: genId, sourceHandle: null, targetHandle: null });
        onConnect({ source: textId, target: genId, sourceHandle: null, targetHandle: null });
      }, 50);
    },
  },
  {
    id: "chain",
    name: "串联生成",
    desc: "生成 → 变体 → 放大",
    icon: "⛓️",
    create: (addNode: ReturnType<typeof useCanvasStore.getState>["addNode"], onConnect: ReturnType<typeof useCanvasStore.getState>["onConnect"], center?: { x: number; y: number }) => {
      const cx = center?.x ?? 200;
      const cy = center?.y ?? 200;
      const textId = addNode("text", { x: cx - 300, y: cy }, { label: "提示词", prompt: "赛博朋克城市夜景" });
      const gen1Id = addNode("generate", { x: cx - 60, y: cy }, { label: "初稿生成" });
      const imgId = addNode("image", { x: cx + 180, y: cy }, { label: "结果图", width: 200, height: 200 });
      const gen2Id = addNode("generate", { x: cx + 440, y: cy }, { label: "变体生成" });
      setTimeout(() => {
        onConnect({ source: textId, target: gen1Id, sourceHandle: null, targetHandle: null });
        onConnect({ source: gen1Id, target: imgId, sourceHandle: null, targetHandle: null });
        onConnect({ source: imgId, target: gen2Id, sourceHandle: null, targetHandle: null });
      }, 50);
    },
  },
];

const FloatingToolbar: React.FC<FloatingToolbarProps> = ({ onClose }) => {
  const { addNode, clearCanvas, nodes, exportJSON, importJSON, onConnect } = useCanvasStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showTemplates, setShowTemplates] = React.useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const rf = useReactFlow();

  const focusNode = useCallback((nodeId: string) => {
    const node = useCanvasStore.getState().nodes.find((n) => n.id === nodeId);
    if (!node) return;
    useCanvasStore.getState().selectNode(nodeId);
    const x = node.position.x + (Number((node.data as Record<string, unknown>).width) || 240) / 2;
    const y = node.position.y + (Number((node.data as Record<string, unknown>).height) || 240) / 2;
    rf.setCenter(x, y, { zoom: 1, duration: 400 });
  }, [rf]);

  const filteredNodes = searchQuery.trim()
    ? nodes.filter((n) => {
        const d = n.data as Record<string, unknown>;
        const label = String(d.label || "").toLowerCase();
        const prompt = String(d.prompt || "").toLowerCase();
        const q = searchQuery.toLowerCase();
        return label.includes(q) || prompt.includes(q);
      })
    : [];

  const handleImport = () => fileInputRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { if (typeof reader.result === "string") importJSON(reader.result); };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleExport = () => {
    const json = exportJSON();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `canvas_${Date.now()}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleLoadTemplate = (tpl: typeof TEMPLATES[0]) => {
    if (nodes.length > 0 && !confirm("加载模板会清空当前画布，确定继续？")) return;
    clearCanvas();
    const c = rf.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    setTimeout(() => tpl.create(addNode, onConnect, c), 100);
    setShowTemplates(false);
  };

  return (
    <div className="absolute top-4 left-4 z-20 flex flex-col gap-2">
      <div className="rounded-2xl border border-white/[0.08] bg-slate-900/95 backdrop-blur-xl shadow-2xl overflow-hidden">
        <div className="px-3 py-2 border-b border-white/[0.06] flex items-center justify-between">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">节点</span>
          <button onClick={onClose} className="text-slate-600 hover:text-slate-300 text-xs transition">✕</button>
        </div>

        {/* 搜索框 */}
        <div className="px-2 pt-1.5 pb-1">
          <div className="relative">
            <svg className="w-3 h-3 text-slate-600 absolute left-2 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            <input
              type="text"
              placeholder="搜索节点..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-7 pr-2 py-1.5 text-[10px] bg-white/[0.04] border border-white/[0.06] rounded-lg text-slate-300 placeholder-slate-600 focus:outline-none focus:border-indigo-500/30"
            />
          </div>
        </div>

        {/* 搜索结果 */}
        {searchQuery.trim() && (
          <div className="px-1.5 pb-1 max-h-32 overflow-y-auto">
            {filteredNodes.length === 0 ? (
              <p className="text-[9px] text-slate-600 text-center py-2">无匹配节点</p>
            ) : (
              filteredNodes.map((n) => {
                const d = n.data as Record<string, unknown>;
                return (
                  <button
                    key={n.id}
                    onClick={() => {
                      focusNode(n.id);
                      setSearchQuery("");
                    }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/[0.04] transition text-left"
                  >
                    <span className="text-[9px] text-slate-500 bg-white/[0.04] px-1 rounded">{String(d.kind || "")}</span>
                    <span className="text-[10px] text-slate-300 truncate">{String(d.label || "")}</span>
                  </button>
                );
              })
            )}
          </div>
        )}

        <div className="p-1.5 space-y-0.5">
          {NODE_TYPES.map((t) => (
            <button
              key={t.kind}
              onClick={() => {
                const c = rf.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
                addNode(t.kind, { x: c.x, y: c.y });
              }}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl border text-xs font-medium transition ${t.color}`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        <div className="px-1.5 pb-1.5 pt-0.5 border-t border-white/[0.06] space-y-0.5">
          <button
            onClick={() => setShowTemplates(!showTemplates)}
            className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs transition ${
              showTemplates ? "bg-indigo-500/10 text-indigo-400" : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]"
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" /></svg>
            工作流模板
            <svg className={`w-3 h-3 ml-auto transition-transform ${showTemplates ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </button>

          {showTemplates && (
            <div className="space-y-0.5 pl-1">
              {TEMPLATES.map((tpl) => (
                <button
                  key={tpl.id}
                  onClick={() => handleLoadTemplate(tpl)}
                  className="w-full flex items-start gap-2 px-2.5 py-2 rounded-xl text-left hover:bg-white/[0.04] transition group"
                >
                  <span className="text-sm flex-shrink-0 mt-0.5">{tpl.icon}</span>
                  <div>
                    <p className="text-[11px] text-slate-300 font-medium group-hover:text-white transition">{tpl.name}</p>
                    <p className="text-[9px] text-slate-600">{tpl.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          <button onClick={handleImport} className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] transition">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
            导入工作流
          </button>
          <button onClick={handleExport} className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] transition">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            导出工作流
          </button>
          <button
            onClick={() => useCanvasStore.getState().downloadAllImages()}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 transition"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4a2 2 0 012-2h2M4 16v4a2 2 0 002 2h2M16 4h2a2 2 0 012 2v4m0 4v4a2 2 0 01-2 2h-2M9 13l3 3m0 0l3-3m-3 3V7" /></svg>
            下载所有图片
          </button>
          <button
            onClick={() => { if (confirm("确定清空画布？")) clearCanvas(); }}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs text-red-400 hover:bg-red-500/10 transition"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            清空画布
          </button>
          <button
            onClick={() => useCanvasStore.getState().clearCompletedNodes()}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs text-slate-500 hover:text-emerald-400 hover:bg-emerald-500/10 transition"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            清除已完成节点
          </button>
          <button
            onClick={() => useCanvasStore.getState().clearErrorNodes()}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            清除失败节点
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-white/[0.06] bg-slate-900/80 backdrop-blur-xl px-3 py-2 text-[9px] text-slate-600 space-y-0.5">
        <p>节点: <span className="text-slate-400 font-mono">{nodes.length}</span></p>
        <p>双击标签重命名</p>
        <p>拖角调整大小</p>
      </div>

      <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleFileChange} />
    </div>
  );
};

export default FloatingToolbar;
