import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ReactFlow, Background, Controls, MiniMap, BackgroundVariant,
  ReactFlowProvider, useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useCanvasStore } from "./store/useCanvasStore";
import { getApiConfig } from "../../api/settings";
import { useGenerationStore } from "../../store/generationStore";
import ImageNode from "./nodes/ImageNode";
import TextNode from "./nodes/TextNode";
import GenerateNode from "./nodes/GenerateNode";
import FloatingToolbar from "./components/FloatingToolbar";
import PromptBar from "./components/PromptBar";
import Lightbox from "./components/Lightbox";
import ContextMenu from "./components/ContextMenu";
import ConversationPanel from "./components/ConversationPanel";
import ShortcutsHelp from "./components/ShortcutsHelp";
import QuickConnectMenu from "./components/QuickConnectMenu";
import CanvasEdge from "./components/CanvasEdge";

interface Props {
  onClose: () => void;
}

const nodeTypes = {
  imageNode: ImageNode,
  textNode: TextNode,
  generateNode: GenerateNode,
};

const edgeTypes = {
  canvasEdge: CanvasEdge,
};

const CanvasInner: React.FC<Props> = ({ onClose }) => {
  const {
    nodes, edges, onNodesChange, onEdgesChange, onConnect,
    selectedNodeId, removeNode, loadFromStorage,
    contextMenu, setContextMenu, addNode,
    chatPanelOpen, setChatPanelOpen,
    canUndo, canRedo, undo, redo, runAllGenerateNodes, autoLayout,
  } = useCanvasStore();

  const isGenerating = useCanvasStore((s) => s.nodes.some(
    (n) => (n.data as Record<string, unknown>)?.status === "running"
  ));
  const [toolbarOpen, setToolbarOpen] = useState(true);
  const [showModelWarning, setShowModelWarning] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [quickConnect, setQuickConnect] = useState<{ x: number; y: number; flowX: number; flowY: number; sourceNodeId: string } | null>(null);
  const [dblClickMenu, setDblClickMenu] = useState<{ x: number; y: number; flowX: number; flowY: number } | null>(null);
  const connectingSourceRef = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rf = useReactFlow();

  useEffect(() => {
    loadFromStorage();
    // 检查模型配置
    try {
      const cfg = getApiConfig();
      const models = cfg.imageModels.map((m) => m.modelId).filter(Boolean);
      if (models.length === 0) {
        setShowModelWarning(true);
      } else {
        const currentModel = useGenerationStore.getState().model;
        if (!currentModel || !models.includes(currentModel)) {
          useGenerationStore.setState({ model: models[0] });
        }
      }
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "Escape") {
        if (contextMenu) { setContextMenu(null); return; }
        if (dblClickMenu) { setDblClickMenu(null); return; }
        if (quickConnect) { setQuickConnect(null); return; }
        if (useCanvasStore.getState().lightboxUrl) { useCanvasStore.getState().setLightboxUrl(null); return; }
        onClose();
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedNodeId) {
        e.preventDefault();
        removeNode(selectedNodeId);
      }
      // Ctrl+A 全选节点
      if ((e.ctrlKey || e.metaKey) && e.key === "a") {
        e.preventDefault();
        useCanvasStore.setState((s) => ({
          nodes: s.nodes.map((n) => ({ ...n, selected: true })),
        }));
      }
      // Ctrl+L 自动布局
      if ((e.ctrlKey || e.metaKey) && e.key === "l") {
        e.preventDefault();
        autoLayout();
        setTimeout(() => rf.fitView({ padding: 0.2, duration: 400 }), 100);
      }
      // ? 打开快捷键帮助
      if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        setShowShortcuts(true);
      }
      // Ctrl+Enter 执行选中的生成节点
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && selectedNodeId) {
        e.preventDefault();
        const node = useCanvasStore.getState().nodes.find((n) => n.id === selectedNodeId);
        if (node && (node.data as Record<string, unknown>)?.kind === "generate") {
          useCanvasStore.getState().runGenerate(selectedNodeId);
        }
      }
      // Ctrl+Z 撤销
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      // Ctrl+Y / Ctrl+Shift+Z 重做
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault();
        redo();
      }
      // Ctrl/Cmd + 0 适应视图
      if ((e.ctrlKey || e.metaKey) && e.key === "0") {
        e.preventDefault();
        rf.fitView({ padding: 0.2, duration: 300 });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedNodeId, removeNode, onClose, contextMenu, setContextMenu, rf, autoLayout, dblClickMenu, quickConnect, redo, undo]);

  const handleNodeContextMenu = useCallback((event: React.MouseEvent, node: { id: string }) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ x: event.clientX, y: event.clientY, nodeId: node.id });
  }, [setContextMenu]);

  const handlePaneClick = useCallback(() => {
    setContextMenu(null);
    setQuickConnect(null);
    setDblClickMenu(null);
    useCanvasStore.getState().selectNode(null);
  }, [setContextMenu]);

  const handlePaneContextMenu = useCallback((event: React.MouseEvent | MouseEvent) => {
    event.preventDefault();
    setContextMenu(null);
    setQuickConnect(null);
  }, [setContextMenu]);

  const handlePaneDoubleClick = useCallback((event: Event) => {
    const e = event as MouseEvent;
    const target = e.target as HTMLElement;
    if (target.closest(".react-flow__node") || target.closest(".react-flow__handle") || target.closest("[data-testid]")) return;
    const flowPos = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    setDblClickMenu({ x: e.clientX, y: e.clientY, flowX: flowPos.x, flowY: flowPos.y });
  }, [rf]);

  useEffect(() => {
    const pane = containerRef.current?.querySelector(".react-flow__pane");
    if (!pane) return;
    pane.addEventListener("dblclick", handlePaneDoubleClick);
    return () => pane.removeEventListener("dblclick", handlePaneDoubleClick);
  }, [handlePaneDoubleClick]);

  const handleConnectStart = useCallback((_event: unknown, params: { nodeId?: string | null }) => {
    connectingSourceRef.current = params.nodeId || null;
  }, []);

  const handleConnectEnd = useCallback((event: MouseEvent | TouchEvent) => {
    const sourceId = connectingSourceRef.current;
    connectingSourceRef.current = null;
    if (!sourceId) return;
    const target = event.target as HTMLElement;
    if (target.closest(".react-flow__node") || target.closest(".react-flow__handle")) return;
    const clientX = "clientX" in event ? event.clientX : (event as TouchEvent).changedTouches[0]?.clientX ?? 0;
    const clientY = "clientY" in event ? event.clientY : (event as TouchEvent).changedTouches[0]?.clientY ?? 0;
    // 转换为 flow 坐标
    let flowPos = { x: clientX, y: clientY };
    try {
      flowPos = rf.screenToFlowPosition({ x: clientX, y: clientY });
    } catch { /* fallback */ }
    setQuickConnect({ x: clientX, y: clientY, flowX: flowPos.x, flowY: flowPos.y, sourceNodeId: sourceId });
  }, [rf]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith("image/"));
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      const pos = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      addNode("image", pos, { imageUrl: reader.result, label: file.name.replace(/\.[^.]+$/, "") });
    };
    reader.readAsDataURL(file);
  }, [addNode, rf]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[9999] bg-[#0a0a0f]"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeContextMenu={handleNodeContextMenu}
        onPaneClick={handlePaneClick}
        onPaneContextMenu={handlePaneContextMenu}
        onConnectStart={handleConnectStart}
        onConnectEnd={handleConnectEnd}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        zoomOnDoubleClick={false}
        defaultEdgeOptions={{
          type: "canvasEdge",
          animated: false,
          style: { stroke: "#6366f1", strokeWidth: 1.5 },
        }}
        proOptions={{ hideAttribution: true }}
        minZoom={0.15}
        maxZoom={3}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#1e293b" />
        <Controls
          className="!bg-slate-900/90 !border-white/[0.06] !shadow-2xl !rounded-xl !overflow-hidden [&>button]:!bg-transparent [&>button]:!border-white/[0.06] [&>button]:!text-slate-400 [&>button:hover]:!bg-white/[0.06] [&>button:hover]:!text-white"
          position="bottom-left"
        />
        <MiniMap
          nodeColor={(node) => {
            const kind = (node.data as Record<string, unknown>)?.kind;
            const colors: Record<string, string> = {
              image: "#6366f1", text: "#f59e0b", generate: "#a855f7",
            };
            return colors[String(kind)] || "#6366f1";
          }}
          maskColor="rgba(10, 10, 15, 0.85)"
          className="!bg-slate-900/90 !border-white/[0.06] !rounded-xl !overflow-hidden"
          style={{ width: 180, height: 120 }}
          position="bottom-right"
        />
      </ReactFlow>

      {/* 顶部右侧工具栏 */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
        {/* 撤销/重做 */}
        <div className="flex items-center bg-slate-900/90 border border-white/[0.06] backdrop-blur-xl rounded-xl overflow-hidden">
          <button
            onClick={undo}
            disabled={!canUndo()}
            className="h-10 px-3 text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition flex items-center gap-1 text-xs border-r border-white/[0.06]"
            title="撤销 (Ctrl+Z)"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a5 5 0 015 5v0a5 5 0 01-5 5H8M3 10l4-4M3 10l4 4" /></svg>
          </button>
          <button
            onClick={redo}
            disabled={!canRedo()}
            className="h-10 px-3 text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition flex items-center gap-1 text-xs"
            title="重做 (Ctrl+Y)"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10H11a5 5 0 00-5 5v0a5 5 0 005 5h5M21 10l-4-4M21 10l-4 4" /></svg>
          </button>
        </div>

        {/* 全部执行 */}
        {nodes.some((n) => (n.data as Record<string, unknown>)?.kind === "generate") && (
          <button
            onClick={() => runAllGenerateNodes()}
            className="h-10 px-3 rounded-xl border border-purple-500/20 bg-purple-500/10 backdrop-blur-xl text-purple-400 hover:bg-purple-500/20 text-xs flex items-center gap-1.5 transition font-medium"
            title="执行所有 AI 生成节点"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            全部执行
          </button>
        )}

        <button
          onClick={() => setChatPanelOpen(!chatPanelOpen)}
          className={`h-10 px-3 rounded-xl border backdrop-blur-xl text-xs flex items-center gap-1.5 transition ${
            chatPanelOpen
              ? "bg-indigo-500/15 border-indigo-500/20 text-indigo-400"
              : "bg-slate-900/90 border-white/[0.06] text-slate-400 hover:text-slate-200"
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          对话
        </button>

        <button
          onClick={() => rf.fitView({ padding: 0.2, duration: 300 })}
          className="h-10 px-3 rounded-xl border border-white/[0.06] bg-slate-900/90 backdrop-blur-xl text-slate-400 hover:text-slate-200 text-xs flex items-center gap-1.5 transition"
          title="适应视图 (Ctrl+0)"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0-4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
          适应
        </button>

        {nodes.length > 1 && (
          <button
            onClick={() => { autoLayout(); setTimeout(() => rf.fitView({ padding: 0.2, duration: 400 }), 100); }}
            className="h-10 px-3 rounded-xl border border-white/[0.06] bg-slate-900/90 backdrop-blur-xl text-slate-400 hover:text-slate-200 text-xs flex items-center gap-1.5 transition"
            title="自动布局节点"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
            布局
          </button>
        )}

        <button
          onClick={async () => {
            try {
              const { toPng } = await import("html-to-image");
              const el = document.querySelector(".react-flow") as HTMLElement;
              if (!el) return;
              const dataUrl = await toPng(el, { backgroundColor: "#0a0a0f", quality: 0.95 });
              const a = document.createElement("a");
              a.href = dataUrl;
              a.download = `canvas_${Date.now()}.png`;
              document.body.appendChild(a); a.click(); document.body.removeChild(a);
            } catch {
              // html-to-image 未安装时降级提示
              alert("截图功能需要安装 html-to-image 依赖");
            }
          }}
          className="h-10 px-3 rounded-xl border border-white/[0.06] bg-slate-900/90 backdrop-blur-xl text-slate-400 hover:text-slate-200 text-xs flex items-center gap-1.5 transition"
          title="导出画布截图"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          截图
        </button>

        {!toolbarOpen && (
          <button
            onClick={() => setToolbarOpen(true)}
            className="h-10 px-3 rounded-xl border border-white/[0.06] bg-slate-900/90 backdrop-blur-xl text-slate-400 hover:text-slate-200 text-xs flex items-center gap-1.5 transition"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
            工具栏
          </button>
        )}
        <button
          onClick={onClose}
          className="h-10 px-3 rounded-xl border border-white/[0.06] bg-slate-900/90 backdrop-blur-xl text-slate-400 hover:text-slate-200 text-xs flex items-center gap-1.5 transition"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          关闭
        </button>
        <button
          onClick={() => setShowShortcuts(true)}
          className="h-10 w-10 rounded-xl border border-white/[0.06] bg-slate-900/90 backdrop-blur-xl text-slate-500 hover:text-slate-300 flex items-center justify-center transition"
          title="快捷键帮助"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        </button>
      </div>

      {/* 无模型警告 */}
      {showModelWarning && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 max-w-md">
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 backdrop-blur-xl px-4 py-3 shadow-2xl flex items-start gap-3">
            <svg className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="flex-1">
              <p className="text-xs font-medium text-amber-300">尚未配置图像模型</p>
              <p className="text-[10px] text-amber-200/70 mt-1">请关闭无限画布，进入「设置 → Image」添加并选中模型后再使用</p>
            </div>
            <button
              onClick={() => setShowModelWarning(false)}
              className="text-amber-400 hover:text-amber-300 text-xs flex-shrink-0"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {toolbarOpen && <FloatingToolbar onClose={() => setToolbarOpen(false)} />}
      <ConversationPanel />
      <PromptBar />
      <Lightbox />
      {showShortcuts && <ShortcutsHelp onClose={() => setShowShortcuts(false)} />}
      {quickConnect && (
        <QuickConnectMenu
          x={quickConnect.x}
          y={quickConnect.y}
          flowX={quickConnect.flowX}
          flowY={quickConnect.flowY}
          sourceNodeId={quickConnect.sourceNodeId}
          onClose={() => setQuickConnect(null)}
        />
      )}

      {/* 双击画布弹出添加节点菜单 */}
      {dblClickMenu && (() => {
        const menuItems = [
          {
            kind: "image" as const,
            label: "图片节点",
            desc: "上传或粘贴图片",
            color: "text-indigo-400",
            bg: "hover:bg-indigo-500/10",
            icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>,
          },
          {
            kind: "text" as const,
            label: "提示词节点",
            desc: "输入文本提示词",
            color: "text-amber-400",
            bg: "hover:bg-amber-500/10",
            icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>,
          },
          {
            kind: "generate" as const,
            label: "AI 生成节点",
            desc: "输入提示词并执行生成",
            color: "text-purple-400",
            bg: "hover:bg-purple-500/10",
            icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>,
          },
        ];
        const handleAdd = (kind: "image" | "text" | "generate") => {
          const center = rf.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
          addNode(kind, { x: center.x, y: center.y });
          setDblClickMenu(null);
        };
        // 防止菜单超出屏幕
        const mx = Math.min(dblClickMenu.x, window.innerWidth - 220);
        const my = Math.min(dblClickMenu.y, window.innerHeight - 240);
        return (
          <div
            className="fixed z-[10000] rounded-2xl border border-white/[0.08] bg-slate-900/98 backdrop-blur-xl shadow-2xl overflow-hidden"
            style={{ left: mx, top: my, width: 200 }}
          >
            <div className="px-3 py-2 border-b border-white/[0.06]">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">添加节点</span>
            </div>
            <div className="p-1.5">
              {menuItems.map((item) => (
                <button
                  key={item.kind}
                  onClick={() => handleAdd(item.kind)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition text-left ${item.bg}`}
                >
                  <span className={item.color}>{item.icon}</span>
                  <div>
                    <p className={`text-xs font-medium ${item.color}`}>{item.label}</p>
                    <p className="text-[9px] text-slate-600">{item.desc}</p>
                  </div>
                </button>
              ))}
            </div>
            <div className="px-3 py-1.5 border-t border-white/[0.06]">
              <p className="text-[8px] text-slate-700 text-center">ESC 关闭 · 点击空白处关闭</p>
            </div>
          </div>
        );
      })()}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          nodeId={contextMenu.nodeId}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* 空状态引导 */}
      {nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ pointerEvents: "none" }}>
          <div className="text-center max-w-lg" style={{ pointerEvents: "auto" }}>
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 mx-auto mb-4 flex items-center justify-center border border-white/[0.06]">
              <svg className="w-8 h-8 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-slate-200 mb-1">AI 创作画布</h2>
            <p className="text-xs text-slate-500 leading-relaxed mb-5">
              在底部输入框描述画面，按 Enter 直接生成<br />
              或选择下方模板快速开始
            </p>

            {/* 快速启动模板 */}
            <div className="grid grid-cols-3 gap-2 mb-5">
              {[
                { icon: "✨", label: "文生图", desc: "输入提示词生成图片", action: () => { const t = useCanvasStore.getState(); const c = rf.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 }); const tid = t.addNode("text", { x: c.x - 160, y: c.y }, { label: "提示词", prompt: "一只可爱的猫咪，写实风格" }); const gid = t.addNode("generate", { x: c.x + 160, y: c.y }, { label: "AI 生成" }); setTimeout(() => t.onConnect({ source: tid, target: gid, sourceHandle: null, targetHandle: null }), 50); } },
                { icon: "🖼️", label: "图生图", desc: "上传图片生成变体", action: () => { const t = useCanvasStore.getState(); const c = rf.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 }); const iid = t.addNode("image", { x: c.x - 160, y: c.y }, { label: "参考图", width: 200, height: 200 }); const gid = t.addNode("generate", { x: c.x + 160, y: c.y }, { label: "AI 生成" }); setTimeout(() => t.onConnect({ source: iid, target: gid, sourceHandle: null, targetHandle: null }), 50); } },
                { icon: "⛓️", label: "串联工作流", desc: "多步骤生成流程", action: () => { const t = useCanvasStore.getState(); const c = rf.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 }); const tid = t.addNode("text", { x: c.x - 240, y: c.y }, { label: "提示词", prompt: "赛博朋克城市夜景" }); const g1 = t.addNode("generate", { x: c.x, y: c.y }, { label: "初稿" }); const g2 = t.addNode("generate", { x: c.x + 240, y: c.y }, { label: "变体" }); setTimeout(() => { t.onConnect({ source: tid, target: g1, sourceHandle: null, targetHandle: null }); t.onConnect({ source: g1, target: g2, sourceHandle: null, targetHandle: null }); }, 50); } },
              ].map((tpl) => (
                <button
                  key={tpl.label}
                  onClick={tpl.action}
                  className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-white/[0.06] bg-slate-900/60 hover:bg-slate-800/80 hover:border-white/[0.12] transition text-center group"
                >
                  <span className="text-xl">{tpl.icon}</span>
                  <span className="text-xs font-medium text-slate-300 group-hover:text-white transition">{tpl.label}</span>
                  <span className="text-[9px] text-slate-600">{tpl.desc}</span>
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2 text-[10px] text-slate-600">
              <span className="px-2 py-1 rounded-lg border border-white/[0.04] bg-slate-900/40">拖入图片</span>
              <span className="px-2 py-1 rounded-lg border border-white/[0.04] bg-slate-900/40">右键节点</span>
              <span className="px-2 py-1 rounded-lg border border-white/[0.04] bg-slate-900/40">Ctrl+Enter 执行</span>
              <span className="px-2 py-1 rounded-lg border border-white/[0.04] bg-slate-900/40">? 快捷键</span>
            </div>
          </div>
        </div>
      )}

      {/* 底部状态栏 */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
        <div className="bg-slate-900/80 backdrop-blur-xl rounded-full px-4 py-1.5 flex items-center gap-3 text-[9px] border border-white/[0.04] shadow-lg">
          {(() => {
            const imgCount = nodes.filter((n) => (n.data as Record<string, unknown>)?.kind === "image").length;
            const genCount = nodes.filter((n) => (n.data as Record<string, unknown>)?.kind === "generate").length;
            const txtCount = nodes.filter((n) => (n.data as Record<string, unknown>)?.kind === "text").length;
            const doneCount = nodes.filter((n) => (n.data as Record<string, unknown>)?.status === "success").length;
            return (
              <>
                {imgCount > 0 && <span className="text-indigo-400">🖼 {imgCount}</span>}
                {txtCount > 0 && <span className="text-amber-400">✏️ {txtCount}</span>}
                {genCount > 0 && <span className="text-purple-400">🤖 {genCount}</span>}
                {doneCount > 0 && <span className="text-emerald-400">✓ {doneCount} 完成</span>}
                {nodes.length === 0 && <span className="text-slate-600">空画布 · 在下方输入提示词开始</span>}
                {nodes.length > 0 && (
                  <>
                    <span className="text-slate-700">·</span>
                    <span className="text-slate-600">{edges.length} 连线</span>
                    <span className="text-slate-700">·</span>
                    <span className="text-slate-600">Ctrl+Enter 执行</span>
                  </>
                )}
              </>
            );
          })()}
        </div>
      </div>

      {/* 全局生成状态指示器 */}
      {isGenerating && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30">
          <div className="rounded-full border border-purple-500/20 bg-purple-500/10 backdrop-blur-xl px-4 py-2 shadow-2xl flex items-center gap-2">
            <svg className="w-3.5 h-3.5 text-purple-400 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-xs text-purple-300 font-medium">AI 生成中...</span>
          </div>
        </div>
      )}
    </div>
  );
};

const WhiteboardCanvas: React.FC<Props> = ({ onClose }) => (
  <ReactFlowProvider>
    <CanvasInner onClose={onClose} />
  </ReactFlowProvider>
);

export default WhiteboardCanvas;
