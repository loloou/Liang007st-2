import type { SmartNode } from '../types'
import { uid } from '../types'

// ── Public types ────────────────────────────────────────────────────────────

export type InteractionMode = 'idle' | 'dragging' | 'selecting' | 'resizing' | 'connecting'

export interface DragState {
  nodeIds: string[]
  startX: number
  startY: number
  nodeStarts: Map<string, { x: number; y: number }>
}

export interface SelectionBox {
  x: number
  y: number
  width: number
  height: number
}

// ── Constants ───────────────────────────────────────────────────────────────

const MIN_NODE_W = 160
const MIN_NODE_H = 100
const PASTE_OFFSET = 30
const DRAG_THRESHOLD = 3

// ── InteractionManager ─────────────────────────────────────────────────────

export class InteractionManager {
  private selectedIds: Set<string> = new Set()
  private mode: InteractionMode = 'idle'

  // Drag state
  private dragState: DragState | null = null
  private dragCommitted = false

  // Resize state
  private resizeState: {
    nodeId: string
    startW: number
    startH: number
    startMouseX: number
    startMouseY: number
  } | null = null

  // Rubber-band selection
  private selectionBox: SelectionBox | null = null
  private selectionAnchor: { x: number; y: number } | null = null
  private preSelectionIds: Set<string> = new Set()

  // Copy buffer
  private clipboard: SmartNode[] = []
  private clipboardConnections: Array<{ from: string; to: string }> = []

  // Callbacks
  onChange?: () => void
  onNodesUpdate?: (updates: Array<{ id: string; patch: Partial<SmartNode> }>) => void
  onNodesPaste?: (nodes: SmartNode[], connections: Array<{ from: string; to: string }>) => void
  onDeleteNodes?: (ids: string[]) => void
  onUndo?: () => void
  onUndoPush?: () => void

  // ── Selection API ───────────────────────────────────────────────────────

  getSelected(): string[] {
    return Array.from(this.selectedIds)
  }

  isSelected(id: string): boolean {
    return this.selectedIds.has(id)
  }

  select(id: string, additive = false): void {
    if (!additive) {
      this.selectedIds.clear()
    }
    this.selectedIds.add(id)
    this.emitChange()
  }

  deselect(id: string): void {
    this.selectedIds.delete(id)
    this.emitChange()
  }

  toggleSelect(id: string): void {
    if (this.selectedIds.has(id)) {
      this.selectedIds.delete(id)
    } else {
      this.selectedIds.add(id)
    }
    this.emitChange()
  }

  selectAll(allIds: string[]): void {
    this.selectedIds.clear()
    for (const id of allIds) {
      this.selectedIds.add(id)
    }
    this.emitChange()
  }

  clearSelection(): void {
    if (this.selectedIds.size === 0) return
    this.selectedIds.clear()
    this.emitChange()
  }

  getSelectionBox(): SelectionBox | null {
    return this.selectionBox
  }

  // ── Node mouse down ─────────────────────────────────────────────────────

  handleNodeMouseDown(
    nodeId: string,
    worldX: number,
    worldY: number,
    shiftKey: boolean,
    allNodes: SmartNode[],
  ): void {
    if (shiftKey) {
      // Additive toggle: add/remove from selection without starting drag yet
      this.toggleSelect(nodeId)
    } else if (!this.selectedIds.has(nodeId)) {
      // Click on an unselected node: clear others, select this one
      this.selectedIds.clear()
      this.selectedIds.add(nodeId)
      this.emitChange()
    }
    // If the node was already selected (and no shift), keep current selection
    // so the user can start a group drag.

    // Begin drag for all currently selected nodes
    const dragNodeIds = this.getSelected()
    if (dragNodeIds.length === 0) return

    const nodeStarts = new Map<string, { x: number; y: number }>()
    for (const id of dragNodeIds) {
      const node = allNodes.find(n => n.id === id)
      if (node) {
        nodeStarts.set(id, { x: node.x, y: node.y })
      }
    }

    this.dragState = {
      nodeIds: dragNodeIds,
      startX: worldX,
      startY: worldY,
      nodeStarts,
    }
    this.dragCommitted = false
    this.mode = 'dragging'
  }

