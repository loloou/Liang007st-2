// ─────────────────────────────────────────────────────────────────────────────
//  ConnectionManager.ts — Manages connection state between SmartCanvas nodes
//
//  Responsibilities:
//   - Add / remove connections with duplicate & self-loop guards
//   - Query connections by node (inputs, outputs)
//   - Traverse the connection graph (upstream, downstream, chain)
//   - Serialize / deserialize for persistence
//   - Validate against live node IDs to prune dangling edges
// ─────────────────────────────────────────────────────────────────────────────

import type { NodeConnection, SmartNode } from '../types'

export class ConnectionManager {
  private connections: NodeConnection[] = []

  // ── Mutations ──────────────────────────────────────────────────────────

  /**
   * Add a connection between two nodes.
   *
   * Returns `false` (no-op) if:
   *  - `from === to` (self-loop)
   *  - an identical edge already exists
   */
  addConnection(from: string, to: string, kind: 'flow' | 'input' = 'flow'): boolean {
    if (from === to) return false
    const exists = this.connections.some(c => c.from === from && c.to === to)
    if (exists) return false

    this.connections.push({ from, to, kind })
    return true
  }

  /**
   * Remove a specific connection.  Returns `true` if the edge existed.
   */
  removeConnection(from: string, to: string): boolean {
    const idx = this.connections.findIndex(c => c.from === from && c.to === to)
    if (idx === -1) return false
    this.connections.splice(idx, 1)
    return true
  }

  /**
   * Remove *all* connections that reference the given node (both as source
   * and target).  Useful when a node is deleted from the canvas.
   */
  removeNodeConnections(nodeId: string): void {
    this.connections = this.connections.filter(c => c.from !== nodeId && c.to !== nodeId)
  }

  // ── Queries ────────────────────────────────────────────────────────────

  /** Return a shallow copy of every connection. */
  getAll(): NodeConnection[] {
    return [...this.connections]
  }

  /** Get the input and output connections for a specific node. */
  getNodeConnections(nodeId: string): {
    inputs: NodeConnection[]
    outputs: NodeConnection[]
  } {
    const inputs: NodeConnection[] = []
    const outputs: NodeConnection[] = []

    for (const c of this.connections) {
      if (c.to === nodeId) inputs.push(c)
      if (c.from === nodeId) outputs.push(c)
    }

    return { inputs, outputs }
  }

  /**
   * Return all nodes that have an edge pointing *to* the given node
   * (i.e. the node's direct predecessors).
   */
  getUpstreamNodes(nodeId: string, allNodes: SmartNode[]): SmartNode[] {
    const upstreamIds = new Set<string>()
    for (const c of this.connections) {
      if (c.to === nodeId) upstreamIds.add(c.from)
    }
    return allNodes.filter(n => upstreamIds.has(n.id))
  }

  /**
   * Return all nodes that the given node has an edge pointing *to*
   * (i.e. the node's direct successors).
   */
  getDownstreamNodes(nodeId: string, allNodes: SmartNode[]): SmartNode[] {
    const downstreamIds = new Set<string>()
    for (const c of this.connections) {
      if (c.from === nodeId) downstreamIds.add(c.to)
    }
    return allNodes.filter(n => downstreamIds.has(n.id))
  }

  /**
   * Follow the connection chain starting from `startId` via BFS.
   *
   * Returns an ordered list of node IDs representing a breadth-first
   * traversal of downstream nodes.  Cycles are safely ignored.
   *
   * This is used for cascade-run: when the user triggers a run on a node,
   * all downstream dependants should also execute in topological order.
   */
  getChain(startId: string): string[] {
    const visited = new Set<string>()
    const order: string[] = []
    const queue: string[] = [startId]

    while (queue.length > 0) {
      const current = queue.shift()!
      if (visited.has(current)) continue
      visited.add(current)
      order.push(current)

      for (const c of this.connections) {
        if (c.from === current && !visited.has(c.to)) {
          queue.push(c.to)
        }
      }
    }

    return order
  }

  // ── Serialization ──────────────────────────────────────────────────────

  /** Return a plain-object snapshot suitable for JSON persistence. */
  serialize(): NodeConnection[] {
    return this.connections.map(c => ({ ...c }))
  }

  /** Replace all connections with a deserialized snapshot. */
  deserialize(data: NodeConnection[]): void {
    this.connections = data.map(c => ({
      from: c.from,
      to: c.to,
      kind: c.kind ?? 'flow',
    }))
  }

  // ── Validation ─────────────────────────────────────────────────────────

  /**
   * Remove any connection whose `from` or `to` references a node that no
   * longer exists in the given set of IDs.
   */
  validate(nodeIds: Set<string>): void {
    this.connections = this.connections.filter(c => nodeIds.has(c.from) && nodeIds.has(c.to))
  }
}
