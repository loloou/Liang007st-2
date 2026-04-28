// ─────────────────────────────────────────────────────────────────────────────
//  useTripleClick.ts — 三击检测 Hook
//
//  用于提示词预览等需要区分单击/双击/三击的场景
//  用法：
//    const handleClick = useTripleClick({
//      onSingleClick: () => { /* do something */ },
//      onDoubleClick: () => { /* do something */ },
//      onTripleClick: () => { /* do something */ },
//      delay: 400, // 双击/三击判定时间窗口（ms）
//    });
// ─────────────────────────────────────────────────────────────────────────────

import { useRef, useCallback } from "react";

interface UseTripleClickOptions {
  onSingleClick?: () => void;
  onDoubleClick?: () => void;
  onTripleClick?: () => void;
  delay?: number;
}

export function useTripleClick(options: UseTripleClickOptions) {
  const { onSingleClick, onDoubleClick, onTripleClick, delay = 400 } = options;

  const clickCount = useRef(0);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleClick = useCallback(() => {
    clickCount.current += 1;

    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
    }

    if (clickCount.current === 3) {
      // 三击触发
      clickCount.current = 0;
      onTripleClick?.();
      return;
    }

    // 在延迟后仍未达到三击，判定为单击或双击
    clickTimer.current = setTimeout(() => {
      if (clickCount.current === 1) {
        onSingleClick?.();
      } else if (clickCount.current === 2) {
        onDoubleClick?.();
      }
      clickCount.current = 0;
      clickTimer.current = null;
    }, delay);
  }, [onSingleClick, onDoubleClick, onTripleClick, delay]);

  return handleClick;
}
