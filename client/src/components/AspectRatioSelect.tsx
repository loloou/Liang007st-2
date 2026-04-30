import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { RESOLUTION_PRESETS } from "../utils/resolutionPresets";
import type { ResolutionPresetId } from "../utils/resolutionPresets";

/** 每个比例对应的精确图标 rect（viewBox="0 0 20 20"，居中显示实际比例）
 *  规则：以短边撑满，长边按比例延伸（可能超出 viewBox 即为正确比例视觉效果） */
function RatioRect({ ratio }: { ratio: number }) {
  const short = 16; // 短边固定 16px
  let w: number, h: number;
  if (ratio >= 1) {
    h = short;
    w = Math.round(h * ratio);
  } else {
    w = short;
    h = Math.round(w / ratio);
  }
  const x = Math.round((20 - w) / 2);
  const y = Math.round((20 - h) / 2);
  return <rect x={x} y={y} width={w} height={h} rx="1.5" fill="currentColor" opacity="0.7" />;
}

function ShapeIcon({ presetId, className = "" }: { presetId: ResolutionPresetId; className?: string }) {
  if (presetId === "original" || presetId === "1:1") {
    return (
      <svg width="16" height="16" viewBox="0 0 20 20" className={className}>
        <rect x="2" y="2" width="16" height="16" rx="1.5" fill="currentColor" opacity="0.7" />
      </svg>
    );
  }
  const ratioMap: Record<Exclude<ResolutionPresetId, "original" | "1:1">, number> = {
    "16:9": 16 / 9,
    "9:16": 9 / 16,
    "4:3":  4 / 3,
    "3:4":  3 / 4,
    "21:9": 21 / 9,
    "3:2":  3 / 2,
    "2:3":  2 / 3,
    "5:4":  5 / 4,
    "4:5":  4 / 5,
  };
  const ratio = ratioMap[presetId as keyof typeof ratioMap] ?? 1;
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" className={className}>
      <RatioRect ratio={ratio} />
    </svg>
  );
}

interface DropdownRect {
  top: number;
  left: number;
  width: number;
}

export interface AspectRatioSelectProps {
  value: ResolutionPresetId;
  onChange: (id: ResolutionPresetId) => void;
}

export default function AspectRatioSelect({ value, onChange }: AspectRatioSelectProps) {
  const [open, setOpen] = useState(false);
  const [dropdownRect, setDropdownRect] = useState<DropdownRect | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const selected = RESOLUTION_PRESETS.find((p) => p.id === value);

  // 点击触发器：先计算位置，再打开
  const handleTriggerClick = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setDropdownRect({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    setOpen((v) => !v);
  }, []);

  // 点击外部关闭：通过 data-dropdown 属性识别下拉容器
  useEffect(() => {
    if (!open) return;
    const DROPDOWN_ATTR = "data-aspect-dropdown";
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // 点击在下拉列表内（包括列表项）或触发器内 → 不关闭
      if (
        target.closest(`[${DROPDOWN_ATTR}]`) ||
        (triggerRef.current?.contains(target))
      ) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") setOpen(false);
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleTriggerClick();
    }
  };

  return (
    <div className="relative" onKeyDown={handleKeyDown}>
      {/* 触发按钮 */}
      <div
        ref={triggerRef}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        tabIndex={0}
        onClick={handleTriggerClick}
        className="flex items-center gap-1 border border-slate-200 rounded-md px-1.5 py-1.5 text-[11px] bg-slate-50 focus:outline-none focus:ring-1 focus:ring-primary-300 cursor-pointer select-none w-full whitespace-nowrap overflow-hidden"
      >
        {selected && <ShapeIcon presetId={value} className="flex-shrink-0 text-slate-500" />}
        <span className="flex-1 overflow-hidden text-ellipsis">{selected?.label ?? value}</span>
        <svg className={`w-3 h-3 text-slate-400 transition-transform flex-shrink-0 ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* 下拉列表：渲染到 body，position:fixed 相对于视口定位，彻底脱离所有 overflow 裁剪 */}
      {open && dropdownRect && createPortal(
        <ul
          role="listbox"
          data-aspect-dropdown
          style={{
            position: "fixed",
            top: dropdownRect.top,
            left: dropdownRect.left,
            width: dropdownRect.width,
            zIndex: 99999,
          }}
          className="bg-white border border-slate-200 rounded-lg shadow-xl overflow-y-auto max-h-60 py-0.5 animate-slide-up"
        >
          {RESOLUTION_PRESETS.map((p) => (
            <li
              key={p.id}
              role="option"
              aria-selected={p.id === value}
              onClick={() => { onChange(p.id); setOpen(false); }}
              className={`flex items-center gap-1.5 px-2 py-1.5 text-[11px] cursor-pointer rounded transition min-h-[28px] ${
                p.id === value
                  ? "bg-primary-50 text-primary-700 font-medium"
                  : "text-slate-700 hover:bg-slate-50"
              }`}
            >
              <ShapeIcon presetId={p.id} className="flex-shrink-0 text-slate-500" />
              <span className="flex-1">{p.label}</span>
            </li>
          ))}
        </ul>,
        document.body
      )}
    </div>
  );
}
