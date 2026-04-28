// ═══════════════════════════════════════════════════════════════
// AI 图片编辑器 v3 — Fabric.js 引擎版
// 迁移自手写 Canvas → Fabric.js 画布引擎
// 支持：图层管理、对象操作、精准坐标、蒙版导出、undo/redo
// ═══════════════════════════════════════════════════════════════
import React, {
  useRef, useState, useEffect, useCallback, useMemo,
} from "react";
import { fabric } from "fabric";
import { useEditorStore } from "../../store/editorStore";
import type {
  EditorTool, PinMarker, TextAddition,
} from "../../types/editor";
import { buildEditorPayload } from "../../utils/editorPayload";

// ─── Fabric.js 类型扩展 ──────────────────────────────────────
interface FabricIText extends fabric.IText {
  _dataId?: string;
  _isEditorText?: boolean;
}

interface FabricGroup extends fabric.Group {
  _dataId?: string;
  _dataType?: "pin";
}

// ─── 工具图标 ──────────────────────────────────────────────
const TOOLS: Array<{ id: EditorTool; label: string; key: string }> = [
  { id: "brush", label: "画笔", key: "B" },
  { id: "pin",   label: "标记", key: "P" },
  { id: "text",  label: "文字", key: "T" },
  { id: "erase", label: "擦除", key: "R" },
  { id: "bg",    label: "背景", key: "G" },
  { id: "crop",  label: "裁剪", key: "C" },
  { id: "filter",label: "滤镜", key: "F" },
  { id: "outpaint", label: "扩图", key: "O" },
];

// ─── 滤镜预设 ──────────────────────────────────────────────
const FILTER_CSS: Record<string, string> = {
  original:   "none",
  cinematic:  "contrast(1.15) saturate(1.2) brightness(0.95)",
  vintage:    "sepia(0.4) contrast(1.1) brightness(1.05)",
  bw:         "grayscale(1)",
  cyberpunk:  "contrast(1.3) saturate(1.5) hue-rotate(190deg) brightness(1.05)",
  japanese:   "contrast(1.05) saturate(0.9) brightness(1.1) sepia(0.1)",
  morandi:   "contrast(0.95) saturate(0.7) brightness(1.05)",
  warm:       "sepia(0.2) saturate(1.3) brightness(1.05)",
  cool:       "saturate(0.9) brightness(0.95) hue-rotate(15deg)",
  hdr:        "contrast(1.25) saturate(1.15) brightness(1.05)",
  comic:      "contrast(1.3) saturate(1.4) brightness(1.1)",
  oil:        "contrast(1.2) saturate(1.5) brightness(0.95) sepia(0.2)",
  watercolor: "contrast(0.9) saturate(0.8) brightness(1.1)",
  noir:       "grayscale(1) contrast(1.3) brightness(0.9)",
  sunset:     "sepia(0.3) saturate(1.4) brightness(1.05) hue-rotate(-10deg)",
  forest:     "saturate(0.8) brightness(1.05) hue-rotate(40deg)",
  neon:       "contrast(1.4) saturate(1.6) brightness(1.1) hue-rotate(200deg)",
  portrait:   "contrast(1.05) saturate(0.95) brightness(1.05)",
  landscape:  "contrast(1.1) saturate(1.15) brightness(1.0)",
  vivid:      "contrast(1.15) saturate(1.5) brightness(1.0)",
  muted:      "contrast(0.95) saturate(0.6) brightness(1.05)",
  golden:     "sepia(0.25) saturate(1.3) brightness(1.1) hue-rotate(-5deg)",
  moonlight:  "grayscale(0.2) brightness(0.9) contrast(1.1) hue-rotate(180deg)",
};

// ─── 辅助函数 ──────────────────────────────────────────────
/** 将 Fabric.js 对象坐标转换为原图绝对像素坐标 */
const toImageCoords = (fc: fabric.Canvas, obj: fabric.Object, imgOrigW: number, imgOrigH: number) => {
  const imgObj = fc.getObjects().find((o) => o.data?.type === "image") as fabric.Image | undefined;
  if (!imgObj) return { x: Math.round(obj.left || 0), y: Math.round(obj.top || 0) };
  const imgLeft = imgObj.left || 0;
  const imgTop = imgObj.top || 0;
  const imgScaleX = imgObj.scaleX || 1;
  const imgScaleY = imgObj.scaleY || 1;
  // 对象相对图片的百分比 = (对象left - 图片left) / (图片原始宽 * scaleX)
  const pctX = Math.max(0, Math.min(1, ((obj.left || 0) - imgLeft) / (imgOrigW * imgScaleX)));
  const pctY = Math.max(0, Math.min(1, ((obj.top || 0) - imgTop) / (imgOrigH * imgScaleY)));
  return {
    x: Math.round(pctX * imgOrigW),
    y: Math.round(pctY * imgOrigH),
  };
};

/** 从 Fabric Path 导出为黑白 Mask base64（精确坐标映射） */
const exportMaskToBase64 = (
  fc: fabric.Canvas,
  imgOrigW: number,
  imgOrigH: number,
): string => {
  const maskPaths = fc.getObjects().filter((o) => o.data?.type === "mask") as fabric.Path[];
  if (!maskPaths.length) return "";

  const offscreen = document.createElement("canvas");
  offscreen.width = imgOrigW;
  offscreen.height = imgOrigH;
  const ctx = offscreen.getContext("2d")!;

  const imgObj = fc.getObjects().find((o) => o.data?.type === "image") as fabric.Image | undefined;
  const imgLeft = imgObj ? (imgObj.left || 0) : 0;
  const imgTop = imgObj ? (imgObj.top || 0) : 0;
  const imgScaleX = imgObj ? (imgObj.scaleX || 1) : 1;
  const imgScaleY = imgObj ? (imgObj.scaleY || 1) : 1;

  maskPaths.forEach((path) => {
    if (!path.path) return;
    // path.path 在 Fabric.js 中是 Array<Array<string | number>>，格式: [["M", x, y], ["L", x, y], ...]
    const pathData = path.path as unknown as Array<Array<string | number>>;
    ctx.save();
    // 画布坐标 → 原图坐标：平移到图片左上角，缩放到原始尺寸
    ctx.translate(-imgLeft, -imgTop);
    ctx.scale(1 / imgScaleX, 1 / imgScaleY);
    ctx.beginPath();
    pathData.forEach((seg) => {
      const cmd = seg[0] as string;
      if (cmd === "M") {
        ctx.moveTo(seg[1] as number, seg[2] as number);
      } else if (cmd === "L") {
        ctx.lineTo(seg[1] as number, seg[2] as number);
      } else if (cmd === "C") {
        ctx.bezierCurveTo(seg[1] as number, seg[2] as number, seg[3] as number, seg[4] as number, seg[5] as number, seg[6] as number);
      } else if (cmd === "Q") {
        ctx.quadraticCurveTo(seg[1] as number, seg[2] as number, seg[3] as number, seg[4] as number);
      } else if (cmd === "Z" || cmd === "z") {
        ctx.closePath();
      }
    });
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
    ctx.restore();
  });

  // 灰度化 → 黑白
  const imgData = ctx.getImageData(0, 0, imgOrigW, imgOrigH);
  for (let i = 0; i < imgData.data.length; i += 4) {
    const gray = imgData.data[i];
    const v = gray > 20 ? 255 : 0;
    imgData.data[i] = v; imgData.data[i+1] = v; imgData.data[i+2] = v;
    imgData.data[i+3] = 255;
  }
  ctx.putImageData(imgData, 0, 0);
  return offscreen.toDataURL("image/png");
};

/** 生成原图 base64（裁剪/滤镜后） */
const exportCanvasToBase64 = (fabricCanvas: fabric.Canvas): string => {
  return fabricCanvas.toDataURL({ format: "png", multiplier: 1 }) || "";
};

