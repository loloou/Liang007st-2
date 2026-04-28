import React from "react";

interface RatioMismatchData {
  actualRatio: string;
  expectedRatio: string;
  onConfirm: () => void;
}

interface RatioMismatchDialogProps {
  data: RatioMismatchData | null;
  onDismiss: () => void;
  onRegenerate: () => void;
}

const RatioMismatchDialog: React.FC<RatioMismatchDialogProps> = ({
  data,
  onDismiss,
  onRegenerate,
}) => {
  if (!data) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
      onClick={onDismiss}
    >
      <div
        className="glass-popup rounded-2xl w-full max-w-md overflow-hidden popup-enter shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="h-12 bg-gradient-to-r from-amber-500 to-orange-500 flex items-center px-4 gap-2">
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <span className="text-white font-semibold text-sm">生成图片比例与设置不一致</span>
        </div>

        {/* 内容 */}
        <div className="p-5 space-y-3">
          <p className="text-sm text-slate-700">生成的图片比例与您的设置不匹配：</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-red-50 rounded-xl p-3 border border-red-100">
              <p className="text-[10px] text-red-500 font-semibold uppercase tracking-wider mb-1">
                实际比例
              </p>
              <p className="text-lg font-bold text-red-600">{data.actualRatio}</p>
            </div>
            <div className="bg-green-50 rounded-xl p-3 border border-green-100">
              <p className="text-[10px] text-green-600 font-semibold uppercase tracking-wider mb-1">
                设置比例
              </p>
              <p className="text-lg font-bold text-green-600">{data.expectedRatio}</p>
            </div>
          </div>
          <p className="text-xs text-slate-500">是否重新生成以获得正确比例的图片？</p>
        </div>

        {/* 操作 */}
        <div className="px-5 pb-5 flex gap-2 justify-end">
          <button
            className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm hover:bg-slate-50 transition"
            onClick={onDismiss}
          >
            保留当前结果
          </button>
          <button
            className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-medium hover:from-amber-600 hover:to-orange-600 transition"
            onClick={onRegenerate}
          >
            重新生成
          </button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(RatioMismatchDialog);