  // ── Shell (background) mouse down ───────────────────────────────────────

  handleShellMouseDown(worldX: number, worldY: number, shiftKey: boolean): void {
    if (!shiftKey) {
      this.selectedIds.clear()
      this.emitChange()
    }

    // Snapshot current selection so we can merge additively
    this.preSelectionIds = new Set(this.selectedIds)

    this.selectionAnchor = { x: worldX, y: worldY }
    this.selectionBox = { x: worldX, y: worldY, width: 0, height: 0 }
    this.mode = 'selecting'
  }

  // ── Mouse move ──────────────────────────────────────────────────────────

  handleMouseMove(worldX: number, worldY: number, allNodes: SmartNode[]): void {
    switch (this.mode) {
      case 'dragging':
        this.handleDragMove(worldX, worldY)
        break
      case 'selecting':
        this.handleSelectionMove(worldX, worldY, allNodes)
        break
      case 'resizing':
        this.handleResizeMove(worldX, worldY)
        break
    }
  }

  // ── Mouse up ────────────────────────────────────────────────────────────

  handleMouseUp(allNodes: SmartNode[]): void {
    switch (this.mode) {
      case 'dragging':
        this.finalizeDrag()
        break
      case 'selecting':
        this.finalizeSelection(allNodes)
        break
      case 'resizing':
        this.finalizeResize()
        break
    }

    this.mode = 'idle'
  }

  // ── Resize handle mouse down ────────────────────────────────────────────

  handleResizeMouseDown(nodeId: string, worldX: number, worldY: number, node: SmartNode): void {
    this.onUndoPush?.()
    this.resizeState = {
      nodeId,
      startW: node.w,
      startH: node.h,
      startMouseX: worldX,
      startMouseY: worldY,
    }
    this.mode = 'resizing'

    // Ensure the resized node is selected
    if (!this.selectedIds.has(nodeId)) {
      this.selectedIds.clear()
      this.selectedIds.add(nodeId)
      this.emitChange()
    }
  }

  // ── Copy / Paste ────────────────────────────────────────────────────────

  copy(allNodes: SmartNode[], connections?: Array<{ from: string; to: string }>): void {
    const selectedSet = this.selectedIds
    if (selectedSet.size === 0) return

    // Deep-clone selected nodes
    this.clipboard = allNodes.filter(n => selectedSet.has(n.id)).map(n => structuredClone(n))

    // Keep only connections where both endpoints are in the selection
    if (connections) {
      this.clipboardConnections = connections.filter(
        c => selectedSet.has(c.from) && selectedSet.has(c.to),
      )
    } else {
      this.clipboardConnections = []
    }
  }

  paste(offsetX: number, offsetY: number): void {
    if (this.clipboard.length === 0) return

    // Build old-id → new-id mapping
    const idMap = new Map<string, string>()
    for (const node of this.clipboard) {
      idMap.set(node.id, uid(node.type))
    }

    // Clone nodes with new IDs and offset positions
    const pastedNodes: SmartNode[] = this.clipboard.map(n => {
      const clone = structuredClone(n)
      clone.id = idMap.get(n.id)!
      clone.x += offsetX
      clone.y += offsetY
      clone.createdAt = Date.now()
      clone.running = false
      clone.pending = 0
      clone.runStartedAt = undefined
      clone.runFinishedAt = undefined
      clone.runElapsedMs = undefined
      return clone
    })

    // Remap connections
    const pastedConnections = this.clipboardConnections
      .map(c => ({
        from: idMap.get(c.from)!,
        to: idMap.get(c.to)!,
      }))
      .filter(c => c.from && c.to)

    // Select the newly pasted nodes
    this.selectedIds.clear()
    for (const node of pastedNodes) {
      this.selectedIds.add(node.id)
    }

    this.onNodesPaste?.(pastedNodes, pastedConnections)
    this.emitChange()
  }

