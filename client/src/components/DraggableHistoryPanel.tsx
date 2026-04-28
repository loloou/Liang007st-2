import React, { useState, useRef, useEffect } from "react";
import { useUiStore } from "../store/uiStore";
import { useGenerationStore } from "../store/generationStore";

interface HistoryEntry {
  id: string;
  prompt: string;
  negativePrompt?: string;
  model: string;
  width: number;
  height: number;
  batchSize: number;
  results: Array<{ id?: string; url: string; [key: string]: unknown }>;
  time: string;
  error?: string;
}

interface DraggableHistoryPanelProps {
  open: boolean;
  onClose: () => void;
  generationHistory: HistoryEntry[];
  setGenerationHistory: (v: HistoryEntry[]) => void;
  historyBatchMode: boolean;
  setHistoryBatchMode: (v: boolean) => void;
  historySelected: Set<string>;
  setHistorySelected: (v: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
  /** 初始 Y 位置，跟随历史按钮 */
  initialY?: number;
}

const DraggableHistoryPanel: React.FC<DraggableHistoryPanelProps> = ({
  open,
  onClose,
  generationHistory,
  setGenerationHistory,
  historyBatchMode,
  setHistoryBatchMode,
  historySelected,
  setHistorySelected,
  initialY,
}) => {
  // 仅用于 apply-entry 时的表单填充
  const setPrompt = useGenerationStore((s) => s.setPrompt);
  const setNegativePrompt = useGenerationStore((s) => s.setNegativePrompt);
  const setModel = useGenerationStore((s) => s.setModel);
  const setBatchSize = useGenerationStore((s) => s.setBatchSize);
  const setResults = useGenerationStore((s) => s.setResults);
  const setResultActiveIdx = useGenerationStore((s) => s.setResultActiveIdx);
  const setError = useUiStore((s) => s.setError);
  
  // 默认位置和尺寸（x=85 避免遮挡左侧历史按钮，y 固定屏幕垂直居中偏上）
  const DEFAULT_WIDTH = 320;
  const DEFAULT_HEIGHT = 480;
  const DEFAULT_X = 85;
  const DEFAULT_Y = Math.max(80, Math.round(window.innerHeight / 2 - 240));
  
  const [position, setPosition] = useState({ x: DEFAULT_X, y: DEFAULT_Y });
  const [size, setSize] = useState({ width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [histPreviewZoom, setHistPreviewZoom] = useState(1);
  const [histPreviewOffset, setHistPreviewOffset] = useState({ x: 0, y: 0 });
  const [historyFullPreview, setHistoryFullPreview] = useState<HistoryEntry["results"][0] | null>(null);
  const dragStart = useRef<{ mouseX: number; mouseY: number; startX: number; startY: number } | null>(null);
  const resizeStart = useRef<{ mouseX: number; mouseY: number; startW: number; startH: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // 拖动逻辑
  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => {
      if (!dragStart.current) return;
      setPosition({
        x: dragStart.current.startX + e.clientX - dragStart.current.mouseX,
        y: dragStart.current.startY + e.clientY - dragStart.current.mouseY,
      });
    };
    const onUp = () => {
      setIsDragging(false);
      document.body.style.cursor = "";
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.cursor = "grabbing";
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
    };
  }, [isDragging]);

  // 拉伸逻辑
  useEffect(() => {
    if (!isResizing) return;
    const onMove = (e: MouseEvent) => {
      if (!resizeStart.current) return;
      const dx = e.clientX - resizeStart.current.mouseX;
      const dy = e.clientY - resizeStart.current.mouseY;
      const newWidth = Math.max(260, Math.min(window.innerWidth, resizeStart.current.startW + dx));
      const newHeight = Math.max(300, Math.min(window.innerHeight, resizeStart.current.startH + dy));
      setSize({ width: newWidth, height: newHeight });
    };
    const onUp = () => {
      setIsResizing(false);
      document.body.style.cursor = "";
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.cursor = "se-resize";
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
    };
  }, [isResizing]);

  if (!open) return null;

  const setHistFullPreview = (img: HistoryEntry["results"][0]) => setHistoryFullPreview(img);

  // 全屏时的样式
  const fullscreenStyle: React.CSSProperties = isFullscreen ? {
    left: 0,
    top: 0,
    width: "100vw",
    height: "100vh",
    borderRadius: 0,
  } : {
    left: position.x,
    top: position.y,
    width: size.width,
    height: size.height,
    borderRadius: "1rem",
  };

  return (
    <>
      {/* 历史面板 */}
      <div
        ref={panelRef}
        className={`fixed z-50 flex-shrink-0 glass-card flex flex-col overflow-hidden shadow-2xl ${isFullscreen ? "history-panel-fullscreen" : "history-panel-enter"}`}
        style={fullscreenStyle}
      >
        {/* ── 拖拽头部（双击全屏） ── */}
        <div
          className="flex-shrink-0 px-3 py-2.5 flex items-center justify-between bg-gradient-to-r from-primary-500 to-purple-500 select-none cursor-grab active:cursor-grabbing"
          style={isFullscreen ? { borderRadius: 0 } : { borderTopLeftRadius: "1rem", borderTopRightRadius: "1rem" }}
          onMouseDown={(e) => {
            // 忽略右下角拉伸区域的点击
            const rect = panelRef.current?.getBoundingClientRect();
            if (rect && e.clientX > rect.right - 20 && e.clientY > rect.bottom - 20) return;
            e.preventDefault();
            setIsDragging(true);
            dragStart.current = {
              mouseX: e.clientX,
              mouseY: e.clientY,
              startX: position.x,
              startY: position.y,
            };
          }}
          onDoubleClick={() => {
            // 双击切换全屏
            if (isFullscreen) {
              setIsFullscreen(false);
              setPosition({ x: DEFAULT_X, y: DEFAULT_Y });
              setSize({ width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT });
            } else {
              setIsFullscreen(true);
            }
          }}
          title="双击切换全屏模式"
        >
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h2 className="text-sm font-bold text-white">生图历史</h2>
            {generationHistory.length > 0 && (
              <span className="px-1.5 py-0.5 bg-white/25 rounded-full text-white text-[10px] font-semibold tabular-nums">{generationHistory.length}</span>
            )}
            {isFullscreen && <span className="ml-1 px-1.5 py-0.5 bg-white/20 rounded text-white/70 text-[9px]">全屏 · 双击退出</span>}
          </div>
          <div className="flex items-center gap-1">
            {!isFullscreen && (
              <button
                onClick={(e) => { e.stopPropagation(); setIsFullscreen(true); }}
                className="text-white/60 hover:text-white text-[11px] px-1.5 py-1 rounded-lg hover:bg-white/20 transition"
                title="全屏模式"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
              </button>
            )}
            {isFullscreen && (
              <button
                onClick={(e) => { e.stopPropagation(); setIsFullscreen(false); setPosition({ x: DEFAULT_X, y: DEFAULT_Y }); setSize({ width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT }); }}
                className="text-white/60 hover:text-white text-[11px] px-1.5 py-1 rounded-lg hover:bg-white/20 transition"
                title="退出全屏"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
            {generationHistory.length > 0 && (
              <button
                onClick={(e) => { e.stopPropagation(); setHistoryBatchMode(!historyBatchMode); setHistorySelected(new Set()); }}
                className={`text-white text-[11px] px-2 py-1 rounded-lg transition font-medium ${historyBatchMode ? "bg-white/30 ring-1 ring-white/40" : "hover:bg-white/20 text-white/80"}`}
              >{historyBatchMode ? "退出批量" : "批量操作"}</button>
            )}
            {generationHistory.length > 0 && !historyBatchMode && (
              <button
                onClick={(e) => { e.stopPropagation(); if (confirm("确定要清空所有历史记录吗？此操作不可撤销。")) { setGenerationHistory([]); } }}
                className="text-white/60 hover:text-white text-[11px] px-1.5 py-1 rounded-lg hover:bg-red-500/40 transition"
                title="清空全部历史"
              >清空</button>
            )}
            <button
              className="w-7 h-7 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/20 rounded-lg transition text-lg leading-none"
              onClick={(e) => { e.stopPropagation(); onClose(); }}
              title="关闭"
            >×</button>
          </div>
        </div>

        {/* ── 批量操作工具栏 ── */}
        {historyBatchMode && (
          <div className="flex-shrink-0 flex items-center justify-between px-3 py-2 bg-primary-50/80 border-b border-primary-100">
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (historySelected.size === generationHistory.length) {
                    setHistorySelected(new Set());
                  } else {
                    setHistorySelected(new Set(generationHistory.map((e) => e.id)));
                  }
                }}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-primary-200 text-primary-600 text-[11px] font-medium hover:bg-primary-50 transition"
              >
                <div className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center transition-colors flex-shrink-0 ${historySelected.size === generationHistory.length && generationHistory.length > 0 ? "bg-primary-500 border-primary-500" : "border-slate-300 bg-white"}`}>
                  {historySelected.size === generationHistory.length && generationHistory.length > 0 && (
                    <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/></svg>
                  )}
                </div>
                {historySelected.size === generationHistory.length && generationHistory.length > 0 ? "取消全选" : "全选"}
              </button>
              <span className="text-[11px] text-slate-500">
                已选 <span className="font-semibold text-slate-700 tabular-nums">{historySelected.size}</span>
              </span>
            </div>
            <button
              onClick={() => {
                if (historySelected.size === 0) return;
                if (confirm(`确定删除选中的 ${historySelected.size} 条记录？`)) {
                  const newHistory = generationHistory.filter((e) => !historySelected.has(e.id));
                  setGenerationHistory(newHistory);
                  setHistorySelected(new Set());
                  if (newHistory.length === 0) setHistoryBatchMode(false);
                }
              }}
              disabled={historySelected.size === 0}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-500 hover:bg-red-600 text-white text-[11px] font-medium transition disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
              删除选中 {historySelected.size > 0 ? `(${historySelected.size})` : ""}
            </button>
          </div>
        )}

        {/* ── 历史列表 ── */}
        <div className="flex-1 overflow-y-auto app-scrollbar p-2 space-y-1.5">
          {generationHistory.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 py-10 gap-2">
              <div className="w-16 h-16 rounded-2xl bg-white/60 flex items-center justify-center shadow-sm">
                <svg className="w-8 h-8 text-slate-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-xs font-medium text-slate-400">暂无生图历史</p>
              <p className="text-[10px] text-slate-300">生图后自动保存到这里</p>
            </div>
          ) : (
            generationHistory.map((entry) => {
              const isSelected = historySelected.has(entry.id);
              return (
                <div
                  key={entry.id}
                  className={`rounded-xl border transition-all group cursor-pointer ${
                    historyBatchMode && isSelected
                      ? "border-primary-400 bg-primary-50/70 shadow-sm"
                      : entry.error
                      ? "border-red-200/70 bg-red-50/40 hover:bg-red-50/70 hover:border-red-300"
                      : entry.results.length === 0
                      ? "border-slate-200/60 bg-white/50 animate-pulse-subtle"
                      : "border-white/50 bg-white/65 hover:bg-white/85 hover:border-primary-200 hover:shadow-sm"
                  }`}
                  onClick={() => {
                    if (historyBatchMode) {
                      setHistorySelected((prev: Set<string>) => {
                        const next = new Set(prev);
                        if (next.has(entry.id)) next.delete(entry.id);
                        else next.add(entry.id);
                        return next;
                      });
                    }
                  }}
                >
                  {/* 卡片头部 */}
                  <div className="flex items-center justify-between px-2.5 pt-2 pb-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {historyBatchMode && (
                        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${isSelected ? "bg-primary-500 border-primary-500" : "bg-white border-slate-300"}`}>
                          {isSelected && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/></svg>}
                        </div>
                      )}
                      <span className="text-[10px] text-slate-400 font-mono truncate">{entry.time}</span>
                    </div>
                    {!historyBatchMode && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setGenerationHistory(generationHistory.filter(h => h.id !== entry.id)); }}
                        className="w-5 h-5 flex items-center justify-center rounded text-slate-300 hover:text-red-500 hover:bg-red-50 transition opacity-0 group-hover:opacity-100 flex-shrink-0"
                        title="删除此条"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                      </button>
                    )}
                  </div>

                  {/* 提示词 */}
                  <div className="px-2.5 pb-1 text-xs text-slate-700 line-clamp-2 leading-relaxed">{entry.prompt}</div>

                  {/* 模型 + 尺寸 */}
                  <div className="px-2.5 pb-1.5 flex items-center gap-1 flex-wrap">
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-primary-100/80 text-primary-700 text-[10px] font-medium max-w-[100px] truncate">{entry.model}</span>
                    <span className="text-[10px] text-slate-400">{entry.width}×{entry.height}</span>
                    <span className="text-[10px] text-slate-400">·</span>
                    <span className="text-[10px] text-slate-400">{entry.batchSize} 张</span>
                  </div>

                  {/* 图片网格：单击预览 */}
                  {entry.results.length > 0 && (
                    <div className={`px-2 pb-2 grid gap-1 ${entry.results.length === 1 ? "grid-cols-1" : entry.results.length <= 4 ? "grid-cols-2" : "grid-cols-3"}`}>
                      {entry.results.slice(0, 6).map((img, idx) => {
                        if (!img || !img.url) return null;
                        return (
                          <div
                            key={`${entry.id}-${img.id || idx}`}
                            className="relative rounded-lg overflow-hidden group/thumb"
                            style={{ aspectRatio: "1/1" }}
                          >
                            <img
                              src={img.url}
                              alt=""
                              className="w-full h-full object-cover transition-transform duration-150 group-hover/thumb:scale-105"
                              draggable={false}
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                e.currentTarget.parentElement?.classList.add('bg-slate-100');
                              }}
                            />
                            <div
                              className="absolute inset-0 bg-black/0 group-hover/thumb:bg-black/35 transition-colors duration-150 flex items-center justify-center gap-1.5 opacity-0 group-hover/thumb:opacity-100"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!historyBatchMode) {
                                  setHistPreviewZoom(1);
                                  setHistPreviewOffset({ x: 0, y: 0 });
                                  const originalUrl = (img as any).originalUrl;
                                  const previewImg = originalUrl ? { ...img, url: originalUrl } : img;
                                  setHistFullPreview(previewImg);
                                }
                              }}
                            >
                              <div className="w-7 h-7 rounded-full bg-white/90 flex items-center justify-center shadow-md hover:bg-white transition-colors cursor-pointer">
                                <svg className="w-3.5 h-3.5 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      {entry.results.length > 6 && (
                        <div
                          className="rounded-lg bg-slate-100 flex items-center justify-center text-[10px] text-slate-400 font-medium cursor-pointer hover:bg-slate-200 transition"
                          style={{ aspectRatio: "1/1" }}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!historyBatchMode) {
                              setHistPreviewZoom(1);
                              setHistPreviewOffset({ x: 0, y: 0 });
                              const img = entry.results[6];
                              const originalUrl = (img as any).originalUrl;
                              const previewImg = originalUrl ? { ...img, url: originalUrl } : img;
                              setHistFullPreview(previewImg);
                            }
                          }}
                        >+{entry.results.length - 6}</div>
                      )}
                    </div>
                  )}

                  {/* 进行中/失败状态 */}
                  {entry.results.length === 0 && (
                    <div className="px-2 pb-2">
                      {entry.error ? (
                        <div
                          className="rounded-lg bg-red-50/80 py-3 px-3 flex flex-col items-center justify-center gap-1.5 text-xs cursor-pointer hover:bg-red-100/80 transition-colors"
                          title="双击查看详细日志"
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            const time = new Date().toLocaleTimeString("zh-CN");
                            // 解析错误信息中的详情（如有）
                            const errorLines = (entry.error || "").split("\n");
                            const mainError = errorLines[0] || entry.error || "未知错误";
                            const httpErrorBody = errorLines.find((l) => l.startsWith("HTTP") || l.startsWith("状态码") || l.startsWith("Response"));
                            const httpStatusMatch = entry.error?.match(/状态码[：:]\s*(\d+)/);
                            const httpStatus = httpStatusMatch ? parseInt(httpStatusMatch[1]) : undefined;
                            useUiStore.getState().setLogEntries((prev) => [...prev.slice(-99), {
                              time,
                              error: mainError,
                              request: `提示词：${entry.prompt || "(无)"}\n模型：${entry.model || "(无)"}\n分辨率：${entry.width}×${entry.height}\n数量：${entry.batchSize}`,
                              httpErrorBody: httpErrorBody,
                              httpStatus,
                            }]);
                            useUiStore.getState().setShowDetailedLog(true);
                          }}
                        >
                          <div className="flex items-center gap-1.5 text-red-500">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            <span className="font-medium">生图失败</span>
                          </div>
                          <div className="text-[10px] text-red-600/80 text-center line-clamp-2 leading-tight">{entry.error}</div>
                        </div>
                      ) : (
                        <div className="rounded-lg bg-slate-100 py-3 flex items-center justify-center gap-2 text-xs text-slate-500">
                          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          <span>生图中...</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 一键应用按钮 */}
                  {!historyBatchMode && (
                    <div className="px-2 pb-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          try {
                            if (!entry.results || entry.results.length === 0) {
                              setError("此记录没有可用的图片数据");
                              return;
                            }
                            const restoredResults = entry.results.map(img => {
                              const originalUrl = (img as any).originalUrl;
                              if (originalUrl) return { ...img, url: originalUrl };
                              return img;
                            });
                            const validResults = restoredResults.filter(img => img && img.url);
                            if (validResults.length === 0) {
                              setError("此记录的图片数据已失效");
                              return;
                            }
                            setPrompt(entry.prompt || "");
                            setNegativePrompt(entry.negativePrompt || "");
                            setModel(entry.model || "");
                            setBatchSize(entry.batchSize || 1);
                            setResults(validResults);
                            setResultActiveIdx(0);
                          } catch (err) {
                            setError("应用记录失败: " + (err instanceof Error ? err.message : String(err)));
                          }
                        }}
                        className="w-full py-1.5 rounded-lg bg-gradient-to-r from-primary-50 to-purple-50 text-primary-600 text-[10px] font-medium hover:from-primary-100 hover:to-purple-100 transition border border-primary-100/60"
                      >
                        ⚡ 一键应用此记录
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* ── 右下角拉伸手柄 ── */}
        {!isFullscreen && (
          <div
            className="absolute bottom-0 right-0 w-5 h-5 cursor-se-resize flex items-end justify-end p-1"
            style={{ borderBottomRightRadius: "1rem" }}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsResizing(true);
              resizeStart.current = {
                mouseX: e.clientX,
                mouseY: e.clientY,
                startW: size.width,
                startH: size.height,
              };
            }}
          >
            <svg className="w-3 h-3 text-white/40" viewBox="0 0 10 10" fill="currentColor">
              <path d="M9 1L1 9M9 4L4 9M9 7L7 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
            </svg>
          </div>
        )}
      </div>

      {/* 全屏预览 */}
      {historyFullPreview && (
        <HistoryPanelFullPreview
          image={historyFullPreview}
          zoom={histPreviewZoom}
          offset={histPreviewOffset}
          setZoom={setHistPreviewZoom}
          setOffset={setHistPreviewOffset}
          onClose={() => setHistoryFullPreview(null)}
        />
      )}
    </>
  );
};

