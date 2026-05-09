import React, { useCallback, useEffect } from "react";

interface ShortcutsHelpProps {
  onClose: () => void;
}

const SHORTCUTS = [
  { keys: ["Enter"], desc: "发送提示词生成图片" },
  { keys: ["Shift", "Enter"], desc: "提示词换行" },
  { keys: ["Ctrl", "Enter"], desc: "执行选中的 AI 生成节点" },
  { keys: ["Delete", "Backspace"], desc: "删除选中节点" },
  { keys: ["Ctrl", "Z"], desc: "撤销" },
  { keys: ["Ctrl", "Y"], desc: "重做" },
  { keys: ["Ctrl", "A"], desc: "全选节点" },
  { keys: ["Ctrl", "L"], desc: "自动布局" },
  { keys: ["Ctrl", "0"], desc: "适应视图" },
  { keys: ["Escape"], desc: "取消选择 / 关闭面板" },
  { keys: ["双击空白区域"], desc: "添加节点菜单" },
  { keys: ["双击标签"], desc: "重命名节点" },
  { keys: ["拖拽节点角落"], desc: "调整节点大小" },
  { keys: ["右键节点"], desc: "节点操作菜单" },
  { keys: ["拖入图片文件"], desc: "创建图片节点" },
  { keys: ["端口拖出到空白"], desc: "快速连接菜单" },
];

const ShortcutsHelp: React.FC<ShortcutsHelpProps> = ({ onClose }) => {
  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  }, [onClose]);

  useEffect(() => {
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleKey]);

  return (
    <div className="fixed inset-0 z-[10002] bg-black/60 backdrop-blur-sm flex items-center justify-center" onClick={onClose}>
      <div className="rounded-2xl border border-white/[0.08] bg-slate-900/98 backdrop-blur-xl shadow-2xl w-[420px] max-h-[80vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-white/[0.06] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>
            <span className="text-sm font-bold text-slate-200">快捷键</span>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-lg transition">✕</button>
        </div>
        <div className="p-4 space-y-1.5 overflow-y-auto max-h-[60vh]">
          {SHORTCUTS.map((s, i) => (
            <div key={i} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-white/[0.03]">
              <span className="text-xs text-slate-400">{s.desc}</span>
              <div className="flex items-center gap-1">
                {s.keys.map((k, j) => (
                  <React.Fragment key={j}>
                    <kbd className="px-1.5 py-0.5 rounded bg-white/[0.06] text-[10px] text-slate-300 font-mono border border-white/[0.08]">{k}</kbd>
                    {j < s.keys.length - 1 && <span className="text-slate-600 text-[10px]">+</span>}
                  </React.Fragment>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="px-4 py-2 border-t border-white/[0.06] text-center">
          <span className="text-[10px] text-slate-600">按 ESC 关闭</span>
        </div>
      </div>
    </div>
  );
};

export default ShortcutsHelp;
