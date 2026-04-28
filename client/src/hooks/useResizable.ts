// ─────────────────────────────────────────────────────────────────────────────
//  useResizable.ts — 可拖拽调整尺寸的自定义 Hook
//
//  用法：
//    const { size, startResize, isResizing } = useResizable({
//      initialSize: { w: 640, h: 520 },
//      minSize: { w: 400, h: 300 },
//      maxSize: { w: window.innerWidth * 0.95, h: window.innerHeight * 0.95 },
//    });
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useRef, useCallback } from "react";

interface Size {
  w: number;
  h: number;
}

interface UseResizableOptions {
  initialSize: Size;
  minSize?: Partial<Size>;
  maxSize?: Partial<Size>;
  onResize?: (size: Size) => void;
}

export function useResizable(options: UseResizableOptions) {
  const { initialSize, minSize = {}, maxSize = {}, onResize } = options;

  const [size, setSize] = useState<Size>(initialSize);
  const isResizing = useRef(false);
  const resizeStart = useRef<{ mouseX: number; mouseY: number; w: number; h: number }>({
    mouseX: 0,
    mouseY: 0,
    w: initialSize.w,
    h: initialSize.h,
  });

  const startResize = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      isResizing.current = true;
      resizeStart.current = { mouseX: e.clientX, mouseY: e.clientY, w: size.w, h: size.h };

      const onMove = (ev: MouseEvent) => {
        if (!isResizing.current) return;
        const dx = ev.clientX - resizeStart.current.mouseX;
        const dy = ev.clientY - resizeStart.current.mouseY;
        const rawW = resizeStart.current.w + dx;
        const rawH = resizeStart.current.h + dy;
        const newSize: Size = {
          w: Math.min(
            maxSize.w ?? Infinity,
            Math.max(minSize.w ?? 100, rawW)
          ),
          h: Math.min(
            maxSize.h ?? Infinity,
            Math.max(minSize.h ?? 100, rawH)
          ),
        };
        setSize(newSize);
        onResize?.(newSize);
      };

      const onUp = () => {
        isResizing.current = false;
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
      document.body.style.cursor = "nwse-resize";
      document.body.style.userSelect = "none";
    },
    [size, minSize, maxSize, onResize]
  );

  return { size, setSize, startResize, isResizing };
}

// ── 可拖拽移动的 Hook（用于浮窗/弹窗拖动定位）────────────────────────────────

interface UseDraggableOptions {
  initialOffset?: { x: number; y: number };
  onDragStart?: () => void;
  onDragEnd?: (offset: { x: number; y: number }) => void;
}

export function useDraggable(options: UseDraggableOptions = {}) {
  const { initialOffset = { x: 0, y: 0 }, onDragStart, onDragEnd } = options;

  const [offset, setOffset] = useState(initialOffset);
  const isDragging = useRef(false);
  const dragStart = useRef<{ mouseX: number; mouseY: number; offsetX: number; offsetY: number } | null>(null);

  const startDrag = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      isDragging.current = true;
      dragStart.current = {
        mouseX: e.clientX,
        mouseY: e.clientY,
        offsetX: offset.x,
        offsetY: offset.y,
      };
      onDragStart?.();
    },
    [offset, onDragStart]
  );

  // 全局 mousemove/mouseup（由调用方在 useEffect 中注册）
  const onMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging.current || !dragStart.current) return;
      const dx = e.clientX - dragStart.current.mouseX;
      const dy = e.clientY - dragStart.current.mouseY;
      setOffset({
        x: dragStart.current.offsetX + dx,
        y: dragStart.current.offsetY + dy,
      });
    },
    []
  );

  const onMouseUp = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;
    const current = dragStart.current;
    dragStart.current = null;
    onDragEnd?.(offset);
    onDragStart?.(); // reset
  }, [offset, onDragStart, onDragEnd]);

  return { offset, setOffset, startDrag, isDragging, onMouseMove, onMouseUp };
}
