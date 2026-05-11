/**
 * ReactFlow 画布适配器
 *
 * 将 Whiteboard 模块包装为 InfiniteCanvas 接口。
 * 这是从原 Whiteboard 模块到新 InfiniteCanvas 架构的桥接层。
 */
export { default as ReactFlowCanvas } from "../../../Whiteboard/WhiteboardCanvas";
export { useCanvasStore } from "../../../Whiteboard/store/useCanvasStore";
