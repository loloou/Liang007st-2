import React, { useEffect, useRef } from "react";
import { useCanvasStore } from "../store/useCanvasStore";

interface ContextMenuProps {
  x: number;
  y: number;
  nodeId: string;
  onClose: () => void;
}

const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, nodeId, onClose }) => {
  const { removeNode, duplicateNode, runGenerate, nodes } = useCanvasStore();
  const ref = useRef<HTMLDivElement>(null);
  const node = nodes.find((n) => n.id === nodeId);
  const kind = node?.data?.kind as string | undefined;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const items = [
    ...(kind === "generate" ? [{
      label: "▶ 执行生成",
      color: "text-purple-400",
      action: () => { runGenerate(nodeId); onClose(); },
    }] : []),
    {
      label: "📋 复制节点",
      color: "text-slate-300",
      action: () => { duplicateNode(nodeId); onClose(); },
    },
    {
      label: "🗑 删除节点",
      color: "text-red-400",
      action: () => { removeNode(nodeId); onClose(); },
    },
  ];

  return (
    <div
      ref={ref}
      className="fixed z-[10000] rounded-xl border border-white/[0.08] bg-slate-900/98 backdrop-blur-xl shadow-2xl py-1.5 min-w-[160px]"
      style={{ left: x, top: y }}
    >
      <div className="px-3 py-1 border-b border-white/[0.06] mb-1">
        <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">{kind || "节点"}</span>
      </div>
      {items.map((item, i) => (
        <button
          key={i}
          onClick={item.action}
          className={`w-full px-3 py-2 text-left text-xs ${item.color} hover:bg-white/[0.04] transition`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
};

export default ContextMenu;
