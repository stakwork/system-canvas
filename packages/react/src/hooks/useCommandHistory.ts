import { useRef, useState, useCallback } from 'react'
import type { CanvasNode, CanvasEdge, NodeUpdate, EdgeUpdate } from 'system-canvas'

// ---------------------------------------------------------------------------
// Command union type
// ---------------------------------------------------------------------------

export type CanvasCommand =
  | { type: 'node:add'; node: CanvasNode; canvasRef: string | undefined }
  | { type: 'node:delete'; node: CanvasNode; canvasRef: string | undefined }
  | {
      type: 'node:update'
      id: string
      prev: NodeUpdate
      patch: NodeUpdate
      canvasRef: string | undefined
    }
  | {
      type: 'nodes:update'
      updates: { id: string; prev: NodeUpdate; patch: NodeUpdate }[]
      canvasRef: string | undefined
    }
  | { type: 'nodes:delete'; nodes: CanvasNode[]; canvasRef: string | undefined }
  | { type: 'edge:add'; edge: CanvasEdge; canvasRef: string | undefined }
  | { type: 'edge:delete'; edge: CanvasEdge; canvasRef: string | undefined }
  | {
      type: 'edge:update'
      id: string
      prev: EdgeUpdate
      patch: EdgeUpdate
      canvasRef: string | undefined
    }
  | {
      type: 'custom'
      forward: () => void
      backward: () => void
      canvasRef: string | undefined
    }
  | { type: 'batch'; commands: CanvasCommand[] }

// ---------------------------------------------------------------------------
// Hook options / return type
// ---------------------------------------------------------------------------

export interface UseCommandHistoryOptions {
  nodesRef: React.RefObject<CanvasNode[]>
  edgesRef: React.RefObject<CanvasEdge[]>
  onNodeAdd?: (node: CanvasNode, canvasRef: string | undefined) => void
  onNodeUpdate?: (id: string, patch: NodeUpdate, canvasRef: string | undefined) => void
  onNodesUpdate?: (
    updates: { id: string; patch: NodeUpdate }[],
    canvasRef: string | undefined
  ) => void
  onNodeDelete?: (nodeId: string, canvasRef: string | undefined) => void
  onNodesDelete?: (nodeIds: string[], canvasRef: string | undefined) => void
  onEdgeAdd?: (edge: CanvasEdge, canvasRef: string | undefined) => void
  onEdgeUpdate?: (id: string, patch: EdgeUpdate, canvasRef: string | undefined) => void
  onEdgeDelete?: (edgeId: string, canvasRef: string | undefined) => void
  maxDepth?: number
  enabled?: boolean
  onUndo?: (canvasRef: string | undefined) => void
  onRedo?: (canvasRef: string | undefined) => void
}