// ── 历史面板内嵌全屏预览（与 HistoryFullPreview 完全一致）─────────────────────
interface PreviewImage {
  id?: string;
  url: string;
  [key: string]: unknown;
}

interface HistoryPanelFullPreviewProps {
  image: PreviewImage;
  zoom: number;
  offset: { x: number; y: number };
  setZoom: (v: number) => void;
  setOffset: (v: { x: number; y: number }) => void;
  onClose: () => void;
}

const HistoryPanelFullPreview: React.FC<HistoryPanelFullPreviewProps> = ({
  image,
  zoom,
  offset,
  setZoom,
  setOffset,
  onClose,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [localZoom, setLocalZoom] = useState(zoom);
  const dragRef = useRef<{ mouseX: number; mouseY: number; startX: number; startY: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLocalZoom(zoom);
  }, [zoom]);

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      setOffset({
        x: dragRef.current.startX + e.clientX - dragRef.current.mouseX,
        y: dragRef.current.startY + e.clientY - dragRef.current.mouseY,
      });
    };
    const onUp = () => setIsDragging(false);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [isDragging, setOffset]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    const next = Math.max(0.5, Math.min(5, localZoom + delta));
    setLocalZoom(next);
    setZoom(next);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* 关闭按钮 */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
      </button>

      {/* 缩放控制 */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex items-center gap-3 bg-black/50 rounded-full px-4 py-2">
        <button
          onClick={() => { const next = Math.max(0.5, localZoom - 0.25); setLocalZoom(next); setZoom(next); }}
          className="text-white/70 hover:text-white transition-colors text-xl leading-none w-6 h-6 flex items-center justify-center"
        >−</button>
        <span className="text-white text-xs font-mono w-12 text-center">{Math.round(localZoom * 100)}%</span>
        <button
          onClick={() => { const next = Math.min(5, localZoom + 0.25); setLocalZoom(next); setZoom(next); }}
          className="text-white/70 hover:text-white transition-colors text-xl leading-none w-6 h-6 flex items-center justify-center"
        >+</button>
        <button
          onClick={() => { setLocalZoom(1); setZoom(1); setOffset({ x: 0, y: 0 }); }}
          className="text-white/70 hover:text-white transition-colors text-[10px] px-2 py-0.5 rounded hover:bg-white/10"
        >重置</button>
        <button
          onClick={() => {
            const link = document.createElement("a");
            link.href = image.url;
            link.download = `history-${Date.now()}.png`;
            link.target = "_blank";
            link.click();
          }}
          className="text-white/70 hover:text-white transition-colors text-[10px] px-2 py-0.5 rounded hover:bg-white/10"
        >下载</button>
      </div>

      {/* 可拖动图片 */}
      <div
        ref={containerRef}
        className="relative cursor-grab active:cursor-grabbing select-none"
        style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${localZoom})`, transformOrigin: "center center" }}
        onMouseDown={(e) => {
          e.preventDefault();
          setIsDragging(true);
          dragRef.current = { mouseX: e.clientX, mouseY: e.clientY, startX: offset.x, startY: offset.y };
        }}
        onWheel={handleWheel}
      >
        <img
          src={image.url}
          alt=""
          className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg shadow-2xl pointer-events-none"
          draggable={false}
          onError={(e) => { e.currentTarget.src = image.url; }}
        />
      </div>
    </div>
  );
};

export default DraggableHistoryPanel;