  // ── Delete ──────────────────────────────────────────────────────────────

  deleteSelected(): void {
    const ids = this.getSelected()
    if (ids.length === 0) return

    this.selectedIds.clear()
    this.onDeleteNodes?.(ids)
    this.emitChange()
  }

  // ── Duplicate ───────────────────────────────────────────────────────────

  duplicate(allNodes: SmartNode[]): SmartNode[] {
    const selectedSet = this.selectedIds
    if (selectedSet.size === 0) return []

    const idMap = new Map<string, string>()
    const duplicated: SmartNode[] = []

    for (const node of allNodes) {
      if (!selectedSet.has(node.id)) continue

      const newId = uid(node.type)
      idMap.set(node.id, newId)

      const clone = structuredClone(node)
      clone.id = newId
      clone.x += PASTE_OFFSET
      clone.y += PASTE_OFFSET
      clone.createdAt = Date.now()
      clone.running = false
      clone.pending = 0
      clone.runStartedAt = undefined
      clone.runFinishedAt = undefined
      clone.runElapsedMs = undefined
      duplicated.push(clone)
    }

    // Select the duplicated nodes
    this.selectedIds.clear()
    for (const node of duplicated) {
      this.selectedIds.add(node.id)
    }
    this.emitChange()

    return duplicated
  }

  // ── Keyboard handler ────────────────────────────────────────────────────

  handleKeyDown(
    e: KeyboardEvent,
    allNodes: SmartNode[],
    connections?: Array<{ from: string; to: string }>,
  ): boolean {
    const isMod = e.ctrlKey || e.metaKey

    // Ctrl+A — Select all
    if (isMod && e.key === 'a') {
      e.preventDefault()
      this.selectAll(allNodes.map(n => n.id))
      return true
    }

    // Ctrl+C — Copy
    if (isMod && e.key === 'c') {
      e.preventDefault()
      this.copy(allNodes, connections)
      return true
    }

    // Ctrl+V — Paste
    if (isMod && e.key === 'v') {
      e.preventDefault()
      this.paste(PASTE_OFFSET, PASTE_OFFSET)
      return true
    }

    // Ctrl+D — Duplicate
    if (isMod && e.key === 'd') {
      e.preventDefault()
      const duped = this.duplicate(allNodes)
      if (duped.length > 0) {
        this.onNodesPaste?.(duped, [])
      }
      return true
    }

    // Ctrl+Z — Undo
    if (isMod && e.key === 'z' && !e.shiftKey) {
      e.preventDefault()
      this.onUndo?.()
      return true
    }

    // Delete / Backspace — Delete selected
    if (e.key === 'Delete' || e.key === 'Backspace') {
      // Don't intercept if the user is typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || (e.target as HTMLElement)?.isContentEditable) {
        return false
      }
      e.preventDefault()
      this.deleteSelected()
      return true
    }

    // Escape — Clear selection
    if (e.key === 'Escape') {
      if (this.mode !== 'idle') {
        this.cancelInteraction()
        return true
      }
      if (this.selectedIds.size > 0) {
        this.clearSelection()
        return true
      }
      return false
    }

