import { useCallback } from 'react'
import type {
  CanvasNode,
  CanvasEdge,
  ResolvedNode,
  ContextMenuEvent,
  ViewportState,
} from 'system-canvas'
import { screenToCanvas } from 'system-canvas'

interface UseCanvasInteractionOptions {
  onNodeClick?: (node: CanvasNode) => void
  onNodeDoubleClick?: (node: CanvasNode) => void
  onEdgeClick?: (edge: CanvasEdge) => void
  onEdgeDoubleClick?: (edge: CanvasEdge) => void
  onContextMenu?: (event: ContextMenuEvent) => void
  /** Called when a navigable node (has ref) is clicked to initiate navigation */
  onNavigableNodeClick?: (node: ResolvedNode) => void
  viewport: React.RefObject<ViewportState>

  // Editable-mode extensions
  editable?: boolean
  onSelect?: (nodeId: string | null) => void
  /**
   * Called instead of `onSelect` when the user Shift-clicks a node.
   * Used for additive/toggle multi-selection. Edge selection is NOT
   * cleared on shift-click so the user can build a selection without
   * disrupting other UI state.
   */
  onToggleSelect?: (nodeId: string) => void
  onBeginEdit?: (node: ResolvedNode) => void
  onSelectEdge?: (edgeId: string | null) => void
  onBeginEditEdge?: (edge: CanvasEdge) => void
}

interface UseCanvasInteractionResult {
  handleNodeClick: (node: ResolvedNode, event: React.MouseEvent) => void
  handleNodeDoubleClick: (node: ResolvedNode, event: React.MouseEvent) => void
  handleNodeNavigate: (node: ResolvedNode, event: React.MouseEvent | React.KeyboardEvent) => void
  handleEdgeClick: (edge: CanvasEdge, event: React.MouseEvent) => void
  handleEdgeDoubleClick: (edge: CanvasEdge, event: React.MouseEvent) => void
  handleCanvasContextMenu: (event: React.MouseEvent) => void
  handleNodeContextMenu: (node: ResolvedNode, event: React.MouseEvent) => void
  handleEdgeContextMenu: (edge: CanvasEdge, event: React.MouseEvent) => void
  /** Background click — clears selection */
  handleCanvasClick: (event: React.MouseEvent) => void
}

export function useCanvasInteraction(
  options: UseCanvasInteractionOptions
): UseCanvasInteractionResult {
  const {
    onNodeClick,
    onNodeDoubleClick,
    onEdgeClick,
    onEdgeDoubleClick,
    onContextMenu,
    onNavigableNodeClick,
    viewport,
    editable,
    onSelect,
    onToggleSelect,
    onBeginEdit,
    onSelectEdge,
    onBeginEditEdge,
  } = options

  const handleNodeClick = useCallback(
    (node: ResolvedNode, event: React.MouseEvent) => {
      event.stopPropagation()
      if (editable) {
        if (event.shiftKey && onToggleSelect) {
          // Shift-click: toggle this node in/out of the multi-selection.
          // Do NOT clear edge selection — the user is building a set.
          onToggleSelect(node.id)
        } else {
          onSelect?.(node.id)
          onSelectEdge?.(null)
        }
      }
      onNodeClick?.(node)
    },
    [editable, onNodeClick, onSelect, onToggleSelect, onSelectEdge]
  )

  const handleNodeDoubleClick = useCallback(
    (node: ResolvedNode, event: React.MouseEvent) => {
      event.stopPropagation()
      onNodeDoubleClick?.(node)
      if (editable) {
        onBeginEdit?.(node)
      }
    },
    [editable, onNodeDoubleClick, onBeginEdit]
  )

  const handleNodeNavigate = useCallback(
    (node: ResolvedNode, _event: React.MouseEvent | React.KeyboardEvent) => {
      if (node.isNavigable) {
        onNavigableNodeClick?.(node)
      }
    },
    [onNavigableNodeClick]
  )

  const handleEdgeClick = useCallback(
    (edge: CanvasEdge, event: React.MouseEvent) => {
      event.stopPropagation()
      if (editable) {
        onSelectEdge?.(edge.id)
        onSelect?.(null)
      }
      onEdgeClick?.(edge)
    },
    [editable, onEdgeClick, onSelectEdge, onSelect]
  )

  const handleEdgeDoubleClick = useCallback(
    (edge: CanvasEdge, event: React.MouseEvent) => {
      event.stopPropagation()
      onEdgeDoubleClick?.(edge)
      if (editable) {
        onBeginEditEdge?.(edge)
      }
    },
    [editable, onEdgeDoubleClick, onBeginEditEdge]
  )

  const createContextMenuHandler = useCallback(
    (
      type: ContextMenuEvent['type'],
      target?: CanvasNode | CanvasEdge
    ) => {
      return (event: React.MouseEvent) => {
        event.preventDefault()
        event.stopPropagation()
        if (!onContextMenu) return

        const canvasPos = screenToCanvas(
          event.clientX,
          event.clientY,
          viewport.current
        )
        onContextMenu({
          type,
          target,
          position: canvasPos,
          // Raw viewport coords from the original MouseEvent. Consumers
          // rendering a `position: fixed` floating menu need these — the
          // canvas-space `position` would be wrong because it walks
          // with the user's pan/zoom.
          screenPosition: { x: event.clientX, y: event.clientY },
        })
      }
    },
    [onContextMenu, viewport]
  )

  const handleCanvasContextMenu = useCallback(
    (event: React.MouseEvent) => {
      createContextMenuHandler('canvas')(event)
    },
    [createContextMenuHandler]
  )

  const handleNodeContextMenu = useCallback(
    (node: ResolvedNode, event: React.MouseEvent) => {
      createContextMenuHandler('node', node)(event)
    },
    [createContextMenuHandler]
  )

  const handleEdgeContextMenu = useCallback(
    (edge: CanvasEdge, event: React.MouseEvent) => {
      createContextMenuHandler('edge', edge)(event)
    },
    [createContextMenuHandler]
  )

  const handleCanvasClick = useCallback(
    (_event: React.MouseEvent) => {
      if (editable) {
        onSelect?.(null)
        onSelectEdge?.(null)
      }
    },
    [editable, onSelect, onSelectEdge]
  )

  return {
    handleNodeClick,
    handleNodeDoubleClick,
    handleNodeNavigate,
    handleEdgeClick,
    handleEdgeDoubleClick,
    handleCanvasContextMenu,
    handleNodeContextMenu,
    handleEdgeContextMenu,
    handleCanvasClick,
  }
}
