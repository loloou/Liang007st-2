/**
 * ResultPanel — 生成结果展示区
 *
 * 从 App.tsx 提取的独立组件。
 * 展示生成结果、进度、缩略图、批量操作等。
 */
import React from "react";
import type { GeneratedImage } from "../api/imageClient";
import { safeUrl } from "../utils/safeUrl";

interface Props {
  results: GeneratedImage[];
  setResults: React.Dispatch<React.SetStateAction<GeneratedImage[]>>;
  resultActiveIdx: number;
  setResultActiveIdx: (v: number | ((prev: number) => number)) => void;
  selectedImageIds: Set<string>;
  setSelectedImageIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  status: "idle" | "running";
  storeStatus: string;
  elapsedSeconds: number;
  progressPct: number;
  lastDuration: string | null;
  batchSize: number;
  downloadStatus: "idle" | "downloading";
  toggleSelectAll: () => void;
  handleBatchDownload: () => void;
  setPreviewImage: (img: GeneratedImage | null) => void;
}

const ResultPanel: React.FC<Props> = ({
  results, setResults,
  resultActiveIdx, setResultActiveIdx,
  selectedImageIds, setSelectedImageIds,
  status, storeStatus,
  elapsedSeconds, progressPct, lastDuration,
  batchSize, downloadStatus,
  toggleSelectAll, handleBatchDownload,
  setPreviewImage,
}) => {
  const safeIdx = results.length > 0 ? Math.min(Math.max(resultActiveIdx, 0), results.length - 1) : 0;

  return (
    <section className={`flex-1 min-w-[200px] glass-card rounded-2xl flex flex-col overflow-hidden ${status === "running" ? "generating-pulse" : ""}`}>
      {/* 标题栏 */}
      <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2 text-sm text-slate-200">
          <span className="font-semibold">生成结果</span>
          {results.length > 0 && <span className="badge-primary">{results.length} 张</span>}
          {results.length > 0 && lastDuration && (
            <span className="badge-primary/60 text-slate-500 font-mono">用时 {lastDuration}</span>
          )}
          {storeStatus === "running" && (() => {
            const mins = Math.floor(elapsedSeconds / 60);
            const secs = elapsedSeconds % 60;
            return <span className="badge-warning flex items-center gap-1"><span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />生成中 {mins > 0 ? `(${mins}分${secs}秒)` : `(${secs}秒)`}</span>;
          })()}
          {selectedImageIds.size > 0 && <span className="badge-success">已选 {selectedImageIds.size}</span>}
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          {results.length > 0 && (
            <>
              <button onClick={toggleSelectAll} className="px-2.5 py-1 rounded-lg glass-button text-xs btn-hover-lift">
                {selectedImageIds.size === results.length ? "取消全选" : "全选"}
              </button>
              <button
                onClick={handleBatchDownload}
                disabled={selectedImageIds.size === 0 || downloadStatus === "downloading"}
                className="px-2.5 py-1 rounded-lg glass-button disabled:opacity-30 disabled:cursor-not-allowed text-xs btn-hover-lift"
              >
                {downloadStatus === "downloading" ? "下载中..." : "批量下载"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* 内容区 */}
      <div className="flex-1 flex items-center justify-center overflow-auto app-scrollbar">
        {status === "running" && results.length === 0 ? (
          /* 骨架屏 */
          <div className="w-full h-full p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: batchSize }).map((_, i) => (
              <div key={i} className="rounded-xl overflow-hidden">
                <div className="skeleton w-full h-40" />
                <div className="p-2 space-y-1.5">
                  <div className="skeleton h-2.5 w-3/4" />
                  <div className="skeleton h-2 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : results.length === 0 ? (
          /* 空状态 */
          <div className="flex flex-col items-center justify-center text-slate-500 h-full px-8 py-12">
            <div className="empty-placeholder w-56 h-40 flex flex-col items-center justify-center mb-6 group cursor-default">
              <div className="grid grid-cols-3 gap-2 mb-3 opacity-20">
                {["bg-purple-500/30","bg-blue-500/30","bg-pink-500/30","bg-amber-500/30","bg-emerald-500/30","bg-cyan-500/30"].map((c,i)=>(
                  <div key={i} className={`w-8 h-8 rounded-lg ${c}`} />
                ))}
              </div>
              <p className="text-xs text-slate-500 font-medium">你的作品将在这里展示</p>
            </div>
            <p className="text-sm font-medium text-slate-400 mb-1">暂无生成结果</p>
            <p className="text-xs text-slate-400 text-center leading-relaxed max-w-[200px]">在右侧输入提示词，<br/>选择模型后点击「开始生图」</p>
          </div>
        ) : (
          (() => {
            const activeImg = results[safeIdx];
            const extendedImg = activeImg as typeof activeImg & { originalUrl?: string };
            const activeImgUrl = extendedImg.originalUrl || activeImg.url;
            return (
              <div className="w-full h-full flex flex-col">
                {/* 主图区 */}
                <div
                  className="flex-1 relative overflow-hidden cursor-pointer group"
                  onClick={() => { if (status !== "running") setPreviewImage(activeImg); }}
                >
                  <img
                    src={activeImgUrl}
                    alt=""
                    className={`w-full h-full object-contain ${status === "running" ? "opacity-40 scale-105" : ""} transition-all duration-300`}
                    draggable={false}
                    onError={(e) => {
                      const parent = e.currentTarget.parentElement;
                      if (parent) {
                        parent.innerHTML = '<div class="flex items-center justify-center w-full h-full text-slate-400">图片加载失败</div>';
                      }
                    }}
                  />

                  {/* 生成中遮罩 */}
                  {status === "running" && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center z-20">
                      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
                      <div className="relative z-10 flex flex-col items-center gap-3 w-full px-6 max-w-xs">
                        <div className="flex items-center gap-2 text-white">
                          <svg className="animate-spin w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          <span className="text-sm font-medium">生成中…</span>
                          <span className="text-xs text-amber-300 font-mono ml-1">
                            {Math.floor(elapsedSeconds / 60) > 0
                              ? `${Math.floor(elapsedSeconds / 60)}分${elapsedSeconds % 60}秒`
                              : `${elapsedSeconds}秒`}
                          </span>
                        </div>
                        <div className="w-full">
                          <div className="w-full h-2 bg-white/20 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-amber-400 to-amber-500 rounded-full transition-all duration-500"
                              style={{ width: `${progressPct}%` }}
                            />
                          </div>
                          <div className="flex justify-between mt-1">
                            <span className="text-[10px] text-amber-200">正在生成新图…</span>
                            <span className="text-[10px] text-amber-200 font-mono">{progressPct}%</span>
                          </div>
                        </div>
                        <p className="text-[10px] text-white/60 text-center">旧图已保留，新图完成后自动切换</p>
                      </div>
                    </div>
                  )}

                  {/* 返回按钮 */}
                  <button
                    className="absolute top-2 left-2 w-8 h-8 rounded-full bg-black/80 hover:bg-slate-600 text-white flex items-center justify-center transition opacity-0 group-hover:opacity-100 z-30"
                    onClick={(e) => { e.stopPropagation(); setResults([]); setResultActiveIdx(0); setSelectedImageIds(new Set()); }}
                    title="返回默认界面"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                  </button>

                  {/* 左右切换 */}
                  {results.length > 1 && (
                    <>
                      <button
                        className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center transition opacity-0 group-hover:opacity-100 text-xl leading-none"
                        onClick={(e) => { e.stopPropagation(); setResultActiveIdx((i) => (i - 1 + results.length) % results.length); }}
                      >‹</button>
                      <button
                        className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center transition opacity-0 group-hover:opacity-100 text-xl leading-none"
                        onClick={(e) => { e.stopPropagation(); setResultActiveIdx((i) => (i + 1) % results.length); }}
                      >›</button>
                      <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-black/50 text-white text-[10px] font-medium">
                        {safeIdx + 1} / {results.length}
                      </div>
                    </>
                  )}
                </div>

                {/* 缩略图横条 */}
                {results.length > 1 && (
                  <div className="flex-shrink-0 flex gap-1.5 px-2 py-2 overflow-x-auto app-scrollbar border-t border-white/[0.06]">
                    {results.map((img, idx) => {
                      const extImg = img as typeof img & { originalUrl?: string };
                      const thumbUrl = img.url || extImg.originalUrl;
                      return (
                        <div key={img.id} className="relative flex-shrink-0">
                          <button
                            onClick={() => setResultActiveIdx(idx)}
                            className={`w-12 h-12 rounded-lg overflow-hidden border-2 transition-all ${idx === safeIdx ? "border-primary-400 ring-1 ring-primary-400/30" : "border-transparent hover:border-white/20"}`}
                          >
                            <img src={safeUrl(thumbUrl)} alt="" className="w-full h-full object-cover" />
                          </button>
                          <button
                            className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-red-500/90 hover:bg-red-600 text-white flex items-center justify-center transition text-xs leading-none"
                            onClick={(e) => {
                              e.stopPropagation();
                              setResults((prev) => prev.filter((_, i) => i !== idx));
                              if (idx < safeIdx) setResultActiveIdx(safeIdx - 1);
                              else if (idx === safeIdx && results.length > 1) setResultActiveIdx(Math.min(safeIdx, results.length - 2));
                            }}
                            title="删除此图片"
                          >×</button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()
        )}
      </div>
    </section>
  );
};

export default ResultPanel;
