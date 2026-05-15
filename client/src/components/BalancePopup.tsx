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
  
  // 检测是否是 HTML 响应
  const isHtmlResponse = balanceMessage.trim().startsWith("<");
  
  // 尝试提取格式化的余额信息
  let displayMessage = balanceMessage;
  let balanceDisplay = "";
  
  if (balanceStatus === "ok" && !isHtmlResponse) {
    try {
      const data = JSON.parse(balanceMessage);
      // 尝试提取余额字段
      const balance = data.quota ?? data.balance ?? data.credit ?? data.amount ?? data.remaining;
      if (typeof balance === "number") {
        balanceDisplay = balance >= 1 
          ? `¥${balance.toFixed(2)}`
          : `${(balance * 1000).toFixed(0)} 积分`;
      }
    } catch {
      // 如果不是 JSON，保持原样
    }
  }

  const displayMessageForHtml = isHtmlResponse 
    ? "⚠️ 服务器返回了 HTML 页面而不是 JSON 数据。\n\n可能原因：\n1. 余额查询端点配置错误\n2. 需要更新端点 URL\n3. 服务器返回了错误页面\n\n请在设置中检查并更新余额查询配置。"
    : displayMessage;

  return (
    <>
      {/* 点击遮罩关闭 */}
      <div className="fixed inset-0 z-[9998]" onClick={onClose} />
      <div
        className="fixed z-[9999] glass-popup rounded-xl w-80 overflow-hidden popup-enter"
        style={{ left: rect.left, top: rect.bottom + 6 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`h-10 flex items-center justify-between px-4 ${
          balanceStatus === "ok" && !isHtmlResponse
            ? "bg-gradient-to-r from-green-500 to-emerald-500"
            : "bg-gradient-to-r from-red-400 to-rose-500"
        }`}>
          <span className="text-xs font-bold text-white">
            {balanceStatus === "ok" && !isHtmlResponse ? "✓ 余额查询成功" : "✗ 查询失败"}
          </span>
          <button className="text-white/80 hover:text-white text-lg leading-none" onClick={onClose}>×</button>
        </div>
        <div className="p-3">
          {balanceStatus === "ok" && !isHtmlResponse ? (
            <div className="space-y-2">
              {balanceDisplay && (
                <div className="text-center">
                  <div className="text-2xl font-bold text-emerald-400">{balanceDisplay}</div>
                  <div className="text-[10px] text-slate-400 mt-1">当前余额</div>
                </div>
              )}
              <pre className="text-xs text-slate-300 whitespace-pre-wrap break-all font-mono bg-white/60 rounded-lg p-2 max-h-40 overflow-y-auto app-scrollbar border border-white/40">
                {displayMessage}
              </pre>
            </div>
          ) : (
            <p className="text-xs text-red-500 whitespace-pre-wrap leading-relaxed">{displayMessageForHtml || "未知错误，请检查 API 设置"}</p>
          )}
          <div className="mt-2 text-[10px] text-slate-400 text-right">点击空白处关闭</div>
        </div>
      </div>
    </>
  );
};

export default React.memo(BalancePopup);
