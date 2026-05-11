/**
 * InfiniteCanvas — 无限画布模块入口
 *
 * 本模块是无限画布的对外接口层，职责：
 *   1. 从 generationStore 读取主界面的生图参数（模型/比例/档位/数量）
 *   2. 将参数注入画布实现
 *   3. 暴露统一的 CanvasAdapter 接口给主界面
 *
 * 画布实现层（当前为 React Flow）位于 ../Whiteboard/，
 * 替换画布实现时只需修改本文件的 import 指向新实现即可。
 */
import React from "react";
import type { InfiniteCanvasProps } from "./types";
import WhiteboardCanvas from "../Whiteboard/WhiteboardCanvas";

// ── 画布实现适配 ─────────────────────────────────────────────────────────────
// 当前实现：React Flow（../Whiteboard/）
// 替换为其他实现时，只需修改下面的 import 和组件引用
// ─────────────────────────────────────────────────────────────────────────────

const InfiniteCanvas: React.FC<InfiniteCanvasProps> = ({ onClose }) => {
  return <WhiteboardCanvas onClose={onClose} />;
};

export default InfiniteCanvas;

// ── 导出类型和子模块 ─────────────────────────────────────────────────────────
export type { CanvasGenerationParams, CanvasAdapter, InfiniteCanvasProps } from "./types";
export { useCanvasStore } from "../Whiteboard/store/useCanvasStore";
