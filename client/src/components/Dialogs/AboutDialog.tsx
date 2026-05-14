import React from "react";
import { useUiStore } from "../../store/uiStore";

const FEATURES = [
  "提示词优化", "批量生成", "参考图", "多模型", "多渠道", "生图历史", "性能监控",
];

const AboutDialog: React.FC = () => {
  const showAbout = useUiStore((s) => s.showAbout);
  const setShowAbout = useUiStore((s) => s.setShowAbout);

  if (!showAbout) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overlay-dark"
      onClick={() => setShowAbout(false)}
    >
      <div
        className="glass-popup rounded-2xl w-full max-w-md overflow-hidden popup-enter"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部渐变 */}
        <div className="h-28 bg-gradient-to-r from-primary-500/100 via-purple-500 to-pink-500 flex flex-col items-center justify-center relative overflow-hidden">
          <div
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage:
                "radial-gradient(circle at 20% 50%, white 0%, transparent 50%), radial-gradient(circle at 80% 20%, white 0%, transparent 40%)",
            }}
          />
          <div className="w-16 h-16 bg-white/25 backdrop-blur rounded-2xl flex items-center justify-center shadow-lg">
            <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
        </div>

        {/* 内容 */}
        <div className="p-6 text-center">
          <h2 className="text-xl font-bold text-slate-100 mb-0.5">Liang007 生图</h2>
          <p className="text-sm text-slate-400 mb-4">Version 5.5.0</p>
          <p className="text-sm text-slate-400 mb-4 leading-relaxed">
            基于 React + Vite + TypeScript + Tailwind CSS 开发的 AI 生图工作台，支持多种生图
            API 与模型。
          </p>

          {/* 版权声明 */}
          <div className="mb-5 px-4 py-2.5 bg-red-500/10 rounded-xl border border-red-500/15">
            <p className="text-xs text-red-400 font-semibold">🔒 内部专用 · 所有权归 Liang007</p>
            <p className="text-[10px] text-red-400 mt-0.5">Liang007 Studio © 2026 · 未经授权禁止使用</p>
          </div>

          {/* 功能标签 */}
          <div className="flex flex-col gap-2 text-xs text-slate-500 mb-6">
            <div className="flex flex-wrap justify-center gap-1.5">
              {FEATURES.map((f) => (
                <span
                  key={f}
                  className="px-2 py-1 bg-white/[0.06] rounded-lg border border-white/[0.06] text-slate-400 text-[11px]"
                >
                  {f}
                </span>
              ))}
            </div>
          </div>

          <button
            onClick={() => setShowAbout(false)}
            className="px-8 py-2.5 rounded-full bg-gradient-to-r from-primary-500/100 to-purple-500/100 text-white text-sm font-medium shadow-lg shadow-primary-500/25 btn-hover-lift"
          >
            知道了
          </button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(AboutDialog);