    return false
  }

  // ── Mode getter ─────────────────────────────────────────────────────────

  get currentMode(): InteractionMode {
    return this.mode
  }

  // ── Dispose ─────────────────────────────────────────────────────────────

  dispose(): void {
    this.selectedIds.clear()
    this.dragState = null
    this.resizeState = null
    this.selectionBox = null
    this.selectionAnchor = null
    this.clipboard = []
    this.clipboardConnections = []
    this.onChange = undefined
    this.onNodesUpdate = undefined
    this.onNodesPaste = undefined
    this.onDeleteNodes = undefined
    this.onUndo = undefined
    this.onUndoPush = undefined
    this.mode = 'idle'
  }

  // ── Private: drag ───────────────────────────────────────────────────────

  private handleDragMove(worldX: number, worldY: number): void {
    if (!this.dragState) return

    const dx = worldX - this.dragState.startX
    const dy = worldY - this.dragState.startY

    // Don't commit until we pass the drag threshold
    if (!this.dragCommitted) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return
      this.dragCommitted = true
      this.onUndoPush?.()
    }

    const updates: Array<{ id: string; patch: Partial<SmartNode> }> = []

    for (const id of this.dragState.nodeIds) {
      const start = this.dragState.nodeStarts.get(id)
      if (!start) continue
      updates.push({
        id,
        patch: {
          x: start.x + dx,
          y: start.y + dy,
        },
      })
    }

    if (updates.length > 0) {
      this.onNodesUpdate?.(updates)
    }
  }

  private finalizeDrag(): void {
    // Drag state is already applied via onNodesUpdate during move.
    // Nothing extra to do on mouse up.
    this.dragState = null
    this.dragCommitted = false
  }

  // ── Private: rubber-band selection ──────────────────────────────────────

  private handleSelectionMove(worldX: number, worldY: number, allNodes: SmartNode[]): void {
    if (!this.selectionAnchor) return

    const ax = this.selectionAnchor.x
    const ay = this.selectionAnchor.y

    // Compute the box (handle negative drag directions)
    const x = Math.min(ax, worldX)
    const y = Math.min(ay, worldY)
    const width = Math.abs(worldX - ax)
    const height = Math.abs(worldY - ay)

    this.selectionBox = { x, y, width, height }

    // Determine which nodes intersect the box
    const boxRight = x + width
    const boxBottom = y + height

    // Start from the pre-selection set (for additive / shift selection)
    const newSelection = new Set(this.preSelectionIds)

    for (const node of allNodes) {
      const nodeRight = node.x + node.w
      const nodeBottom = node.y + node.h

      // AABB intersection test
      const intersects = node.x < boxRight && nodeRight > x && node.y < boxBottom && nodeBottom > y

      if (intersects) {
        newSelection.add(node.id)
      }
    }

    // Apply selection if changed
    if (!setsEqual(this.selectedIds, newSelection)) {
      this.selectedIds = newSelection
      this.emitChange()
    }
  }

  private finalizeSelection(_allNodes: SmartNode[]): void {
    this.selectionBox = null
    this.selectionAnchor = null
    this.preSelectionIds.clear()
    this.emitChange()
  }

  // ── Private: resize ─────────────────────────────────────────────────────

  private handleResizeMove(worldX: number, worldY: number): void {
    if (!this.resizeState) return

    const dx = worldX - this.resizeState.startMouseX
    const dy = worldY - this.resizeState.startMouseY

    const newW = Math.max(MIN_NODE_W, this.resizeState.startW + dx)
    const newH = Math.max(MIN_NODE_H, this.resizeState.startH + dy)

    this.onNodesUpdate?.([
      {
        id: this.resizeState.nodeId,
        patch: { w: newW, h: newH },
      },
    ])
  }

  private finalizeResize(): void {
    this.resizeState = null
  }

  // ── Private: cancel ─────────────────────────────────────────────────────

  private cancelInteraction(): void {
    if (this.mode === 'dragging' && this.dragState && this.dragCommitted) {
      // Revert nodes to their original positions
      const updates: Array<{ id: string; patch: Partial<SmartNode> }> = []
      this.dragState.nodeStarts.forEach((start, id) => {
        updates.push({ id, patch: { x: start.x, y: start.y } })
      })
      if (updates.length > 0) {
        this.onNodesUpdate?.(updates)
      }
    }

    this.dragState = null
    this.dragCommitted = false
    this.resizeState = null
    this.selectionBox = null
    this.selectionAnchor = null
    this.preSelectionIds.clear()
    this.mode = 'idle'
    this.emitChange()
  }

  // ── Private: emit ───────────────────────────────────────────────────────

  private emitChange(): void {
    this.onChange?.()
  }
}

// ── Utilities ───────────────────────────────────────────────────────────────

function setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false
  let equal = true
  a.forEach(item => {
    if (!b.has(item)) equal = false
  })
  return equal
}
