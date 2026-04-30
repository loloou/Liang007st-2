import { useState, useRef, useEffect } from "react";
import { RESOLUTION_PRESETS } from "../utils/resolutionPresets";
import type { ResolutionPresetId } from "../utils/resolutionPresets";

interface AspectRatioSelectProps {
  value: ResolutionPresetId;
  onChange: (id: ResolutionPresetId) => void;
  isGemini: boolean;
}

/** 每个比例对应的精确图标 rect（viewBox="0 0 20 20"，padding=2，最大矩形 16x16）
 *  宽高比与实际比例严格对应，在 UI 小尺寸下也能清晰区分
 */
function RatioRect({ ratio, className = "" }: { ratio: number; className?: string }) {
  // ratio = width / height
  const pad = 2;
  const max = 16;
  let w: number, h: number;
  if (ratio >= 1) {
    // 横向：高度撑满 pad*2 到 max，宽度按比例扩展（不超 max）
    h = max;
    w = Math.min(max, Math.round(h * ratio));
  } else {
    // 纵向：宽度撑满 pad*2 到 max，高度按比例扩展（不超 max）
    w = max;
    h = Math.min(max, Math.round(w / ratio));
  }
  const x = Math.round((20 - w) / 2);
  const y = Math.round((20 - h) / 2);
  return <rect x={x} y={y} width={w} height={h} rx="1.5" fill="currentColor" opacity="0.7" />;
}

// 根据预设 id 获取对应图标形状
function ShapeIcon({ presetId, className = "" }: { presetId: ResolutionPresetId; className?: string }) {
  // original / 1:1 → 正方形
  if (presetId === "original" || presetId === "1:1") {
    return (
      <svg width="16" height="16" viewBox="0 0 20 20" className={className}>
        <rect x="2" y="2" width="16" height="16" rx="1.5" fill="currentColor" opacity="0.7" />
      </svg>
    );
  }
  const ratioMap: Record<Exclude<ResolutionPresetId, "original">, number> = {
    "1:1": 1,
    "16:9": 16 / 9,
    "9:16": 9 / 16,
    "4:3": 4 / 3,
    "3:4": 3 / 4,
    "3:2": 3 / 2,
    "2:3": 2 / 3,
    "5:4": 5 / 4,
    "4:5": 4 / 5,
    "21:9": 21 / 9,
    "9:21": 9 / 21,
  };
  const ratio = ratioMap[presetId] ?? 1;
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" className={className}>
      <RatioRect ratio={ratio} />
    </svg>
  );
}

const APPROX_RATIOS = new Set(["2:3", "3:2", "21:9", "9:21"]);

export default function AspectRatioSelect({ value, onChange, isGemini }: AspectRatioSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const selected = RESOLUTION_PRESETS.find((p) => p.id === value);

  // 计算下拉列表的 fixed 定位（基于触发按钮的视口坐标，避免父容器 overflow 遮挡）
  const getDropdownStyle = (): React.CSSProperties => {
    if (!triggerRef.current) return { top: 0, left: 0 };
    const rect = triggerRef.current.getBoundingClientRect();
    return {
      position: "fixed" as const,
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
    };
  };

  // 点击外部关闭
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // 键盘支持
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") setOpen(false);
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen((v) => !v);
    }
  };

  const hasWarning = isGemini && APPROX_RATIOS.has(value);

  return (
    <div ref={ref} className="relative" onKeyDown={handleKeyDown}>
      {/* 触发按钮（模拟原生 select） */}
      <div
        ref={triggerRef}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1 border rounded-md px-1.5 py-1.5 text-[11px] bg-slate-50 focus:outline-none focus:ring-1 focus:ring-primary-300 cursor-pointer select-none w-full whitespace-nowrap overflow-hidden ${
          hasWarning ? "border-amber-300" : "border-slate-200"
        }`}
      >
        {selected && <ShapeIcon presetId={value} className="flex-shrink-0 text-slate-500" />}
        <span className="flex-1 overflow-hidden text-ellipsis">{selected?.label ?? value}</span>
        {/* 下拉箭头 */}
        <svg className={`w-3 h-3 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* 下拉列表（fixed 定位，不受父容器 overflow 遮挡） */}
      {open && (
        <ul
          role="listbox"
          style={getDropdownStyle()}
          className="z-[9999] bg-white border border-slate-200 rounded-lg shadow-lg overflow-auto max-h-60 py-0.5"
        >
          {RESOLUTION_PRESETS.map((p) => (
            <li
              key={p.id}
              role="option"
              aria-selected={p.id === value}
              onClick={() => { onChange(p.id); setOpen(false); }}
              className={`flex items-center gap-1.5 px-2 py-1.5 text-[11px] cursor-pointer rounded transition ${
                p.id === value
                  ? "bg-primary-50 text-primary-700 font-medium"
                  : "text-slate-700 hover:bg-slate-50"
              }`}
            >
              <ShapeIcon presetId={p.id} className="flex-shrink-0 text-slate-500" />
              <span className="flex-1">{p.label}</span>
              {isGemini && APPROX_RATIOS.has(p.id) && (
                <span className="text-[8px] text-amber-500 font-normal">≈</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Gemini 近似警告 */}
      {hasWarning && (
        <span className="text-[9px] text-amber-500 leading-tight mt-0.5 block" title="Gemini 仅支持 1:1/3:4/4:3/9:16/16:9，将自动映射到最近比例">
          ⚠ Gemini近似
        </span>
      )}
    </div>
  );
}
