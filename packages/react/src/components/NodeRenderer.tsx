import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { CanvasData, ResolvedNode, CanvasTheme } from 'system-canvas'
import {
  computeReflowReservations,
  getCategorySlots,
  pickRefIndicatorCorner,
} from 'system-canvas'
import { TextNode } from './TextNode.js'
import { FileNode } from './FileNode.js'
import { LinkNode } from './LinkNode.js'
import { GroupNode } from './GroupNode.js'
import { ResizeHandles } from './ResizeHandles.js'
import { CategorySlotsLayer } from './CategorySlotsLayer.js'
import type { ResizeCorner } from '../hooks/useNodeResize.js'

interface NodeRendererProps {
  nodes: ResolvedNode[]
  theme: CanvasTheme
  onClick: (node: ResolvedNode, event: React.MouseEvent) => void
  onDoubleClick: (node: ResolvedNode, event: React.MouseEvent) => void
  onContextMenu: (node: ResolvedNode, event: React.MouseEvent) => void
  onNavigate: (node: ResolvedNode, event: React.MouseEvent) => void
  onPointerDown?: (node: ResolvedNode, event: React.PointerEvent) => void
  selectedIds?: Set<string> | null
  editingId?: string | null
  onResizeHandlePointerDown?: (
    node: ResolvedNode,
    corner: ResizeCorner,
    event: React.PointerEvent
  ) => void
  /**
   * Synchronous canvases map used by slot accessors (`ctx.rollup`,
   * `ctx.getSubCanvas`). Consumers typically pass the same map they give
   * to `SystemCanvas`.
   */
  canvases?: Record<string, CanvasData>
  /**
   * Render only a subset of nodes:
   *   'groups'     → only group nodes
   *   'non-groups' → everything except groups
   *   undefined    → all nodes (groups first, then others)
   * Callers can use this to interleave edges between groups and other nodes.
   */
  only?: 'groups' | 'non-groups'
  /** Nodes that should render at low opacity (search/category filter). */
  dimmedNodeIds?: Set<string>
  /** Nodes that should render with a highlight ring (search match). */
  highlightedNodeIds?: Set<string>
  /** The single currently-active search match — renders with a stronger stroke than other matches. */
  activeMatchNodeId?: string
}

/**
 * Renders all nodes, dispatching to the appropriate type-specific component.
 * Groups are rendered first (lower z-index), then other nodes in array order.
 *
 * For each node:
 *   1. Look up its category slots.
 *   2. Compute reflow reservations so text/icons don't collide with slots.
 *   3. Pick a ref-indicator corner (default, or displaced when occupied).
 *   4. Render the node body, then `CategorySlotsLayer` on top in the same
 *      `<g>` so slot primitives paint above the body but below the ref
 *      indicator and resize handles.
 */
/**
 * Memoized per-node render. During zoom animations the viewport changes
 * on every frame but the node data, theme, and selection state stay
 * stable — `React.memo`'s default shallow comparison skips re-renders
 * for those frames, eliminating the most expensive SVG work.
 *
 * Slot/reservation/refCorner computations live inside the memo boundary
 * so they also skip when the inputs are unchanged.
 */
