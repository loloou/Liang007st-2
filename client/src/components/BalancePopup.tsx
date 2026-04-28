import React from "react";

interface BalancePopupProps {
  open: boolean;
  balanceStatus: "ok" | "idle" | "loading" | "fail";
  balanceMessage: string;
  buttonRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}

const BalancePopup: React.FC<BalancePopupProps> = ({
  open,
  balanceStatus,
  balanceMessage,
  buttonRef,
  onClose,
}) => {
  if (!open || !buttonRef.current) return null;

  const rect = buttonRef.current.getBoundingClientRect();

  return (
    <>
      {/* 点击遮罩关闭 */}
      <div className="fixed inset-0 z-[9998]" onClick={onClose} />
      <div
        className="fixed z-[9999] glass-popup rounded-xl w-64 overflow-hidden popup-enter"
        style={{ left: rect.left, top: rect.bottom + 6 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`h-10 flex items-center justify-between px-4 ${
          balanceStatus === "ok"
            ? "bg-gradient-to-r from-green-500 to-emerald-500"
            : "bg-gradient-to-r from-red-400 to-rose-500"
        }`}>
          <span className="text-xs font-bold text-white">
            {balanceStatus === "ok" ? "✓ 余额查询成功" : "✗ 查询失败"}
          </span>
          <button className="text-white/80 hover:text-white text-lg leading-none" onClick={onClose}>×</button>
        </div>
        <div className="p-3">
          {balanceStatus === "ok" ? (
            <pre className="text-xs text-slate-700 whitespace-pre-wrap break-all font-mono bg-white/60 rounded-lg p-2 max-h-40 overflow-y-auto app-scrollbar border border-white/40">
              {balanceMessage}
            </pre>
          ) : (
            <p className="text-xs text-red-500">{balanceMessage || "未知错误，请检查 API 设置"}</p>
          )}
          <div className="mt-2 text-[10px] text-slate-400 text-right">点击空白处关闭</div>
        </div>
      </div>
    </>
  );
};

export default React.memo(BalancePopup);