// ─── 主组件 ─────────────────────────────────────────────────
interface ImageEditorProps {
  imageUrl: string;
  onClose: () => void;
  onConfirm: (payload: ReturnType<typeof buildEditorPayload>) => void;
}

export const ImageEditor: React.FC<ImageEditorProps> = ({
  imageUrl, onClose, onConfirm,
}) => {
  const store = useEditorStore();
  const {
    // 状态
    activeTool, scale,
    pinStyle, pinColor, pinSize,
    brushSize, brushColor, brushEraser,
    fontFamily, fontSize, fontColor, fontWeight,
    letterSpacing, lineHeight, textOpacity, textAlign,
    textDirection, textRotation,
    textStroke, textShadow, textBgColor, textBgRadius,
    smartDetect, fillMethod,
    filter, outpaint, bgEdit,
    leftPanelOpen, rightPanelOpen,
    historyOpen, past, future,
    submitPanelOpen, advancedParams,
    maskLayers, pins, textAdditions,
    maskPromptVisible,
    advancedOpen,
    // setters
    setTool, setActiveSubTab,
    setScale, setPan, setPanning,
    pushHistory, undo, redo, toggleHistory,
    resetAll, toggleSubmitPanel, toggleAdvanced,
    setAdvancedParams,
    addPin, updatePin, removePin, setSelectedPin, clearPins,
    addText, updateText, removeText, setSelectedText, clearTexts,
    addPathToMask, clearMaskLayer,
    setMaskPrompt, setBrushSize, setBrushColor, setBrushEraser,
    setPinStyle, setPinColor, setPinSize,
    setFontFamily, setFontSize, setFontColor, setFontWeight,
    setLetterSpacing, setLineHeight, setTextOpacity, setTextAlign,
    setTextDirection, setTextRotation,
    setTextStroke, setTextShadow, setTextBgColor, setTextBgRadius,
    setSmartDetect, setFillMethod,
    setFilterPreset, setFilterAdjustments, resetFilter,
    setOutpaint, setBgEdit, setCrop,
    fitToWindow,
    toggleLeftPanel, toggleRightPanel,
    setMaskPromptVisible,
    rebuildLayers,
    setImage,
    filterPresets,
  } = store;

  // ── Refs ────────────────────────────────────────────────────
  const containerRef   = useRef<HTMLDivElement>(null);
  const fabricCanvasRef = useRef<fabric.Canvas | null>(null);
  const isDrawingRef    = useRef(false);
  const currentPathRef  = useRef<fabric.Path | null>(null);
  const historyStackRef = useRef<string[]>([]);
  const historyIdxRef  = useRef(0);
  const isRestoringRef  = useRef(false);
  // 回调函数 ref（避免 useCallback 声明顺序问题）
  const addPinMarkerRef = useRef<((fx: number, fy: number) => void) | null>(null);
  const addTextObjectRef = useRef<((fx: number, fy: number) => void) | null>(null);

  // ── 本地 UI 状态 ─────────────────────────────────────────────
  const [zoom, setZoom]       = useState(100);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [selectedPinId, setSelectedPinLocal] = useState<string | null>(null);
  const [editingPinNote, setEditingPinNote] = useState<string | null>(null);
  const [editingPinNoteText, setEditingPinNoteText] = useState("");
  const [activeBgTab, setActiveBgTab]       = useState("remove");
  const [bgPrompt, setBgPrompt]             = useState("");
  const [bgColor, setBgColor]               = useState("#ffffff");
  const [bgBlur, setBgBlur]                = useState(10);
  const [outpaintDirs, setOutpaintDirs]    = useState<("top"|"bottom"|"left"|"right")[]>([]);
  const [outpaintScale, setOutpaintScale]   = useState(1.5);
  const [outpaintPrompt, setOutpaintPrompt] = useState("");
  const [cropRatio, setCropRatio]          = useState<string>("free");
  const [imgW, setImgW] = useState(1024);
  const [imgH, setImgH] = useState(1024);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [filterStrength, setFilterStrength] = useState(100);
  const [adjValues, setAdjValues] = useState({
    brightness: 0, contrast: 0, saturation: 0,
    warmth: 0, tint: 0, highlights: 0, shadows: 0,
    clarity: 0, grain: 0, vignette: 0, fade: 0,
  });
  const [submitPrompt, setSubmitPrompt] = useState("");
  const [advancedPrompt, setAdvancedPrompt] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  // ── 平移状态 ─────────────────────────────────────────────────
  const [isPanning, setIsPanning] = useState(false);
  const lastPanPoint = useRef<{ x: number; y: number } | null>(null);
  const spaceDown = useRef(false);

  // ── 稳定 ref 用于 Fabric 事件处理（避免闭包过期）─────────────
  const activeToolRef = useRef(activeTool);
  const isPanningRef = useRef(isPanning);
  const rebuildLayersRef = useRef(rebuildLayers);
  const saveHistoryRef = useRef<() => void>(() => {});

  // ── 初始化 Fabric Canvas ────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const w = container.clientWidth;
    const h = container.clientHeight;

    const fc = new fabric.Canvas("fabric-canvas", {
      width: w,
      height: h,
      backgroundColor: "#1e1e2e",
      selection: false,
      renderOnAddRemove: true,
    });
    fabricCanvasRef.current = fc;

    // ── 加载原图 ──────────────────────────────────────────────
    fabric.Image.fromURL(
      imageUrl,
      (img) => {
        if (!img || !fc) return;
        const maxW = w - 80;
        const maxH = h - 80;
        const scaleToFit = Math.min(1, maxW / (img.width || 1), maxH / (img.height || 1));
        img.scale(scaleToFit);
        const cx = (w - (img.width! * scaleToFit)) / 2;
        const cy = (h - (img.height! * scaleToFit)) / 2;
        img.set({ left: cx, top: cy, selectable: false, evented: false, data: { type: "image" } });
        fc.add(img);
        fc.sendToBack(img);
        fc.renderAll();
        const origW = img.width!;
        const origH = img.height!;
        setImgW(origW);
        setImgH(origH);
        setImage(imageUrl, imageUrl, origW, origH);
        // 计算适应窗口的 viewport transform，使图片在容器内居中
        const s = Math.min(w / origW, h / origH, 1);
        const tx = (w - origW * s) / 2;
        const ty = (h - origH * s) / 2;
        fc.setViewportTransform([s, 0, 0, s, tx, ty]);
        setZoom(Math.round(s * 100));
        setScale(s);
        saveHistory();
        setImgLoaded(true);
      },
      { crossOrigin: "anonymous" }
    );

    // ── 画布事件 ──────────────────────────────────────────────
    fc.on("mouse:down", handleCanvasMouseDown);
    fc.on("mouse:move", handleCanvasMouseMove);
    fc.on("mouse:up",   handleCanvasMouseUp);
    fc.on("mouse:wheel", handleCanvasWheel);
    fc.on("mouse:dblclick", handleCanvasDoubleClick);
    fc.on("object:moving", () => saveHistory());
    fc.on("text:editing:entered", (e) => {
      const t = e.target as FabricIText;
      if (t._dataId) setEditingTextId(t._dataId);
    });
    fc.on("text:changed", (e) => {
      const t = e.target as FabricIText;
      if (t._dataId) {
        updateText(t._dataId, { content: t.text || "" });
      }
    });

    // 窗口 resize
    const ro = new ResizeObserver(() => {
      if (containerRef.current && fabricCanvasRef.current) {
        fabricCanvasRef.current.setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
        fabricCanvasRef.current.renderAll();
      }
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
      fc.dispose();
      fabricCanvasRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrl]);

  // ── 工具切换时更新 canvas 状态 ───────────────────────────────
  useEffect(() => {
    const fc = fabricCanvasRef.current;
    if (!fc) return;
    fc.isDrawingMode = activeTool === "brush" || activeTool === "erase";
    fc.selection = activeTool === "pin" || activeTool === "text";
    fc.defaultCursor = "default";

    if (activeTool === "brush" || activeTool === "erase") {
      const brush = new fabric.PencilBrush(fc);
      brush.width = brushSize;
      brush.color = brushEraser ? "rgba(0,0,0,1)" : "rgba(255,255,255,0.85)";
      fc.freeDrawingBrush = brush;
      fc.defaultCursor = "crosshair";
    }
  }, [activeTool, brushSize, brushEraser]);

  // ── 滤镜应用 ───────────────────────────────────────────────
  useEffect(() => {
    const fc = fabricCanvasRef.current;
    if (!fc || !imgLoaded) return;
    const img = fc.getObjects().find((o) => o.data?.type === "image") as fabric.Image;
    if (!img) return;

    const cssFilter = FILTER_CSS[filter.preset] || "none";
    const strength  = filter.presetStrength / 100;
    const adj = filter.adjustments;

    // CSS filter 通过 container div 应用
    const container = containerRef.current;
    if (container) {
      const filters: string[] = [];
      if (cssFilter !== "none") filters.push(cssFilter);
      if (adj.brightness)   filters.push(`brightness(${1 + adj.brightness / 100})`);
      if (adj.contrast)     filters.push(`contrast(${1 + adj.contrast / 100})`);
      if (adj.saturation)   filters.push(`saturate(${1 + adj.saturation / 100})`);
      if (adj.warmth)       filters.push(`sepia(${adj.warmth / 200})`);
      if (adj.grain)        filters.push(`contrast(${1 + adj.grain / 300})`);
      container.style.filter = filters.length ? filters.join(" ") : "none";
    }
  }, [filter, imgLoaded]);

  // ── History 管理 ────────────────────────────────────────────
  const saveHistory = useCallback(() => {
    const fc = fabricCanvasRef.current;
    if (!fc || isRestoringRef.current) return;
    const json = JSON.stringify(fc.toJSON(["data"]));
    historyStackRef.current = historyStackRef.current.slice(0, historyIdxRef.current + 1);
    historyStackRef.current.push(json);
    if (historyStackRef.current.length > 50) {
      historyStackRef.current.shift();
    } else {
      historyIdxRef.current++;
    }
  }, []);

  const restoreFromHistory = useCallback((idx: number) => {
    const fc = fabricCanvasRef.current;
    if (!fc || idx < 0 || idx >= historyStackRef.current.length) return;
    isRestoringRef.current = true;
    historyIdxRef.current = idx;
    fc.loadFromJSON(JSON.parse(historyStackRef.current[idx]), () => {
      fc.renderAll();
      isRestoringRef.current = false;
    });
  }, []);

  // ── 同步 ref（在 saveHistory/rebuildLayers 声明之后）────────
  useEffect(() => { saveHistoryRef.current = saveHistory; }, [saveHistory]);
  useEffect(() => { rebuildLayersRef.current = rebuildLayers; }, [rebuildLayers]);
  useEffect(() => { activeToolRef.current = activeTool; }, [activeTool]);
  useEffect(() => { isPanningRef.current = isPanning; }, [isPanning]);

  // ── 画布鼠标事件 ────────────────────────────────────────────
  const handleCanvasMouseDown = useCallback((opt: fabric.IEvent<MouseEvent>) => {
    const fc = fabricCanvasRef.current;
    if (!fc) return;

    if (spaceDown.current || isPanningRef.current) {
      lastPanPoint.current = { x: opt.e.clientX, y: opt.e.clientY };
      setIsPanning(true);
      return;
    }

    if (activeToolRef.current === "erase") {
      const target = (fc.findTarget as any)(opt.e) as fabric.Object | undefined;
      if (target && target.data?.type === "mask") {
        fc.remove(target);
        rebuildLayersRef.current();
        saveHistoryRef.current();
        return;
      }
    }

    if (activeToolRef.current === "pin" && addPinMarkerRef.current) {
      const pointer = fc.getPointer(opt.e);
      addPinMarkerRef.current(pointer.x, pointer.y);
      saveHistoryRef.current();
    }

    if (activeToolRef.current === "text" && addTextObjectRef.current) {
      const pointer = fc.getPointer(opt.e);
      addTextObjectRef.current(pointer.x, pointer.y);
      saveHistoryRef.current();
    }
  }, []);

  const handleCanvasMouseMove = useCallback((opt: fabric.IEvent<MouseEvent>) => {
    const fc = fabricCanvasRef.current;
    if (!fc || !isPanningRef.current || !lastPanPoint.current) return;
    const dx = opt.e.clientX - lastPanPoint.current.x;
    const dy = opt.e.clientY - lastPanPoint.current.y;
    lastPanPoint.current = { x: opt.e.clientX, y: opt.e.clientY };
    const vpt = fc.viewportTransform || [1, 0, 0, 1, 0, 0];
    vpt[4] += dx;
    vpt[5] += dy;
    fc.setViewportTransform(vpt);
    fc.renderAll();
  }, []);

  const handleCanvasMouseUp = useCallback((opt: fabric.IEvent<MouseEvent>) => {
    const fc = fabricCanvasRef.current;
    if (!fc) return;

    if (isPanningRef.current) {
      setIsPanning(false);
      lastPanPoint.current = null;
      return;
    }

    if ((activeToolRef.current === "brush" || activeToolRef.current === "erase") && fc.isDrawingMode) {
      const objects = fc.getObjects();
      const last = objects[objects.length - 1] as fabric.Path | undefined;
      if (last && !(last as any).data?.type) {
        last.data = { type: "mask", isErase: activeToolRef.current === "erase" };
        last.selectable = false;
        last.evented = false;
        last.perPixelTargetFind = false;
        rebuildLayersRef.current();
        saveHistoryRef.current();
      }
    }
  }, []);

  // ── 双击编辑标记备注 ─────────────────────────────────────────
  const handleCanvasDoubleClick = useCallback((opt: fabric.IEvent<MouseEvent>) => {
    const fc = fabricCanvasRef.current;
    if (!fc) return;
    const target = (fc.findTarget as any)(opt.e) as fabric.Object | undefined;
    if (target && (target as any)._dataType === "pin") {
      const pinId = (target as any)._dataId;
      if (pinId) {
        const pin = store.pins.find((p) => p.id === pinId);
        if (pin) {
          setEditingPinNote(pinId);
          setEditingPinNoteText(pin.note);
        }
      }
    }
  }, [store.pins]);

  const handleCanvasWheel = useCallback((opt: fabric.IEvent<WheelEvent>) => {
    opt.e.preventDefault();
    const fc = fabricCanvasRef.current;
    if (!fc) return;
    const delta = opt.e.deltaY;
    let z = fc.getZoom();
    z *= 0.999 ** delta;
    z = Math.min(Math.max(z, 0.1), 8);
    fc.zoomToPoint(new fabric.Point(opt.e.offsetX, opt.e.offsetY), z);
    setZoom(Math.round(z * 100));
    setScale(z);
    fc.renderAll();
  }, [setScale]);

  // ── 添加标记点 ───────────────────────────────────────────────
  const addPinMarker = useCallback((fx: number, fy: number) => {
    const fc = fabricCanvasRef.current;
    if (!fc) return;

    const label = String(store.pins.length + 1);
    const r = pinSize / 2;

    // 圆点
    const circle = new fabric.Circle({
      radius: r,
      fill: pinColor,
      left: 0, top: 0,
      originX: "center", originY: "center",
    });

    // 标签文字
    const labelText = new fabric.Text(label, {
      fontSize: pinSize * 0.65,
      fill: "#ffffff",
      fontFamily: "Arial",
      left: 0, top: 0,
      originX: "center", originY: "center",
    });

    const id = addPin({
      style: pinStyle, x: fx, y: fy,
      xPercent: 0, yPercent: 0,
      color: pinColor, size: pinSize,
      label, note: "", visible: true, locked: false,
    });

    const group = new fabric.Group([circle, labelText], {
      left: fx, top: fy,
      originX: "center", originY: "center",
      selectable: true,
      data: { type: "pin", id },
    }, { // Fabric.js Group 构造支持 options
      ...({} as any),
    }) as any as FabricGroup;
    group._dataId = id;
    group._dataType = "pin";

    group.on("mousedown", () => {
      setSelectedPinLocal(id);
      setSelectedPin(id);
    });

    group.on("moving", () => {
      const coords = toImageCoords(fc, group, imgW, imgH);
      updatePin(id, { x: coords.x, y: coords.y });
    });

    fc.add(group);
    fc.setActiveObject(group);
    fc.renderAll();
  }, [pinStyle, pinColor, pinSize, store.pins.length, addPin, updatePin, setSelectedPin, imgW, imgH]);

  // 同步回调到 ref（供 handleCanvasMouseDown 在声明顺序前访问）
  useEffect(() => { addPinMarkerRef.current = addPinMarker; }, [addPinMarker]);

  // ── 添加文字对象 ─────────────────────────────────────────────
  const addTextObject = useCallback((fx: number, fy: number) => {
    const fc = fabricCanvasRef.current;
    if (!fc) return;

    const id = addText({
      content: "双击编辑文字",
      x: fx, y: fy,
      xPercent: 0, yPercent: 0,
      width: 0, height: 0,
      style: {
        fontFamily: fontFamily,
        fontSize: fontSize,
        color: fontColor,
        fontWeight,
        letterSpacing,
        lineHeight,
        opacity: textOpacity,
        textAlign,
        direction: textDirection,
        rotation: textRotation,
        stroke: textStroke || undefined,
        shadow: textShadow || undefined,
        bgColor: textBgColor || undefined,
        bgRadius: textBgRadius,
      },
    });

    const itext = new fabric.IText("双击编辑文字", {
      left: fx, top: fy,
      fontFamily, fontSize, fill: fontColor,
      fontWeight, charSpacing: letterSpacing * 10,
      textAlign, originX: "left", originY: "top",
      editable: true,
      data: { type: "text", id },
    } as any) as FabricIText;
    itext._dataId = id;
    itext._isEditorText = true;

    itext.on("editing:exited", () => {
      updateText(id, { content: itext.text || "" });
      setEditingTextId(null);
      saveHistory();
    });

    fc.add(itext);
    fc.setActiveObject(itext);
    itext.enterEditing();
    setEditingTextId(id);
    setSelectedText(id);
    fc.renderAll();
  }, [fontFamily, fontSize, fontColor, fontWeight, letterSpacing,
      lineHeight, textOpacity, textAlign, textDirection, textRotation,
      textStroke, textShadow, textBgColor, textBgRadius,
      addText, updateText, setSelectedText, saveHistory]);

  useEffect(() => { addTextObjectRef.current = addTextObject; }, [addTextObject]);

  // ── 快捷键 ──────────────────────────────────────────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      if (e.key === "Escape") { onClose(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); restoreFromHistory(historyIdxRef.current - 1); }
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) { e.preventDefault(); redo(); restoreFromHistory(historyIdxRef.current + 1); }
      if ((e.ctrlKey || e.metaKey) && e.key === "0") {
        e.preventDefault();
        const fc = fabricCanvasRef.current;
        if (!fc) return;
        const cw = containerRef.current?.clientWidth || 800;
        const ch = containerRef.current?.clientHeight || 600;
        const s = Math.min(cw / imgW, ch / imgH, 1);
        const tx = (cw - imgW * s) / 2;
        const ty = (ch - imgH * s) / 2;
        fc.setViewportTransform([s, 0, 0, s, tx, ty]);
        setZoom(Math.round(s * 100)); setScale(s);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "1") {
        const fc = fabricCanvasRef.current;
        if (fc) { fc.setViewportTransform([1,0,0,1,0,0]); setZoom(100); setScale(1); }
      }
      if (e.key === " ") { spaceDown.current = true; e.preventDefault(); }
      if (e.key === "[") setBrushSize(brushSize - 5);
      if (e.key === "]") setBrushSize(brushSize + 5);
      if ((e.key === "Delete" || e.key === "Backspace") && !editingTextId) {
        const fc = fabricCanvasRef.current;
        if (!fc) return;
        const sel = fc.getActiveObjects();
        if (!sel.length) return;
        sel.forEach((obj) => {
          const oid = (obj as any)._dataId;
          if (obj.data?.type === "pin" && oid) removePin(oid as string);
          if (obj.data?.type === "text" && oid) removeText(oid as string);
          if (obj.data?.type === "mask") fc.remove(obj);
        });
        fc.discardActiveObject();
        rebuildLayers();
        saveHistory();
      }
      // 工具快捷键
      const toolMap: Record<string, EditorTool> = { b: "brush", p: "pin", t: "text", r: "erase", g: "bg", c: "crop", f: "filter", o: "outpaint" };
      if (!e.ctrlKey && !e.metaKey && toolMap[e.key.toLowerCase()]) {
        setTool(toolMap[e.key.toLowerCase()]);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === " ") { spaceDown.current = false; setIsPanning(false); lastPanPoint.current = null; }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => { window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", onKeyUp); };
  }, [undo, redo, restoreFromHistory, setScale, setBrushSize, brushSize,
      removePin, removeText, rebuildLayers, saveHistory, onClose, setTool, editingTextId]);

  // ── 提交逻辑 ───────────────────────────────────────────────
  const handleSubmit = useCallback(() => {
    const fc = fabricCanvasRef.current;
    if (!fc) return;

    setIsSubmitting(true);

    const originalImage = exportCanvasToBase64(fc);
    const maskImage = exportMaskToBase64(fc, imgW, imgH);

    const markers = store.pins.map((pin) => {
      const obj = fc.getObjects().find((o) => (o as any)._dataId === pin.id);
      const coords = obj ? toImageCoords(fc, obj, imgW, imgH) : { x: pin.x, y: pin.y };
      return {
        id: pin.id,
        style: pin.style,
        position: { x: coords.x, y: coords.y, xPercent: coords.x / imgW * 100, yPercent: coords.y / imgH * 100 },
        color: pin.color,
        note: pin.note,
      };
    });

    const textLayers = store.textAdditions.map((t) => {
      const itext = fc.getObjects().find((o) => (o as any)._dataId === t.id) as fabric.IText | undefined;
      return {
        id: t.id,
        content: itext?.text || t.content,
        position: { x: itext?.left || t.x, y: itext?.top || t.y },
        style: t.style,
      };
    });

    const parts: string[] = [];
    if (markers.length) parts.push(`标记点指令: ${markers.map((m) => `#${m.id} ${m.note}`).join("; ")}`);
    if (textLayers.length) parts.push(`文字内容: ${textLayers.map((t) => `"${t.content}"`).join(", ")}`);
    if (bgEdit) parts.push(`背景处理: ${bgEdit.action} - ${bgEdit.replacePrompt || ""}`);
    if (submitPrompt) parts.push(`用户指令: ${submitPrompt}`);
    const compositePrompt = parts.join(" | ");

    if (maskImage) {
      const payload = {
        mode: "img2img_inpaint",
        imageBase64: originalImage,
        maskImage,
        imageSize: { w: imgW, h: imgH },
        compositePrompt,
        maskPrompt: submitPrompt || compositePrompt,
        markers,
        textAdditions: textLayers,
        background: bgEdit || undefined,
        crop: store.crop || undefined,
        filter: store.filter,
        outpaint: store.outpaint || undefined,
        advancedParams: {
          ...advancedParams,
          batchSize: advancedParams.batchSize || 1,
          outputWidth: imgW,
          outputHeight: imgH,
        },
      };
      onConfirm(payload as any);
    } else {
      const payload = buildEditorPayload({
        imageBase64: originalImage,
        imageSize: { w: imgW, h: imgH },
        maskLayers: store.maskLayers,
        pins: store.pins,
        textAdditions: store.textAdditions,
        textReplacements: store.textReplacements,
        eraseRegions: store.eraseRegions,
        bgEdit: store.bgEdit,
        crop: store.crop,
        filter: store.filter,
        outpaint: store.outpaint,
        references: store.references,
        advancedParams: {
          ...advancedParams,
          batchSize: advancedParams.batchSize || 1,
          outputWidth: imgW,
          outputHeight: imgH,
        },
      });
      (payload as any).compositePrompt = compositePrompt;
      onConfirm(payload);
    }

    setTimeout(() => setIsSubmitting(false), 500);
  }, [submitPrompt, advancedParams, store, imgW, imgH, onConfirm, bgEdit]);

  // ─────────────────────────────────────────────────────────────
  // 渲染
  // ─────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-slate-900/95 backdrop-blur-sm">
      {/* ── 顶部操作栏 ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2 bg-white/5 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs transition"
          >← 关闭</button>
          <div className="flex items-center gap-1">
            <button onClick={() => { undo(); restoreFromHistory(historyIdxRef.current - 1); }} disabled={!past.length}
              className="px-2 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs disabled:opacity-30 transition" title="撤销 Ctrl+Z">↩</button>
            <button onClick={() => { redo(); restoreFromHistory(historyIdxRef.current + 1); }} disabled={!future.length}
              className="px-2 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs disabled:opacity-30 transition" title="重做 Ctrl+Y">↪</button>
            <button onClick={toggleHistory}
              className="px-2 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs transition">📋 历史</button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* 缩放控制 */}
          <div className="flex items-center gap-1 bg-white/10 rounded-lg px-2 py-1">
            <button onClick={() => {
              const fc = fabricCanvasRef.current;
              if (!fc) return;
              const center = new fabric.Point(fc.getWidth() / 2, fc.getHeight() / 2);
              const z = Math.max(0.1, fc.getZoom() * 0.8);
              fc.zoomToPoint(center, z);
              setZoom(Math.round(z * 100)); setScale(z);
            }}
              className="text-white/70 hover:text-white text-sm">−</button>
            <span className="text-white text-xs w-12 text-center">{zoom}%</span>
            <button onClick={() => {
              const fc = fabricCanvasRef.current;
              if (!fc) return;
              const center = new fabric.Point(fc.getWidth() / 2, fc.getHeight() / 2);
              const z = Math.min(8, fc.getZoom() * 1.25);
              fc.zoomToPoint(center, z);
              setZoom(Math.round(z * 100)); setScale(z);
            }}
              className="text-white/70 hover:text-white text-sm">+</button>
          </div>

          <button onClick={() => {
            const fc = fabricCanvasRef.current;
            if (!fc) return;
            const cw = containerRef.current?.clientWidth || 800;
            const ch = containerRef.current?.clientHeight || 600;
            const s = Math.min(cw / imgW, ch / imgH, 1);
            const tx = (cw - imgW * s) / 2;
            const ty = (ch - imgH * s) / 2;
            fc.setViewportTransform([s, 0, 0, s, tx, ty]);
            setZoom(Math.round(s * 100)); setScale(s);
          }}
            className="px-2 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs transition" title="适应窗口 Ctrl+0">⊞</button>

          <button onClick={() => {
            const s = prompt("输入缩放 (10-800):", String(zoom));
            if (!s) return;
            const z = Math.min(Math.max(parseInt(s) / 100, 0.1), 8);
            const fc = fabricCanvasRef.current;
            if (fc) {
              const center = new fabric.Point(fc.getWidth() / 2, fc.getHeight() / 2);
              fc.zoomToPoint(center, z);
              setZoom(Math.round(z * 100)); setScale(z);
            }
          }}
            className="px-2 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs transition">🔍</button>

          <button onClick={resetAll}
            className="px-2 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs transition">🔄 重置</button>

          <button onClick={toggleSubmitPanel}
            className="px-4 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-medium transition">✅ 确认提交</button>
        </div>
      </div>

      {/* ── 主工作区 ─────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── 左侧图层面板 ───────────────────────────────────── */}
        {leftPanelOpen && (
          <div className="w-56 bg-white/5 border-r border-white/10 flex flex-col overflow-hidden shrink-0">
            <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between">
              <span className="text-white/60 text-xs font-medium">图层</span>
              <button onClick={toggleLeftPanel} className="text-white/40 hover:text-white text-xs">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {/* 原图层 */}
              <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-indigo-500/20 text-indigo-300 text-xs">
                <span className="text-indigo-400">🖼</span> 原图
              </div>
              {/* 蒙版层 */}
              {maskLayers.map((l) => (
                <div key={l.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/10 text-white/80 text-xs cursor-pointer"
                  onClick={() => setSelectedLayerId(l.id)}>
                  <span>🖌</span>
                  <span className="flex-1 truncate">蒙版 {l.paths.length} 笔</span>
                  <button onClick={(e) => { e.stopPropagation(); clearMaskLayer(l.id); }}
                    className="text-white/30 hover:text-red-400 text-[10px]">×</button>
                </div>
              ))}
              {/* 标记层 */}
              {pins.length > 0 && (
                <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-white/5 text-white/80 text-xs">
                  <span>📍</span> 标记点 ({pins.length})
                </div>
              )}
              {/* 文字层 */}
              {textAdditions.length > 0 && (
                <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-white/5 text-white/80 text-xs">
                  <span>🔤</span> 文字 ({textAdditions.length})
                </div>
              )}
              {pins.length === 0 && maskLayers.length === 0 && textAdditions.length === 0 && (
                <p className="text-white/30 text-[10px] text-center py-4">暂无编辑图层</p>
              )}
            </div>
          </div>
        )}

        {/* ── 画布区域 ────────────────────────────────────────── */}
        <div
          ref={containerRef}
          className="flex-1 relative overflow-hidden"
          style={{
            cursor: isPanning || spaceDown.current
              ? "grab"
              : activeTool === "brush" || activeTool === "erase"
                ? "crosshair"
                : activeTool === "pin" || activeTool === "text"
                  ? "crosshair"
                  : "default",
          }}
        >
          {/* Fabric.js Canvas */}
          <canvas id="fabric-canvas" className="absolute inset-0" />

          {/* ── 标记点双击编辑弹窗 ─────────────────────────── */}
          {editingPinNote && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-800/95 border border-indigo-400/40 rounded-2xl shadow-2xl p-4 w-72 backdrop-blur-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-indigo-300 text-xs font-medium">📝 标记 #{(store.pins.findIndex(p => p.id === editingPinNote) + 1)} 备注</span>
                <button onClick={() => setEditingPinNote(null)}
                  className="text-white/40 hover:text-white text-sm">✕</button>
              </div>
              <textarea
                autoFocus
                className="w-full px-3 py-2 text-sm text-white bg-slate-700/80 rounded-xl border border-white/20 resize-none focus:outline-none focus:border-indigo-400"
                rows={3}
                placeholder="输入修改指令，如：替换为玻璃材质、加阴影..."
                value={editingPinNoteText}
                onChange={(e) => setEditingPinNoteText(e.target.value)}
              />
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => {
                    updatePin(editingPinNote, { note: editingPinNoteText });
                    setEditingPinNote(null);
                  }}
                  className="flex-1 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-medium transition"
                >保存</button>
                <button
                  onClick={() => {
                    removePin(editingPinNote);
                    setEditingPinNote(null);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/40 text-red-300 text-xs transition"
                >删除</button>
              </div>
            </div>
          )}

          {/* 画布外点击关闭选择 */}
          <div
            className="absolute inset-0 z-0 pointer-events-none"
            onClick={() => {
              const fc = fabricCanvasRef.current;
              if (fc) { fc.discardActiveObject(); fc.renderAll(); }
            }}
          />
        </div>

        {/* ── 右侧属性面板 ────────────────────────────────────── */}
        {rightPanelOpen && (
          <div className="w-64 bg-white/5 border-l border-white/10 flex flex-col overflow-hidden shrink-0">
            <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between">
              <span className="text-white/60 text-xs font-medium">属性</span>
              <button onClick={toggleRightPanel} className="text-white/40 hover:text-white text-xs">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-4">

              {/* 画笔参数 */}
              {(activeTool === "brush" || activeTool === "erase") && (
                <div className="space-y-3">
                  <h3 className="text-white/80 text-xs font-medium border-b border-white/10 pb-1">
                    {activeTool === "erase" ? "🧹 橡皮擦" : "🖌 画笔蒙版"}
                  </h3>
                  <div>
                    <label className="text-white/50 text-[10px]">粗细: {brushSize}px</label>
                    <input type="range" min={1} max={200} value={brushSize}
                      onChange={(e) => setBrushSize(parseInt(e.target.value))}
                      className="w-full h-1 bg-white/20 rounded appearance-none cursor-pointer mt-1"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setBrushEraser(false)}
                      className={`flex-1 py-1 rounded text-[10px] transition ${!brushEraser ? "bg-indigo-500 text-white" : "bg-white/10 text-white/60"}`}
                    >画笔 B</button>
                    <button
                      onClick={() => setBrushEraser(true)}
                      className={`flex-1 py-1 rounded text-[10px] transition ${brushEraser ? "bg-indigo-500 text-white" : "bg-white/10 text-white/60"}`}
                    >橡皮 E</button>
                  </div>
                  <button
                    onClick={() => {
                      const fc = fabricCanvasRef.current;
                      if (!fc) return;
                      const masks = fc.getObjects().filter((o) => o.data?.type === "mask");
                      masks.forEach((m) => fc.remove(m));
                      rebuildLayers();
                      saveHistory();
                    }}
                    className="w-full py-1 rounded bg-red-500/20 hover:bg-red-500/40 text-red-300 text-[10px] transition"
                  >清空蒙版</button>

                  {/* 蒙版提示词 */}
                  <div className="pt-1 border-t border-white/10">
                    <label className="text-white/50 text-[10px] block mb-1">蒙版提示词（描述重绘内容）</label>
                    <textarea
                      className="w-full px-2 py-1.5 text-xs bg-white/10 text-white rounded border border-white/20 resize-none focus:outline-none focus:border-indigo-400"
                      rows={2}
                      placeholder="例如：将选区内容替换为星空..."
                      value={submitPrompt}
                      onChange={(e) => setSubmitPrompt(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {/* 标记点参数 */}
              {activeTool === "pin" && (
                <div className="space-y-3">
                  <h3 className="text-white/80 text-xs font-medium border-b border-white/10 pb-1">📍 标记点</h3>
                  <div>
                    <label className="text-white/50 text-[10px] block mb-1">样式</label>
                    <div className="flex gap-1">
                      {(["dot", "numbered", "arrow", "pin"] as const).map((s) => (
                        <button key={s}
                          onClick={() => setPinStyle(s)}
                          className={`flex-1 py-1 rounded text-[10px] transition ${pinStyle === s ? "bg-indigo-500 text-white" : "bg-white/10 text-white/60"}`}
                        >{s === "dot" ? "●" : s === "numbered" ? "❶" : s === "arrow" ? "➤" : "📌"}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-white/50 text-[10px]">大小: {pinSize}px</label>
                    <input type="range" min={12} max={64} value={pinSize}
                      onChange={(e) => setPinSize(parseInt(e.target.value))}
                      className="w-full h-1 bg-white/20 rounded appearance-none cursor-pointer mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-white/50 text-[10px] block mb-1">颜色</label>
                    <input type="color" value={pinColor}
                      onChange={(e) => setPinColor(e.target.value)}
                      className="w-full h-8 rounded cursor-pointer border border-white/20"
                    />
                  </div>
                  {selectedPinId && (
                    <div className="pt-1 border-t border-white/10">
                      <label className="text-white/50 text-[10px] block mb-1"># {selectedPinId.slice(-4)} 备注</label>
                      <textarea
                        className="w-full px-2 py-1.5 text-xs bg-white/10 text-white rounded border border-white/20 resize-none focus:outline-none focus:border-indigo-400"
                        rows={2}
                        placeholder="输入修改指令..."
                        value={pins.find((p) => p.id === selectedPinId)?.note || ""}
                        onChange={(e) => updatePin(selectedPinId, { note: e.target.value })}
                      />
                      <button
                        onClick={() => { removePin(selectedPinId); setSelectedPinLocal(null); setSelectedPin(null); }}
                        className="w-full mt-1 py-1 rounded bg-red-500/20 hover:bg-red-500/40 text-red-300 text-[10px] transition"
                      >删除标记</button>
                    </div>
                  )}
                  {pins.length > 0 && (
                    <button onClick={clearPins}
                      className="w-full py-1 rounded bg-white/5 hover:bg-white/10 text-white/60 text-[10px] transition"
                    >清空全部标记</button>
                  )}
                </div>
              )}

              {/* 文字参数 */}
              {activeTool === "text" && (
                <div className="space-y-3">
                  <h3 className="text-white/80 text-xs font-medium border-b border-white/10 pb-1">🔤 文字</h3>
                  <div>
                    <label className="text-white/50 text-[10px]">字号: {fontSize}px</label>
                    <input type="range" min={8} max={200} value={fontSize}
                      onChange={(e) => setFontSize(parseInt(e.target.value))}
                      className="w-full h-1 bg-white/20 rounded appearance-none cursor-pointer mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-white/50 text-[10px]">颜色</label>
                    <input type="color" value={fontColor}
                      onChange={(e) => setFontColor(e.target.value)}
                      className="w-full h-8 rounded cursor-pointer border border-white/20"
                    />
                  </div>
                  <div>
                    <label className="text-white/50 text-[10px]">透明度: {textOpacity}%</label>
                    <input type="range" min={0} max={100} value={textOpacity}
                      onChange={(e) => setTextOpacity(parseInt(e.target.value))}
                      className="w-full h-1 bg-white/20 rounded appearance-none cursor-pointer mt-1"
                    />
                  </div>
                  <div className="flex gap-1">
                    {(["left", "center", "right"] as const).map((a) => (
                      <button key={a}
                        onClick={() => setTextAlign(a)}
                        className={`flex-1 py-1 rounded text-[10px] transition ${textAlign === a ? "bg-indigo-500 text-white" : "bg-white/10 text-white/60"}`}
                      >{a === "left" ? "≡" : a === "center" ? "≡" : "≡"}</button>
                    ))}
                  </div>
                  <div>
                    <label className="text-white/50 text-[10px]">字间距: {letterSpacing}</label>
                    <input type="range" min={-50} max={200} value={letterSpacing}
                      onChange={(e) => setLetterSpacing(parseInt(e.target.value))}
                      className="w-full h-1 bg-white/20 rounded appearance-none cursor-pointer mt-1"
                    />
                  </div>
                  {textAdditions.length > 0 && (
                    <button onClick={clearTexts}
                      className="w-full py-1 rounded bg-white/5 hover:bg-white/10 text-white/60 text-[10px] transition"
                    >清空文字</button>
                  )}
                </div>
              )}

              {/* 背景处理 */}
              {activeTool === "bg" && (
                <div className="space-y-3">
                  <h3 className="text-white/80 text-xs font-medium border-b border-white/10 pb-1">🖼 背景</h3>
                  <div className="flex gap-1">
                    {[["remove","抠图"],["replace","替换"],["blur","模糊"],["solid","纯色"]].map(([k,v]) => (
                      <button key={k}
                        onClick={() => { setActiveBgTab(k); setBgEdit({ action: k as any, replacePrompt: bgPrompt }); }}
                        className={`flex-1 py-1 rounded text-[10px] transition ${activeBgTab === k ? "bg-indigo-500 text-white" : "bg-white/10 text-white/60"}`}
                      >{v}</button>
                    ))}
                  </div>
                  {activeBgTab === "replace" && (
                    <input className="w-full px-2 py-1.5 text-xs bg-white/10 text-white rounded border border-white/20 focus:outline-none focus:border-indigo-400"
                      placeholder="描述新背景..."
                      value={bgPrompt} onChange={(e) => { setBgPrompt(e.target.value); setBgEdit({ action: "replace", replacePrompt: e.target.value }); }} />
                  )}
                  {activeBgTab === "solid" && (
                    <input type="color" value={bgColor}
                      onChange={(e) => { setBgColor(e.target.value); setBgEdit({ action: "solid", solidColor: e.target.value }); }}
                      className="w-full h-8 rounded cursor-pointer border border-white/20" />
                  )}
                  {activeBgTab === "blur" && (
                    <div>
                      <label className="text-white/50 text-[10px]">模糊: {bgBlur}px</label>
                      <input type="range" min={0} max={50} value={bgBlur}
                        onChange={(e) => { setBgBlur(parseInt(e.target.value)); setBgEdit({ action: "blur", blurStrength: parseInt(e.target.value) }); }}
                        className="w-full h-1 bg-white/20 rounded appearance-none cursor-pointer mt-1" />
                    </div>
                  )}
                </div>
              )}

              {/* 裁剪 */}
              {activeTool === "crop" && (
                <div className="space-y-3">
                  <h3 className="text-white/80 text-xs font-medium border-b border-white/10 pb-1">✂ 裁剪</h3>
                  <div className="grid grid-cols-4 gap-1">
                    {[["free","自由"],["1:1","1:1"],["4:3","4:3"],["16:9","16:9"],["3:2","3:2"],["9:16","9:16"],["3:4","3:4"],["2:3","2:3"]].map(([k,v]) => (
                      <button key={k}
                        onClick={() => setCropRatio(k)}
                        className={`py-1 rounded text-[10px] transition ${cropRatio === k ? "bg-indigo-500 text-white" : "bg-white/10 text-white/60"}`}
                      >{v}</button>
                    ))}
                  </div>
                </div>
              )}

              {/* 滤镜 */}
              {activeTool === "filter" && (
                <div className="space-y-3">
                  <h3 className="text-white/80 text-xs font-medium border-b border-white/10 pb-1">🎨 滤镜 & 调色</h3>
                  <div className="grid grid-cols-4 gap-1">
                    {filterPresets.map((f) => (
                      <button key={f.id}
                        onClick={() => setFilterPreset(f.id, 100)}
                        className={`py-1.5 rounded text-[9px] text-center transition ${filter.preset === f.id ? "bg-indigo-500 text-white" : "bg-white/10 text-white/60 hover:bg-white/20"}`}
                        title={f.name}
                      >{f.name}</button>
                    ))}
                  </div>
                  <div>
                    <label className="text-white/50 text-[10px]">强度: {filter.presetStrength}%</label>
                    <input type="range" min={0} max={100} value={filter.presetStrength}
                      onChange={(e) => setFilterPreset(filter.preset, parseInt(e.target.value))}
                      className="w-full h-1 bg-white/20 rounded appearance-none cursor-pointer mt-1"
                    />
                  </div>
                  {/* 手动调色 */}
                  <details className="text-xs">
                    <summary className="text-white/60 cursor-pointer hover:text-white/80">手动调色 ▶</summary>
                    <div className="mt-2 space-y-2">
                      {[
                        ["brightness","亮度",-100,100],
                        ["contrast","对比度",-100,100],
                        ["saturation","饱和度",-100,100],
                        ["warmth","色温",-100,100],
                        ["grain","颗粒",0,100],
                        ["vignette","暗角",0,100],
                        ["fade","褪色",0,100],
                      ].map(([key, label, min, max]) => (
                        <div key={key}>
                          <label className="text-white/50 text-[10px]">{label}: {adjValues[key as keyof typeof adjValues]}</label>
                          <input type="range" min={min} max={max} value={adjValues[key as keyof typeof adjValues]}
                            onChange={(e) => {
                              const v = parseInt(e.target.value);
                              setAdjValues((prev) => ({ ...prev, [key]: v }));
                              setFilterAdjustments({ [key]: v });
                            }}
                            className="w-full h-1 bg-white/20 rounded appearance-none cursor-pointer mt-0.5"
                          />
                        </div>
                      ))}
                      <button onClick={() => { resetFilter(); setAdjValues({ brightness:0,contrast:0,saturation:0,warmth:0,tint:0,highlights:0,shadows:0,clarity:0,grain:0,vignette:0,fade:0 }); }}
                        className="w-full py-1 rounded bg-white/5 hover:bg-white/10 text-white/60 text-[10px] transition">重置调色</button>
                    </div>
                  </details>
                </div>
              )}

              {/* 扩图 */}
              {activeTool === "outpaint" && (
                <div className="space-y-3">
                  <h3 className="text-white/80 text-xs font-medium border-b border-white/10 pb-1">↔ 扩图延展</h3>
                  <div className="grid grid-cols-4 gap-1">
                    {[
                      ["top","⬆"],["bottom","⬇"],["left","⬅"],["right","➡"],
                    ].map(([dir, label]) => (
                      <button key={dir}
                        onClick={() => setOutpaintDirs((prev) =>
                          prev.includes(dir as any) ? prev.filter((d) => d !== dir) : [...prev, dir as any]
                        )}
                        className={`py-1 rounded text-[10px] transition ${outpaintDirs.includes(dir as any) ? "bg-indigo-500 text-white" : "bg-white/10 text-white/60"}`}
                      >{label}</button>
                    ))}
                  </div>
                  <div>
                    <label className="text-white/50 text-[10px]">扩展比例: {outpaintScale}x</label>
                    <input type="range" min={125} max={200} value={outpaintScale}
                      onChange={(e) => setOutpaintScale(parseInt(e.target.value))}
                      className="w-full h-1 bg-white/20 rounded appearance-none cursor-pointer mt-1"
                    />
                  </div>
                  <input className="w-full px-2 py-1.5 text-xs bg-white/10 text-white rounded border border-white/20 focus:outline-none focus:border-indigo-400"
                    placeholder="扩展区域描述..."
                    value={outpaintPrompt} onChange={(e) => setOutpaintPrompt(e.target.value)} />
                  <button
                    onClick={() => setOutpaint({
                      directions: outpaintDirs as ("top"|"bottom"|"left"|"right")[],
                      top: 0, bottom: 0, left: 0, right: 0,
                      scale: outpaintScale,
                      prompt: outpaintPrompt,
                      targetWidth: Math.round(imgW * outpaintScale),
                      targetHeight: Math.round(imgH * outpaintScale),
                    })}
                    className="w-full py-1 rounded bg-indigo-500/20 hover:bg-indigo-500/40 text-indigo-300 text-[10px] transition"
                  >应用扩图参数</button>
                </div>
              )}

              {/* 高级参数 */}
              {advancedOpen && (
                <div className="space-y-2 pt-2 border-t border-white/10">
                  <h3 className="text-white/80 text-xs font-medium">⚙ 高级参数</h3>
                  {[
                    ["strength","重绘幅度",0,1],
                    ["guidance_scale","引导系数",1,20],
                    ["steps","采样步数",10,50],
                  ].map(([key, label, min, max]) => (
                    <div key={key}>
                      <label className="text-white/50 text-[10px]">{label}: {advancedParams[key as keyof typeof advancedParams]}</label>
                      <input type="range" min={min} max={max}
                        value={advancedParams[key as keyof typeof advancedParams]}
                        onChange={(e) => setAdvancedParams({ [key]: parseFloat(e.target.value) })}
                        className="w-full h-1 bg-white/20 rounded appearance-none cursor-pointer mt-0.5"
                      />
                    </div>
                  ))}
                  <div>
                    <label className="text-white/50 text-[10px]">随机种子: {advancedParams.seed}</label>
                    <input type="number"
                      value={advancedParams.seed}
                      onChange={(e) => setAdvancedParams({ seed: parseInt(e.target.value) || -1 })}
                      className="w-full px-2 py-1 text-xs bg-white/10 text-white rounded border border-white/20 focus:outline-none mt-0.5"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 恢复右侧面板按钮 */}
        {!rightPanelOpen && (
          <button onClick={toggleRightPanel}
            className="absolute right-0 top-1/2 -translate-y-1/2 px-1 py-4 bg-white/10 hover:bg-white/20 text-white/60 text-xs rounded-l transition z-10"
          >▶</button>
        )}
        {!leftPanelOpen && (
          <button onClick={toggleLeftPanel}
            className="absolute left-0 top-1/2 -translate-y-1/2 px-1 py-4 bg-white/10 hover:bg-white/20 text-white/60 text-xs rounded-r transition z-10"
          >◀</button>
        )}
      </div>

      {/* ── 底部功能切换栏 ────────────────────────────────────── */}
      <div className="shrink-0 bg-white/5 border-t border-white/10">
        <div className="flex items-center justify-center gap-1 px-4 py-2">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTool(t.id)}
              className={`relative flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition ${
                activeTool === t.id
                  ? "bg-indigo-500/30 text-indigo-300"
                  : "text-white/50 hover:text-white/80 hover:bg-white/10"
              }`}
              title={`${t.label} 按 ${t.key} 键切换`}
            >
              <ToolIconSmall tool={t.id} />
              <span className="text-[9px]">{t.label}</span>
              {/* 快捷键徽章 */}
              <span className={`absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded text-[7px] flex items-center justify-center font-mono ${
                activeTool === t.id ? "bg-indigo-500 text-white" : "bg-white/20 text-white/60"
              }`}>{t.key}</span>
              {activeTool === t.id && (
                <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-4 h-0.5 bg-indigo-400 rounded-full" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── 提交汇总面板 ──────────────────────────────────────── */}
      {submitPanelOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-[520px] max-h-[85vh] flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-800">提交预览</h2>
              <button onClick={toggleSubmitPanel} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {/* 蒙版 */}
              {/* 蒙版 */}
              {(() => {
                const fc = fabricCanvasRef.current;
                const maskCount = fc ? fc.getObjects().filter((o) => o.data?.type === "mask").length : 0;
                return maskCount > 0 ? (
                  <div className="flex items-start gap-3 p-3 bg-red-50 rounded-xl">
                    <span className="text-red-400 text-sm">🖌</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-slate-700">蒙版选区</p>
                        <span className="px-1.5 py-0.5 bg-red-100 text-red-600 text-[10px] rounded-full">已提取</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {maskCount} 笔触 → 将执行局部重绘
                        {submitPrompt && <><br/><span className="text-indigo-600">提示词: "{submitPrompt}"</span></>}
                      </p>
                    </div>
                  </div>
                ) : null;
              })()}
              {/* 标记 */}
              {pins.length > 0 && (
                <div className="flex items-start gap-3 p-3 bg-amber-50 rounded-xl">
                  <span className="text-amber-400 text-sm">📍</span>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-700">标记批注 ({pins.length} 个)</p>
                    {pins.map((p) => (
                      <p key={p.id} className="text-xs text-slate-500 mt-0.5">
                        #{p.label}: {p.note || "(无备注)"}
                      </p>
                    ))}
                  </div>
                </div>
              )}
              {/* 文字 */}
              {textAdditions.length > 0 && (
                <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-xl">
                  <span className="text-blue-400 text-sm">🔤</span>
                  <div>
                    <p className="text-sm font-medium text-slate-700">文字编辑 ({textAdditions.length})</p>
                    {textAdditions.map((t) => (
                      <p key={t.id} className="text-xs text-slate-500 mt-0.5">"{t.content}"</p>
                    ))}
                  </div>
                </div>
              )}
              {/* 背景 */}
              {bgEdit && (
                <div className="flex items-start gap-3 p-3 bg-green-50 rounded-xl">
                  <span className="text-green-400 text-sm">🖼</span>
                  <div>
                    <p className="text-sm font-medium text-slate-700">背景处理</p>
                    <p className="text-xs text-slate-500 mt-0.5">{bgEdit.action} {bgEdit.replacePrompt || bgEdit.solidColor || `(模糊 ${bgEdit.blurStrength}px)`}</p>
                  </div>
                </div>
              )}
              {/* 滤镜 */}
              {filter.preset !== "original" && (
                <div className="flex items-start gap-3 p-3 bg-purple-50 rounded-xl">
                  <span className="text-purple-400 text-sm">🎨</span>
                  <div>
                    <p className="text-sm font-medium text-slate-700">滤镜: {filter.preset}</p>
                    <p className="text-xs text-slate-500 mt-0.5">强度 {filter.presetStrength}%</p>
                  </div>
                </div>
              )}
              {/* 扩图 */}
              {outpaint && (
                <div className="flex items-start gap-3 p-3 bg-orange-50 rounded-xl">
                  <span className="text-orange-400 text-sm">↔</span>
                  <div>
                    <p className="text-sm font-medium text-slate-700">扩图延展</p>
                    <p className="text-xs text-slate-500 mt-0.5">{outpaint.targetWidth}×{outpaint.targetHeight}px</p>
                  </div>
                </div>
              )}
              {pins.length === 0 && textAdditions.length === 0 && !bgEdit && filter.preset === "original" && !outpaint && (
                <div className="text-center text-slate-400 text-sm py-6">
                  <p>暂无编辑操作</p>
                  <p className="text-xs text-slate-400 mt-1">画笔涂抹 → 添加蒙版 → 确认提交</p>
                </div>
              )}

              {/* 额外提示词 */}
              <div className="pt-2 border-t border-slate-100">
                <label className="text-xs text-slate-500 block mb-1">额外提示词（可补充 AI 指令）</label>
                <textarea
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl resize-none bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  rows={3}
                  placeholder="例如：将标记区域的人物服装改为蓝色礼服..."
                  value={submitPrompt}
                  onChange={(e) => setSubmitPrompt(e.target.value)}
                />
              </div>

              {/* 高级参数折叠 */}
              <details className="group">
                <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-600 list-none flex items-center gap-1">
                  <span className="text-[10px] group-open:rotate-90 transition-transform">▶</span>
                  高级参数
                </summary>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {[
                    ["strength", "重绘幅度"],
                    ["guidance_scale", "引导系数"],
                    ["steps", "采样步数"],
                  ].map(([k, l]) => (
                    <div key={k}>
                      <label className="text-[10px] text-slate-500">{l}: {advancedParams[k as keyof typeof advancedParams]}</label>
                      <input type="range" min={k === "strength" ? 0 : k === "guidance_scale" ? 1 : 10}
                        max={k === "strength" ? 100 : k === "guidance_scale" ? 20 : 50}
                        value={k === "strength" ? advancedParams.strength * 100 : advancedParams[k as keyof typeof advancedParams]}
                        onChange={(e) => setAdvancedParams({ [k]: k === "strength" ? parseInt(e.target.value) / 100 : parseFloat(e.target.value) })}
                        className="w-full h-1 bg-slate-200 rounded appearance-none cursor-pointer"
                      />
                    </div>
                  ))}
                </div>
              </details>
            </div>
            <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-3">
              <button onClick={toggleSubmitPanel}
                className="px-4 py-2 rounded-xl bg-slate-100 text-slate-600 text-sm hover:bg-slate-200 transition"
              >取消</button>
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="px-5 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium disabled:opacity-50 transition"
              >
                {isSubmitting ? "提交中..." : "🚀 确认生成"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── 小图标组件 ──────────────────────────────────────────────
const ToolIconSmall = ({ tool }: { tool: EditorTool }) => {
  const icons: Record<EditorTool, React.ReactNode> = {
    brush:    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>,
    pin:      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
    text:     <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>,
    erase:    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>,
    bg:       <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>,
    crop:     <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" /></svg>,
    filter:   <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>,
    outpaint: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" /></svg>,
  };
  return <>{icons[tool]}</>;
};

export default ImageEditor;