const MemoizedNode = React.memo(function MemoizedNode({
  node,
  theme,
  onClick,
  onDoubleClick,
  onContextMenu,
  onNavigate,
  onPointerDown,
  isSelected,
  isEditing,
  canvases,
  isDimmed,
  isHighlighted,
  isActiveMatch,
  isExiting,
}: {
  node: ResolvedNode
  theme: CanvasTheme
  onClick: (node: ResolvedNode, event: React.MouseEvent) => void
  onDoubleClick: (node: ResolvedNode, event: React.MouseEvent) => void
  onContextMenu: (node: ResolvedNode, event: React.MouseEvent) => void
  onNavigate: (node: ResolvedNode, event: React.MouseEvent) => void
  onPointerDown?: (node: ResolvedNode, event: React.PointerEvent) => void
  isSelected: boolean
  isEditing: boolean
  canvases?: Record<string, CanvasData>
  isDimmed: boolean
  isHighlighted: boolean
  isActiveMatch: boolean
  isExiting?: boolean
}) {
  const gRef = useRef<SVGGElement>(null)
  const mountedRef = useRef(false)

  useEffect(() => {
    const g = gRef.current
    if (!g || mountedRef.current) return
    mountedRef.current = true
    g.style.opacity = '0'
    g.style.transition = 'none'
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    g.getBoundingClientRect()
    requestAnimationFrame(() => {
      g.style.transition = 'opacity 200ms cubic-bezier(0.22, 1, 0.36, 1)'
      g.style.opacity = isDimmed ? '0.15' : '1'
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const g = gRef.current
    if (!g || !isExiting) return
    g.style.transition = 'opacity 150ms ease-in'
    g.style.opacity = '0'
  }, [isExiting])

  const slots = getCategorySlots(node, theme)
  const reservations = computeReflowReservations(node, theme, slots)
  const explicitCorner =
    node.refCorner ??
    (node.category ? theme.categories?.[node.category]?.refCorner : undefined)
  const defaultCorner =
    node.type === 'group' ? 'topRight' : 'bottomRight'
  const refCorner =
    explicitCorner ?? pickRefIndicatorCorner(defaultCorner, slots)

  const Component = node.type === 'group' ? GroupNode : getNodeComponent(node.type)

  return (
    <g ref={gRef} opacity={isDimmed ? 0.15 : 1} style={isExiting ? { pointerEvents: 'none' } : undefined}>
      {isHighlighted && (
        <rect
          x={node.x - 4}
          y={node.y - 4}
          width={node.width + 8}
          height={node.height + 8}
          rx={6}
          fill="none"
          stroke={theme.node.labelColor}
          strokeWidth={isActiveMatch ? 3.5 : 2}
          opacity={isActiveMatch ? 1 : 0.6}
          pointerEvents="none"
        />
      )}
      <Component
        node={node}
        theme={theme}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        onContextMenu={onContextMenu}
        onNavigate={onNavigate}
        onPointerDown={onPointerDown}
        isSelected={isSelected}
        isEditing={isEditing}
        slots={slots}
        canvases={canvases}
        reservedTop={reservations.top}
        reservedBottom={reservations.bottom}
        reservedLeft={reservations.left}
        reservedRight={reservations.right}
        refCorner={refCorner}
      />
    </g>
  )
})

export function NodeRenderer({
  nodes,
  theme,
  onClick,
  onDoubleClick,
  onContextMenu,
  onNavigate,
  onPointerDown,
  selectedIds,
  editingId,
  onResizeHandlePointerDown,
  canvases,
  only,
  dimmedNodeIds,
  highlightedNodeIds,
  activeMatchNodeId,
}: NodeRendererProps) {
  const prevNodeMapRef = useRef<Map<string, ResolvedNode>>(new Map())
  const [exitingNodes, setExitingNodes] = useState<Map<string, ResolvedNode>>(new Map())

  useEffect(() => {
    const currentIds = new Set(nodes.map((n) => n.id))
    const removed = new Map<string, ResolvedNode>()
    for (const [id, node] of prevNodeMapRef.current) {
      if (!currentIds.has(id)) removed.set(id, node)
    }

    prevNodeMapRef.current = new Map(nodes.map((n) => [n.id, n]))

    if (removed.size > 0) {
      setExitingNodes((prev) => {
        const next = new Map(prev)
        for (const [id, node] of removed) next.set(id, node)
        return next
      })
      setTimeout(() => {
        setExitingNodes((prev) => {
          const next = new Map(prev)
          for (const id of removed.keys()) next.delete(id)
          return next
        })
      }, 180)
    }
  }, [nodes])

  const allNodes = useMemo(() => {
    if (exitingNodes.size === 0) return nodes
    const exitArr = Array.from(exitingNodes.values()).filter(
      (n) => !nodes.some((live) => live.id === n.id)
    )
    return [...exitArr, ...nodes]
  }, [nodes, exitingNodes])

  const groups = allNodes.filter((n) => n.type === 'group')
  const others = allNodes.filter((n) => n.type !== 'group')

  // Resize handles only make sense for a single selected node.
  // With multi-select (2+ nodes), resize is disabled.
  const singleSelectedId =
    selectedIds?.size === 1 ? Array.from(selectedIds)[0] : null
  const selectedNode =
    singleSelectedId && editingId !== singleSelectedId
      ? nodes.find((n) => n.id === singleSelectedId)
      : undefined

  // Resize handles belong on the topmost layer: only render them when we're
  // drawing non-groups (or everything), so they end up above edges and nodes.
  const renderResizeHandles =
    only !== 'groups' && selectedNode && onResizeHandlePointerDown

  return (
    <>
      {only !== 'non-groups' &&
        groups.map((node) => (
          <MemoizedNode
            key={node.id}
            node={node}
            theme={theme}
            onClick={onClick}
            onDoubleClick={onDoubleClick}
            onContextMenu={onContextMenu}
            onNavigate={onNavigate}
            onPointerDown={onPointerDown}
            isSelected={selectedIds?.has(node.id) ?? false}
            isEditing={editingId === node.id}
            canvases={canvases}
            isDimmed={dimmedNodeIds?.has(node.id) ?? false}
            isHighlighted={highlightedNodeIds?.has(node.id) ?? false}
            isActiveMatch={node.id === activeMatchNodeId}
            isExiting={exitingNodes.has(node.id)}
          />
        ))}

      {only !== 'groups' &&
        others.map((node) => (
          <MemoizedNode
            key={node.id}
            node={node}
            theme={theme}
            onClick={onClick}
            onDoubleClick={onDoubleClick}
            onContextMenu={onContextMenu}
            onNavigate={onNavigate}
            onPointerDown={onPointerDown}
            isSelected={selectedIds?.has(node.id) ?? false}
            isEditing={editingId === node.id}
            canvases={canvases}
            isDimmed={dimmedNodeIds?.has(node.id) ?? false}
            isHighlighted={highlightedNodeIds?.has(node.id) ?? false}
            isActiveMatch={node.id === activeMatchNodeId}
            isExiting={exitingNodes.has(node.id)}
          />
        ))}

      {renderResizeHandles && (
        <ResizeHandles
          node={selectedNode!}
          theme={theme}
          onHandlePointerDown={onResizeHandlePointerDown!}
        />
      )}

      {/* Re-paint the selected node's `topRightOuter` tab badge on top of
          the resize handles so the badge (e.g. a blocker count) isn't
          obscured by the NE resize handle. The handles still sit above
          everything else on the node. */}
      {renderResizeHandles &&
        (() => {
          const slots = getCategorySlots(selectedNode!, theme)
          if (!slots?.topRightOuter) return null
          return (
            <CategorySlotsLayer
              node={selectedNode!}
              theme={theme}
              canvases={canvases}
              slots={{ topRightOuter: slots.topRightOuter }}
            />
          )
        })()}
    </>
  )
}

function getNodeComponent(type: string) {
  switch (type) {
    case 'file':
      return FileNode
    case 'link':
      return LinkNode
    default:
      return TextNode
  }
}

export { CategorySlotsLayer }
