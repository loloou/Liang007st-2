// ─────────────────────────────────────────────────────────────────────────────
//  NodePorts.tsx — Shared input/output port circles for all node types
//
//  Input port: left edge, vertically centered
//  Output port: right edge, vertically centered
//  12px diameter, indigo-500 bg, hover/active states
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback } from 'react'

interface NodePortsProps {
  nodeId: string
  nodeHeight: number
  onPortMouseDown: (nodeId: string, portType: 'input' | 'output', e: React.MouseEvent) => void
  showInput?: boolean
  showOutput?: boolean
}

const PORT_SIZE = 12

const NodePorts: React.FC<NodePortsProps> = ({
  nodeId,
  nodeHeight,
  onPortMouseDown,
  showInput = true,
  showOutput = true,
}) => {
  const handleInputDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onPortMouseDown(nodeId, 'input', e)
    },
    [nodeId, onPortMouseDown],
  )

  const handleOutputDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onPortMouseDown(nodeId, 'output', e)
    },
    [nodeId, onPortMouseDown],
  )

  const centerY = nodeHeight / 2

  return (
    <>
      {/* Input port — left edge */}
      {showInput && (
        <div
          className="absolute z-10 cursor-crosshair rounded-full border-2 border-slate-900 bg-indigo-500 shadow-md transition-all duration-150 hover:scale-125 hover:bg-indigo-400 active:bg-indigo-300"
          style={{
            width: PORT_SIZE,
            height: PORT_SIZE,
            left: -(PORT_SIZE / 2),
            top: centerY - PORT_SIZE / 2,
          }}
          onMouseDown={handleInputDown}
          title="Input"
        />
      )}

      {/* Output port — right edge */}
      {showOutput && (
        <div
          className="absolute z-10 cursor-crosshair rounded-full border-2 border-slate-900 bg-indigo-500 shadow-md transition-all duration-150 hover:scale-125 hover:bg-indigo-400 active:bg-indigo-300"
          style={{
            width: PORT_SIZE,
            height: PORT_SIZE,
            right: -(PORT_SIZE / 2),
            top: centerY - PORT_SIZE / 2,
          }}
          onMouseDown={handleOutputDown}
          title="Output"
        />
      )}
    </>
  )
}

export default React.memo(NodePorts)
