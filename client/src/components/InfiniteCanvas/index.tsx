/**
 * InfiniteCanvas — 无限画布模块入口
 *
 * 本模块是无限画布的对外接口层，职责：
 *   1. 从 generationStore 读取主界面的生图参数（模型/比例/档位/数量）
 *   2. 将参数注入画布实现
 *   3. 暴露统一的 CanvasAdapter 接口给主界面
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  替换画布实现只需 2 步：                                          │
 * │  1. 在 adapters/ 下创建新实现                                     │
 * │  2. 修改下面 ADAPTER_COMPONENT 的 import                         │
 * │  接口契约 (types.ts) 和参数读取方式不变                             │
 * └─────────────────────────────────────────────────────────────────┘
 */
import React from "react";
import type { InfiniteCanvasProps } from "./types";

// ── 画布实现选择 ─────────────────────────────────────────────────────────────
// 切换实现时，只需修改下面的 import 路径
// ─────────────────────────────────────────────────────────────────────────────
import ADAPTER_COMPONENT from "../Whiteboard/WhiteboardCanvas";

// ── 组件 ─────────────────────────────────────────────────────────────────────

const InfiniteCanvas: React.FC<InfiniteCanvasProps> = ({ onClose }) => {
  return <ADAPTER_COMPONENT onClose={onClose} />;
};

export default InfiniteCanvas;

// ── 导出接口和工具 ───────────────────────────────────────────────────────────
export type { CanvasGenerationParams, CanvasAdapter, InfiniteCanvasProps } from "./types";
export { useInfiniteCanvas } from "./useInfiniteCanvas";
export { useCanvasStore } from "../Whiteboard/store/useCanvasStore";
