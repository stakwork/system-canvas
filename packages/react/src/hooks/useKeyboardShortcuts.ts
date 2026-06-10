import { useCallback } from 'react'
import type React from 'react'
import type {
  CanvasNode,
  CanvasEdge,
  CanvasTheme,
  ResolvedNode,
  NodeUpdate,
} from 'system-canvas'
import { generateNodeId, generateEdgeId } from 'system-canvas'
import type { NodeContextMenuOverlayState } from '../components/NodeContextMenuOverlay.js'
import type { EdgeContextMenuOverlayState } from '../components/EdgeContextMenuOverlay.js'
import type { CanvasContextMenuOverlayState } from 'system-canvas'

interface NodeDragUpdate {
  id: string
  patch: NodeUpdate
}

interface UseKeyboardShortcutsOptions {
  editable: boolean
  editingId: string | null
  editingEdgeId: string | null
  selectedIds: Set<string>
  selectedEdgeId: string | null
  nodesRef: React.RefObject<ResolvedNode[]>
  edgesRef: React.RefObject<CanvasEdge[]>
  theme: CanvasTheme
  currentCanvasRef: string | undefined
  contextMenuState: NodeContextMenuOverlayState | null
  // mutation callbacks
  wrappedOnNodeAdd: (node: CanvasNode, canvasRef: string | undefined) => void
  wrappedOnEdgeAdd: (edge: CanvasEdge, canvasRef: string | undefined) => void
  wrappedOnNodeUpdate: (id: string, patch: NodeUpdate, canvasRef: string | undefined) => void
  wrappedOnNodesUpdate: (updates: NodeDragUpdate[], canvasRef: string | undefined) => void
  wrappedOnNodeDelete: (id: string, canvasRef: string | undefined) => void
  wrappedOnNodesDelete: (ids: string[], canvasRef: string | undefined) => void
  wrappedOnEdgeDelete: (id: string, canvasRef: string | undefined) => void
  onNodesUpdate: ((updates: NodeDragUpdate[], canvasRef: string | undefined) => void) | undefined
  onNodeUpdate: ((id: string, patch: NodeUpdate, canvasRef: string | undefined) => void) | undefined
  beginBatch: () => void
  endBatch: () => void
  undo: () => void
  redo: () => void
  // selection
  selectNode: (id: string) => void
  selectMultiple: (ids: string[]) => void
  selectAll: () => void
  clearSelection: () => void
  // setters
  setEditingId: (id: string | null) => void
  setEditingEdgeId: (id: string | null) => void
  setSelectedEdgeId: (id: string | null) => void
  setContextMenuState: (state: NodeContextMenuOverlayState | null) => void
  edgeContextMenuState: EdgeContextMenuOverlayState | null
  setEdgeContextMenuState: (state: EdgeContextMenuOverlayState | null) => void
  canvasContextMenuState: CanvasContextMenuOverlayState | null
  setCanvasContextMenuState: (state: CanvasContextMenuOverlayState | null) => void
  cancelDrag: () => void
  fitSelection?: () => void
}