export interface UseCommandHistoryReturn {
  wrappedOnNodeAdd: (node: CanvasNode, canvasRef: string | undefined) => void
  wrappedOnNodeUpdate: (id: string, patch: NodeUpdate, canvasRef: string | undefined) => void
  wrappedOnNodesUpdate: (
    updates: { id: string; patch: NodeUpdate }[],
    canvasRef: string | undefined
  ) => void
  wrappedOnNodeDelete: (nodeId: string, canvasRef: string | undefined) => void
  wrappedOnNodesDelete: (nodeIds: string[], canvasRef: string | undefined) => void
  wrappedOnEdgeAdd: (edge: CanvasEdge, canvasRef: string | undefined) => void
  wrappedOnEdgeUpdate: (id: string, patch: EdgeUpdate, canvasRef: string | undefined) => void
  wrappedOnEdgeDelete: (edgeId: string, canvasRef: string | undefined) => void
  pushUndoEntry: (entry: {
    forward: () => void
    backward: () => void
    canvasRef?: string
  }) => void
  beginBatch: () => void
  endBatch: () => void
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getCanvasRef(cmd: CanvasCommand): string | undefined {
  if (cmd.type === 'batch') {
    return cmd.commands.length > 0 ? getCanvasRef(cmd.commands[0]) : undefined
  }
  return cmd.canvasRef
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCommandHistory(
  options: UseCommandHistoryOptions
): UseCommandHistoryReturn {
  const {
    nodesRef,
    edgesRef,
    onNodeAdd,
    onNodeUpdate,
    onNodesUpdate,
    onNodeDelete,
    onNodesDelete,
    onEdgeAdd,
    onEdgeUpdate,
    onEdgeDelete,
    maxDepth = 50,
    enabled = true,
    onUndo,
    onRedo,
  } = options

  // Keep mutable callbacks in refs so closures never go stale
  const onNodeAddRef = useRef(onNodeAdd)
  onNodeAddRef.current = onNodeAdd
  const onNodeUpdateRef = useRef(onNodeUpdate)
  onNodeUpdateRef.current = onNodeUpdate
  const onNodesUpdateRef = useRef(onNodesUpdate)
  onNodesUpdateRef.current = onNodesUpdate
  const onNodeDeleteRef = useRef(onNodeDelete)
  onNodeDeleteRef.current = onNodeDelete
  const onNodesDeleteRef = useRef(onNodesDelete)
  onNodesDeleteRef.current = onNodesDelete
  const onEdgeAddRef = useRef(onEdgeAdd)
  onEdgeAddRef.current = onEdgeAdd
  const onEdgeUpdateRef = useRef(onEdgeUpdate)
  onEdgeUpdateRef.current = onEdgeUpdate
  const onEdgeDeleteRef = useRef(onEdgeDelete)
  onEdgeDeleteRef.current = onEdgeDelete

  const undoStack = useRef<CanvasCommand[]>([])
  const redoStack = useRef<CanvasCommand[]>([])
  const isUndoingRef = useRef(false)
  const pendingBatchRef = useRef<CanvasCommand[] | null>(null)

  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

  function syncBooleans() {
    setCanUndo(undoStack.current.length > 0)
    setCanRedo(redoStack.current.length > 0)
  }

  function pushCommand(cmd: CanvasCommand) {
    if (pendingBatchRef.current) {
      pendingBatchRef.current.push(cmd)
      return
    }
    undoStack.current.push(cmd)
    if (undoStack.current.length > maxDepth) undoStack.current.shift()
    redoStack.current = []
    syncBooleans()
  }

  // Apply the inverse of a command (for undo)
  function applyInverse(cmd: CanvasCommand) {
    switch (cmd.type) {
      case 'node:add':
        onNodeDeleteRef.current?.(cmd.node.id, cmd.canvasRef)
        break
      case 'node:delete':
        onNodeAddRef.current?.(cmd.node, cmd.canvasRef)
        break
      case 'node:update':
        onNodeUpdateRef.current?.(cmd.id, cmd.prev, cmd.canvasRef)
        break
      case 'nodes:update':
        onNodesUpdateRef.current?.(
          cmd.updates.map((u) => ({ id: u.id, patch: u.prev })),
          cmd.canvasRef
        )
        break
      case 'nodes:delete':
        for (const node of cmd.nodes) {
          onNodeAddRef.current?.(node, cmd.canvasRef)
        }
        break
      case 'edge:add':
        onEdgeDeleteRef.current?.(cmd.edge.id, cmd.canvasRef)
        break
      case 'edge:delete':
        onEdgeAddRef.current?.(cmd.edge, cmd.canvasRef)
        break
      case 'edge:update':
        onEdgeUpdateRef.current?.(cmd.id, cmd.prev, cmd.canvasRef)
        break
      case 'custom':
        cmd.backward()
        break
      case 'batch':
        // Reverse order for batch undo
        for (let i = cmd.commands.length - 1; i >= 0; i--) {
          applyInverse(cmd.commands[i])
        }
        break
    }
  }

  // Apply the forward direction of a command (for redo)
  function applyForward(cmd: CanvasCommand) {
    switch (cmd.type) {
      case 'node:add':
        onNodeAddRef.current?.(cmd.node, cmd.canvasRef)
        break
      case 'node:delete':
        onNodeDeleteRef.current?.(cmd.node.id, cmd.canvasRef)
        break
      case 'node:update':
        onNodeUpdateRef.current?.(cmd.id, cmd.patch, cmd.canvasRef)
        break
      case 'nodes:update':
        onNodesUpdateRef.current?.(
          cmd.updates.map((u) => ({ id: u.id, patch: u.patch })),
          cmd.canvasRef
        )
        break
      case 'nodes:delete':
        onNodesDeleteRef.current?.(
          cmd.nodes.map((n) => n.id),
          cmd.canvasRef
        )
        break
      case 'edge:add':
        onEdgeAddRef.current?.(cmd.edge, cmd.canvasRef)
        break
      case 'edge:delete':
        onEdgeDeleteRef.current?.(cmd.edge.id, cmd.canvasRef)
        break
      case 'edge:update':
        onEdgeUpdateRef.current?.(cmd.id, cmd.patch, cmd.canvasRef)
        break
      case 'custom':
        cmd.forward()
        break
      case 'batch':
        for (const c of cmd.commands) {
          applyForward(c)
        }
        break
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  const undo = useCallback(() => {
    if (!enabled) return
    const cmd = undoStack.current.pop()
    if (!cmd) return
    isUndoingRef.current = true
    applyInverse(cmd)
    isUndoingRef.current = false
    redoStack.current.push(cmd)
    syncBooleans()
    onUndo?.(getCanvasRef(cmd))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, onUndo])

  const redo = useCallback(() => {
    if (!enabled) return
    const cmd = redoStack.current.pop()
    if (!cmd) return
    isUndoingRef.current = true
    applyForward(cmd)
    isUndoingRef.current = false
    undoStack.current.push(cmd)
    if (undoStack.current.length > maxDepth) undoStack.current.shift()
    syncBooleans()
    onRedo?.(getCanvasRef(cmd))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, onRedo, maxDepth])

  const pushUndoEntry = useCallback(
    (entry: { forward: () => void; backward: () => void; canvasRef?: string }) => {
      if (!enabled) return
      pushCommand({
        type: 'custom',
        forward: entry.forward,
        backward: entry.backward,
        canvasRef: entry.canvasRef,
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled]
  )

  const beginBatch = useCallback(() => {
    if (!enabled) return
    pendingBatchRef.current = []
  }, [enabled])

  const endBatch = useCallback(() => {
    if (!enabled) return
    const cmds = pendingBatchRef.current
    pendingBatchRef.current = null
    if (!cmds || cmds.length === 0) return
    if (cmds.length === 1) {
      pushCommand(cmds[0])
      return
    }
    undoStack.current.push({ type: 'batch', commands: cmds })
    if (undoStack.current.length > maxDepth) undoStack.current.shift()
    redoStack.current = []
    syncBooleans()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, maxDepth])

  // ---------------------------------------------------------------------------
  // Wrapped callbacks
  // ---------------------------------------------------------------------------

  const wrappedOnNodeAdd = useCallback(
    (node: CanvasNode, canvasRef: string | undefined) => {
      if (enabled && !isUndoingRef.current) {
        pushCommand({ type: 'node:add', node, canvasRef })
      }
      onNodeAddRef.current?.(node, canvasRef)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled]
  )

  const wrappedOnNodeUpdate = useCallback(
    (id: string, patch: NodeUpdate, canvasRef: string | undefined) => {
      if (enabled && !isUndoingRef.current) {
        const node = nodesRef.current?.find((n) => n.id === id)
        if (node) {
          const prev = Object.fromEntries(
            Object.keys(patch).map((k) => [k, (node as unknown as Record<string, unknown>)[k]])
          ) as NodeUpdate
          pushCommand({ type: 'node:update', id, prev, patch, canvasRef })
        }
      }
      onNodeUpdateRef.current?.(id, patch, canvasRef)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled, nodesRef]
  )

  const wrappedOnNodesUpdate = useCallback(
    (updates: { id: string; patch: NodeUpdate }[], canvasRef: string | undefined) => {
      if (enabled && !isUndoingRef.current) {
        const enriched: { id: string; prev: NodeUpdate; patch: NodeUpdate }[] = []
        for (const u of updates) {
          const node = nodesRef.current?.find((n) => n.id === u.id)
          if (node) {
            const prev = Object.fromEntries(
              Object.keys(u.patch).map((k) => [k, (node as unknown as Record<string, unknown>)[k]])
            ) as NodeUpdate
            enriched.push({ id: u.id, prev, patch: u.patch })
          }
        }
        if (enriched.length > 0) {
          pushCommand({ type: 'nodes:update', updates: enriched, canvasRef })
        }
      }
      onNodesUpdateRef.current?.(updates, canvasRef)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled, nodesRef]
  )

  const wrappedOnNodeDelete = useCallback(
    (nodeId: string, canvasRef: string | undefined) => {
      if (enabled && !isUndoingRef.current) {
        const node = nodesRef.current?.find((n) => n.id === nodeId)
        if (node) {
          pushCommand({ type: 'node:delete', node, canvasRef })
        }
      }
      onNodeDeleteRef.current?.(nodeId, canvasRef)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled, nodesRef]
  )

  const wrappedOnNodesDelete = useCallback(
    (nodeIds: string[], canvasRef: string | undefined) => {
      if (enabled && !isUndoingRef.current) {
        const nodes = nodesRef.current?.filter((n) => nodeIds.includes(n.id)) ?? []
        if (nodes.length > 0) {
          pushCommand({ type: 'nodes:delete', nodes, canvasRef })
        }
      }
      onNodesDeleteRef.current?.(nodeIds, canvasRef)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled, nodesRef]
  )

  const wrappedOnEdgeAdd = useCallback(
    (edge: CanvasEdge, canvasRef: string | undefined) => {
      if (enabled && !isUndoingRef.current) {
        pushCommand({ type: 'edge:add', edge, canvasRef })
      }
      onEdgeAddRef.current?.(edge, canvasRef)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled]
  )

  const wrappedOnEdgeUpdate = useCallback(
    (id: string, patch: EdgeUpdate, canvasRef: string | undefined) => {
      if (enabled && !isUndoingRef.current) {
        const edge = edgesRef.current?.find((e) => e.id === id)
        if (edge) {
          const prev = Object.fromEntries(
            Object.keys(patch).map((k) => [k, (edge as unknown as Record<string, unknown>)[k]])
          ) as EdgeUpdate
          pushCommand({ type: 'edge:update', id, prev, patch, canvasRef })
        }
      }
      onEdgeUpdateRef.current?.(id, patch, canvasRef)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled, edgesRef]
  )

  const wrappedOnEdgeDelete = useCallback(
    (edgeId: string, canvasRef: string | undefined) => {
      if (enabled && !isUndoingRef.current) {
        const edge = edgesRef.current?.find((e) => e.id === edgeId)
        if (edge) {
          pushCommand({ type: 'edge:delete', edge, canvasRef })
        }
      }
      onEdgeDeleteRef.current?.(edgeId, canvasRef)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled, edgesRef]
  )

  return {
    wrappedOnNodeAdd,
    wrappedOnNodeUpdate,
    wrappedOnNodesUpdate,
    wrappedOnNodeDelete,
    wrappedOnNodesDelete,
    wrappedOnEdgeAdd,
    wrappedOnEdgeUpdate,
    wrappedOnEdgeDelete,
    pushUndoEntry,
    beginBatch,
    endBatch,
    undo,
    redo,
    canUndo,
    canRedo,
  }
}
