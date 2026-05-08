import React, { memo } from "react";
import {
  BaseEdge, EdgeLabelRenderer, getSmoothStepPath,
  type EdgeProps,
} from "@xyflow/react";
import { useCanvasStore } from "../store/useCanvasStore";

const EDGE_COLORS: Record<string, string> = {
  "text-generate": "#f59e0b",
  "image-generate": "#6366f1",
  "generate-image": "#a855f7",
  default: "#6366f1",
};

const EDGE_LABELS: Record<string, string> = {
  "text-generate": "提示词",
  "image-generate": "参考图",
  "generate-image": "输出",
};

const CanvasEdge: React.FC<EdgeProps> = ({
  id, sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition,
  source, target, selected,
}) => {
  const nodes = useCanvasStore((s) => s.nodes);
  const srcNode = nodes.find((n) => n.id === source);
  const tgtNode = nodes.find((n) => n.id === target);
  const srcKind = String((srcNode?.data as Record<string, unknown>)?.kind ?? "");
  const tgtKind = String((tgtNode?.data as Record<string, unknown>)?.kind ?? "");
  const pairKey = `${srcKind}-${tgtKind}`;
  const color = EDGE_COLORS[pairKey] || EDGE_COLORS.default;
  const label = EDGE_LABELS[pairKey];

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
    borderRadius: 8,
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: color,
          strokeWidth: selected ? 2.5 : 1.5,
          opacity: selected ? 1 : 0.6,
          strokeDasharray: pairKey === "image-generate" ? "6 3" : "none",
        }}
        markerEnd={`url(#arrow-${color.replace("#", "")})`}
      />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: "none",
            }}
            className="nodrag nopan"
          >
            <span
              className="px-1.5 py-0.5 rounded text-[8px] font-medium backdrop-blur-sm border"
              style={{
                color,
                backgroundColor: `${color}15`,
                borderColor: `${color}30`,
              }}
            >
              {label}
            </span>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};

export default memo(CanvasEdge);
