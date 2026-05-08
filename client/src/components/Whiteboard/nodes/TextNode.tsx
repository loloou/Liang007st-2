import React, { memo } from "react";
import { Handle, Position, type NodeProps, NodeResizer } from "@xyflow/react";
import { useCanvasStore, type CanvasNodeData } from "../store/useCanvasStore";

const TextNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const d = data as CanvasNodeData;
  const updateNode = useCanvasStore((s) => s.updateNode);
  const selectNode = useCanvasStore((s) => s.selectNode);
  const removeNode = useCanvasStore((s) => s.removeNode);
  const addNode = useCanvasStore((s) => s.addNode);
  const nodes = useCanvasStore((s) => s.nodes);

  const handleCreateGenerate = (e: React.MouseEvent) => {
    e.stopPropagation();
    const thisNode = nodes.find((n) => n.id === id);
    if (!thisNode) return;
    const newId = addNode("generate", {
      x: thisNode.position.x + 320,
      y: thisNode.position.y,
    }, { prompt: d.prompt || "" });
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
      className={`rounded-xl border transition-all bg-slate-900 flex flex-col ${
        selected ? "border-amber-400 ring-2 ring-amber-400/20" : "border-white/10 hover:border-white/20"
      }`}
      style={{ minWidth: 200, minHeight: 120 }}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={180}
        minHeight={100}
        handleStyle={{ width: 8, height: 8, borderRadius: 4, background: "#f59e0b", border: "2px solid #0a0a0f" }}
        lineStyle={{ borderColor: "#f59e0b", borderWidth: 1 }}
      />
      <div className="px-2.5 py-1.5 flex items-center gap-1.5 border-b border-white/[0.06] bg-slate-800/60">
        <svg className="w-3 h-3 text-amber-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
        <span className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider flex-1">{d.label}</span>
        {selected && (
          <div className="flex items-center gap-0.5">
            <button
              onClick={handleCreateGenerate}
              className="w-5 h-5 rounded text-slate-500 hover:text-purple-400 hover:bg-purple-500/10 flex items-center justify-center transition"
              title="创建 AI 生成节点并连接"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
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

      <div className="p-2.5">
        <textarea
          className="w-full bg-transparent text-xs text-slate-300 placeholder-slate-600 resize-none focus:outline-none leading-relaxed min-h-[80px]"
          rows={4}
          placeholder="输入提示词...&#10;&#10;连接到 AI 生成节点后会自动同步"
          value={d.prompt || ""}
          onChange={(e) => {
            updateNode(id, { prompt: e.target.value });
            // 同步到所有连接的 generate 节点
            const edges = useCanvasStore.getState().edges;
            const nodes = useCanvasStore.getState().nodes;
            edges
              .filter((edge) => edge.source === id)
              .forEach((edge) => {
                const target = nodes.find((n) => n.id === edge.target);
                if (target?.data?.kind === "generate") {
                  useCanvasStore.getState().updateNode(edge.target, { prompt: e.target.value });
                }
              });
          }}
          onClick={(e) => e.stopPropagation()}
        />
        {d.prompt && (
          <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-white/[0.04]">
            <span className="text-[9px] text-slate-700 font-mono">{String(d.prompt).length} 字符</span>
            <button
              onClick={(e) => { e.stopPropagation(); updateNode(id, { prompt: "" }); }}
              className="text-[9px] text-slate-700 hover:text-slate-400 transition"
            >
              清空
            </button>
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Right} className="!w-3 !h-3 !bg-amber-500 !border-2 !border-slate-900" />
    </div>
  );
};

export default memo(TextNode);
