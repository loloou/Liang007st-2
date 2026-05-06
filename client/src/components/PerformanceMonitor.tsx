import React, { useState, useRef, useEffect } from "react";

interface PerformanceData {
  fps: number;
  renderTime: number;
  memory: number | null;
  gpuUsage: number | null;
  networkLatency: number | null;
}

interface PerformanceMonitorProps {
  open: boolean;
  performanceData: PerformanceData;
  buttonRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}

const PerformanceMonitor: React.FC<PerformanceMonitorProps> = ({
  open,
  performanceData,
  buttonRef,
  onClose,
}) => {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef<{ mouseX: number; mouseY: number; offsetX: number; offsetY: number } | null>(null);

  // 拖动 effect
  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => {
      if (!dragStart.current) return;
      const dx = e.clientX - dragStart.current.mouseX;
      const dy = e.clientY - dragStart.current.mouseY;
      setOffset({ x: dragStart.current.offsetX + dx, y: dragStart.current.offsetY + dy });
    };
    const onUp = () => setIsDragging(false);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isDragging]);

  if (!open || !buttonRef.current) return null;

  const rect = buttonRef.current.getBoundingClientRect();

  return (
    <div
      className="fixed glass-popup rounded-xl w-72 overflow-hidden z-[9999] popup-enter"
      style={{
        right: window.innerWidth - rect.right - offset.x,
        top: rect.bottom + 8 + offset.y,
      }}
    >
      {/* 标题栏 */}
      <div
        className="h-11 bg-gradient-to-r from-cyan-500 to-blue-500 flex items-center justify-between px-4 cursor-grab active:cursor-grabbing select-none"
        onMouseDown={(e) => {
          dragStart.current = { mouseX: e.clientX, mouseY: e.clientY, offsetX: offset.x, offsetY: offset.y };
          setIsDragging(true);
        }}
      >
        <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5 opacity-80" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          性能监控
          <span className="text-white/50 text-[10px] font-normal ml-1">拖动移动</span>
        </h3>
        <button
          className="text-white/80 hover:text-white text-lg leading-none"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={onClose}
        >×</button>
      </div>

      {/* 性能指标 */}
      <div className="p-3 space-y-2.5">
        <div className="grid grid-cols-2 gap-2">
          {([
            { label: "帧率 FPS", value: performanceData.fps, unit: "", color: "text-emerald-400", bg: "bg-emerald-500/70 border-emerald-500/60", bar: performanceData.fps / 60, barColor: "bg-emerald-500/100", available: true },
            { label: "渲染时间", value: performanceData.renderTime, unit: "ms", color: "text-blue-600", bg: "bg-blue-500/70 border-blue-500/60", bar: 1 - performanceData.renderTime / 30, barColor: "bg-blue-500", available: true },
            { label: "内存占用", value: performanceData.memory ?? 0, unit: "%", color: "text-purple-600", bg: "bg-purple-50/70 border-purple-100/60", bar: (performanceData.memory ?? 0) / 100, barColor: "bg-purple-500", available: performanceData.memory !== null },
            { label: "GPU使用", value: performanceData.gpuUsage ?? 0, unit: "%", color: "text-orange-600", bg: "bg-orange-50/70 border-orange-100/60", bar: (performanceData.gpuUsage ?? 0) / 100, barColor: "bg-orange-500", available: performanceData.gpuUsage !== null },
          ] as { label: string; value: number; unit: string; color: string; bg: string; bar: number; barColor: string; available: boolean }[]).map(({ label, value, unit, color, bg, bar, barColor, available }) => (
            <div key={label} className={`rounded-lg p-2 border ${bg}`}>
              <div className="text-[10px] text-slate-500 mb-0.5">{label}</div>
              <div className={`text-lg font-bold ${color}`}>{available ? `${value}${unit}` : "N/A"}</div>
              <div className="mt-1 h-1 bg-white/50 rounded-full overflow-hidden">
                <div
                  className={`h-full ${barColor} rounded-full transition-all duration-700`}
                  style={{ width: available ? `${Math.min(100, Math.max(0, bar * 100))}%` : "0%" }}
                />
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between text-xs bg-white/40 rounded-lg px-2.5 py-1.5 border border-white/40">
          <span className="text-slate-500">网络延迟</span>
          <div className="flex items-center gap-1.5">
            {performanceData.networkLatency !== null ? (
              <>
                <span className="font-mono font-medium text-slate-300">{performanceData.networkLatency}ms</span>
                <div className={`w-2 h-2 rounded-full ${
                  performanceData.networkLatency < 50 ? "bg-emerald-500/100" :
                  performanceData.networkLatency < 100 ? "bg-yellow-500" : "bg-red-500"
                }`} />
              </>
            ) : (
              <span className="text-slate-400">N/A</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(PerformanceMonitor);