export function useKeyboardShortcuts(options: UseKeyboardShortcutsOptions) {
  const {
    editable,
    editingId,
    editingEdgeId,
    selectedIds,
    selectedEdgeId,
    nodesRef,
    edgesRef,
    theme,
    currentCanvasRef,
    contextMenuState,
    wrappedOnNodeAdd,
    wrappedOnEdgeAdd,
    wrappedOnNodeUpdate,
    wrappedOnNodesUpdate,
    wrappedOnNodeDelete,
    wrappedOnNodesDelete,
    wrappedOnEdgeDelete,
    onNodesUpdate,
    beginBatch,
    endBatch,
    undo,
    redo,
    selectNode,
    selectMultiple,
    selectAll,
    clearSelection,
    setEditingId,
    setEditingEdgeId,
    setSelectedEdgeId,
    setContextMenuState,
    edgeContextMenuState,
    setEdgeContextMenuState,
    canvasContextMenuState,
    setCanvasContextMenuState,
    cancelDrag,
    fitSelection,
  } = options

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const meta = e.metaKey
      const ctrl = e.ctrlKey
      const shift = e.shiftKey
      const key = e.key

      // F / Cmd+Shift+F — fit selected nodes (or all if nothing selected)
      // Runs in read-only mode; blocked while inline-editing a label
      if (
        (key === 'f' && !meta && !ctrl && !shift) ||
        ((meta || ctrl) && shift && key === 'F')
      ) {
        if (editingId || editingEdgeId) return
        e.preventDefault()
        fitSelection?.()
        return
      }

      if (!editable) return

      // Escape — layered dismissal
      if (e.key === 'Escape') {
        if (canvasContextMenuState) {
          setCanvasContextMenuState(null)
          return
        }
        if (contextMenuState) {
          setContextMenuState(null)
          return
        }
        if (edgeContextMenuState) {
          setEdgeContextMenuState(null)
          return
        }
        if (editingId || editingEdgeId) {
          setEditingId(null)
          setEditingEdgeId(null)
          return
        }
        if (selectedIds.size > 0 || selectedEdgeId) {
          clearSelection()
          setSelectedEdgeId(null)
          cancelDrag()
          return
        }
        return
      }

      // Let the inline editor handle all other keys when active
      if (editingId || editingEdgeId) return

      // Let native text inputs (e.g. search overlay) handle their own keys —
      // bail out for any shortcut that would conflict with text editing.
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      // Undo / Redo
      if ((meta || ctrl) && !shift && key === 'z') {
        e.preventDefault()
        undo()
        return
      }
      if ((meta || ctrl) && shift && key === 'z') {
        e.preventDefault()
        redo()
        return
      }

      // Cmd+A — select all
      if ((meta || ctrl) && key === 'a') {
        e.preventDefault()
        selectAll()
        return
      }

      // Delete / Backspace — remove selected node(s) or edge
      if (key === 'Delete' || key === 'Backspace') {
        if (selectedIds.size > 1) {
          e.preventDefault()
          wrappedOnNodesDelete(Array.from(selectedIds), currentCanvasRef)
          clearSelection()
        } else if (selectedIds.size === 1) {
          const id = Array.from(selectedIds)[0]
          e.preventDefault()
          wrappedOnNodeDelete(id, currentCanvasRef)
          clearSelection()
        } else if (selectedEdgeId) {
          e.preventDefault()
          wrappedOnEdgeDelete(selectedEdgeId, currentCanvasRef)
          setSelectedEdgeId(null)
        }
        return
      }

      // Arrow keys — nudge selected node(s)
      if (
        key === 'ArrowUp' ||
        key === 'ArrowDown' ||
        key === 'ArrowLeft' ||
        key === 'ArrowRight'
      ) {
        if (selectedIds.size === 0) return
        const gridSize = theme.grid?.size ?? 40
        const nudge = shift ? gridSize * 10 : gridSize
        const dx =
          key === 'ArrowLeft' ? -nudge : key === 'ArrowRight' ? nudge : 0
        const dy =
          key === 'ArrowUp' ? -nudge : key === 'ArrowDown' ? nudge : 0

        const nodes = nodesRef.current ?? []
        const updates: NodeDragUpdate[] = []
        for (const id of selectedIds) {
          const node = nodes.find((n) => n.id === id)
          if (node) {
            updates.push({ id, patch: { x: node.x + dx, y: node.y + dy } })
          }
        }
        if (updates.length === 0) return

        if (onNodesUpdate) {
          wrappedOnNodesUpdate(updates, currentCanvasRef)
        } else {
          for (const { id, patch } of updates) {
            wrappedOnNodeUpdate(id, patch, currentCanvasRef)
          }
        }
        e.preventDefault()
        return
      }

      // Tab / Shift+Tab — cycle through nodes spatially
      if (key === 'Tab') {
        const nodes = nodesRef.current ?? []
        if (nodes.length === 0) return
        const sorted = [...nodes].sort((a, b) =>
          a.y !== b.y ? a.y - b.y : a.x - b.x
        )
        if (selectedIds.size === 0) {
          selectNode(sorted[0].id)
        } else {
          const currentId = Array.from(selectedIds)[0]
          const index = sorted.findIndex((n) => n.id === currentId)
          const nextIndex =
            ((index + (shift ? -1 : 1)) + sorted.length) % sorted.length
          selectNode(sorted[nextIndex].id)
        }
        e.preventDefault()
        return
      }

      // Cmd+D — duplicate selected nodes (and internal edges)
      if ((meta || ctrl) && !shift && key === 'd') {
        if (selectedIds.size === 0) return
        e.preventDefault()

        const nodes = nodesRef.current ?? []
        const edges = edgesRef.current ?? []
        const gridSize = theme.grid?.size ?? 40

        // Map old id -> new id
        const oldToNew = new Map<string, string>()
        for (const id of selectedIds) {
          oldToNew.set(id, generateNodeId())
        }

        // Clone nodes with new IDs and offset position
        const clonedNodes: CanvasNode[] = []
        for (const id of selectedIds) {
          const node = nodes.find((n) => n.id === id)
          if (!node) continue
          const newId = oldToNew.get(id)!
          clonedNodes.push({
            ...structuredClone(node as unknown as Record<string, unknown>),
            id: newId,
            x: node.x + gridSize,
            y: node.y + gridSize,
          } as unknown as CanvasNode)
        }

        // Clone edges where both endpoints are in the selection
        const clonedEdges: CanvasEdge[] = []
        for (const edge of edges) {
          if (selectedIds.has(edge.fromNode) && selectedIds.has(edge.toNode)) {
            clonedEdges.push({
              ...structuredClone(edge as unknown as Record<string, unknown>),
              id: generateEdgeId(),
              fromNode: oldToNew.get(edge.fromNode)!,
              toNode: oldToNew.get(edge.toNode)!,
            } as unknown as CanvasEdge)
          }
        }

        beginBatch()
        for (const node of clonedNodes) {
          wrappedOnNodeAdd(node, currentCanvasRef)
        }
        for (const edge of clonedEdges) {
          wrappedOnEdgeAdd(edge, currentCanvasRef)
        }
        endBatch()

        selectMultiple([...oldToNew.values()])
        return
      }

      // Cmd+Shift+G — ungroup
      if ((meta || ctrl) && shift && key === 'g') {
        if (selectedIds.size !== 1) return
        const nodeId = Array.from(selectedIds)[0]
        const nodes = nodesRef.current ?? []
        const node = nodes.find((n) => n.id === nodeId)
        if (!node || node.type !== 'group') return
        e.preventDefault()
        wrappedOnNodeDelete(node.id, currentCanvasRef)
        clearSelection()
        return
      }

      // Cmd+G — group selected nodes
      if ((meta || ctrl) && !shift && key === 'g') {
        if (selectedIds.size < 2) return
        e.preventDefault()

        const nodes = nodesRef.current ?? []
        const selectedNodes = nodes.filter((n) => selectedIds.has(n.id))
        if (selectedNodes.length < 2) return

        const gridSize = theme.grid?.size ?? 40
        let minX = Infinity
        let minY = Infinity
        let maxX = -Infinity
        let maxY = -Infinity

        for (const node of selectedNodes) {
          minX = Math.min(minX, node.x)
          minY = Math.min(minY, node.y)
          maxX = Math.max(maxX, node.x + node.width)
          maxY = Math.max(maxY, node.y + node.height)
        }

        const groupNode: CanvasNode = {
          id: generateNodeId(),
          type: 'group',
          x: minX - gridSize,
          y: minY - gridSize,
          width: (maxX - minX) + 2 * gridSize,
          height: (maxY - minY) + 2 * gridSize,
          label: '',
        }

        wrappedOnNodeAdd(groupNode, currentCanvasRef)
        selectNode(groupNode.id)
        return
      }
    },
    [
      editable,
      editingId,
      editingEdgeId,
      selectedIds,
      selectedEdgeId,
      nodesRef,
      edgesRef,
      theme,
      currentCanvasRef,
      contextMenuState,
      edgeContextMenuState,
      wrappedOnNodeAdd,
      wrappedOnEdgeAdd,
      wrappedOnNodeUpdate,
      wrappedOnNodesUpdate,
      wrappedOnNodeDelete,
      wrappedOnNodesDelete,
      wrappedOnEdgeDelete,
      onNodesUpdate,
      beginBatch,
      endBatch,
      undo,
      redo,
      selectNode,
      selectMultiple,
      selectAll,
      clearSelection,
      setEditingId,
      setEditingEdgeId,
      setSelectedEdgeId,
      setContextMenuState,
      canvasContextMenuState,
      setCanvasContextMenuState,
      cancelDrag,
      fitSelection,
    ]
  )

  return handleKeyDown
}
