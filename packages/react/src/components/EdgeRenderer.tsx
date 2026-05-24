import React from 'react'
import type {
  CanvasEdge,
  ResolvedNode,
  CanvasTheme,
  EdgeStyle,
} from 'system-canvas'
import {
  computeEdgePath,
  computeEdgeMidpoint,
  resolveColor,
} from 'system-canvas'

interface EdgeRendererProps {
  edges: CanvasEdge[]
  nodeMap: Map<string, ResolvedNode>
  theme: CanvasTheme
  defaultEdgeStyle: EdgeStyle
  onClick: (edge: CanvasEdge, event: React.MouseEvent) => void
  onDoubleClick?: (edge: CanvasEdge, event: React.MouseEvent) => void
  onContextMenu: (edge: CanvasEdge, event: React.MouseEvent) => void
  /** Id of the currently selected edge (editable mode) */
  selectedId?: string | null
  /** Id of the edge whose label is currently being edited (label is hidden) */
  editingId?: string | null
  /** Node ids that are dimmed (search/category filter). Edges connected to dimmed nodes render as dotted lines. */
  dimmedNodeIds?: Set<string>
}

/**
 * Renders all edges. Edges are drawn before nodes in the SVG so they
 * appear behind node rectangles (painter's model).
 */
export function EdgeRenderer({
  edges,
  nodeMap,
  theme,
  defaultEdgeStyle,
  onClick,
  onDoubleClick,
  onContextMenu,
  selectedId,
  editingId,
  dimmedNodeIds,
}: EdgeRendererProps) {
  return (
    <>
      {/* Arrowhead marker definition. Uses `context-stroke` so the polygon
          inherits the stroke color of whichever path references it — that
          way one marker serves edges of any color (theme default, preset
          color, or selected highlight) without us needing a marker per
          color. Selected edges already set their path stroke to the
          high-contrast label color, so the arrow follows along. */}
      <defs>
        <marker
          id="system-canvas-arrowhead"
          markerWidth={theme.edge.arrowSize}
          markerHeight={theme.edge.arrowSize * 0.7}
          refX={theme.edge.arrowSize - 1}
          refY={theme.edge.arrowSize * 0.35}
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <polygon
            points={`0 0, ${theme.edge.arrowSize} ${theme.edge.arrowSize * 0.35}, 0 ${theme.edge.arrowSize * 0.7}`}
            fill="context-stroke"
          />
        </marker>
      </defs>

      {/* Stable-sort so edges using the theme's default stroke render first
          (behind), and edges with an explicit color render on top. Selected
          edges are bumped to the very top so they're always fully visible.
          The underlying `edges` array is not mutated. */}
      {[...edges]
        .map((edge, i) => ({ edge, i }))
        .sort((a, b) => {
          const aSel = selectedId === a.edge.id ? 2 : 0
          const bSel = selectedId === b.edge.id ? 2 : 0
          const aCol = a.edge.color ? 1 : 0
          const bCol = b.edge.color ? 1 : 0
          const aRank = aSel + aCol
          const bRank = bSel + bCol
          if (aRank !== bRank) return aRank - bRank
          return a.i - b.i
        })
        .map(({ edge }) => {
        const fromNode = nodeMap.get(edge.fromNode)
        const toNode = nodeMap.get(edge.toNode)
        if (!fromNode || !toNode) return null

        const pathD = computeEdgePath(edge, fromNode, toNode, defaultEdgeStyle)
        const midpoint = computeEdgeMidpoint(edge, fromNode, toNode)

        const isSelected = selectedId === edge.id
        const isEditing = editingId === edge.id

        // Resolve edge color (selection overrides to high-contrast label color)
        const baseColor = edge.color
          ? resolveColor(edge.color, theme).stroke
          : theme.edge.stroke
        const edgeColor = isSelected ? theme.node.labelColor : baseColor
        // Per-edge override wins over the theme default; selection
        // multiplier rides on top so highlights still scale on
        // data-weighted edges.
        const baseStrokeWidth = edge.strokeWidth ?? theme.edge.strokeWidth
        const strokeWidth = isSelected ? baseStrokeWidth * 1.75 : baseStrokeWidth

        const toEnd = edge.toEnd ?? 'arrow'
        const fromEnd = edge.fromEnd ?? 'none'
        const arrowId = 'system-canvas-arrowhead'

        const isEdgeDimmed =
          (dimmedNodeIds?.has(edge.fromNode) || dimmedNodeIds?.has(edge.toNode)) ?? false

        return (
          <g
            key={edge.id}
            className="system-canvas-edge"
            style={{ cursor: 'pointer' }}
            onClick={(e) => onClick(edge, e)}
            onDoubleClick={(e) => onDoubleClick?.(edge, e)}
            onContextMenu={(e) => onContextMenu(edge, e)}
          >
            {/* Invisible wider path for easier click targeting */}
            <path
              d={pathD}
              fill="none"
              stroke="transparent"
              strokeWidth={12}
            />

            {/* Visible path */}
            <path
              d={pathD}
              fill="none"
              stroke={edgeColor}
              strokeWidth={strokeWidth}
              strokeDasharray={isEdgeDimmed ? '4 4' : undefined}
              strokeOpacity={isEdgeDimmed ? 0.3 : 1}
              markerEnd={toEnd === 'arrow' ? `url(#${arrowId})` : undefined}
              markerStart={fromEnd === 'arrow' ? `url(#${arrowId})` : undefined}
            />

            {/* Edge label (hidden while editing) */}
            {edge.label && !isEditing && (
              <>
                {/* Label background for readability */}
                <rect
                  x={midpoint.x - edge.label.length * 3 - 4}
                  y={midpoint.y - theme.edge.labelFontSize - 2}
                  width={edge.label.length * 6 + 8}
                  height={theme.edge.labelFontSize + 6}
                  rx={3}
                  fill={theme.background}
                  opacity={0.8}
                />
                <text
                  x={midpoint.x}
                  y={midpoint.y}
                  fill={isSelected ? theme.node.labelColor : theme.edge.labelColor}
                  fontSize={theme.edge.labelFontSize}
                  fontFamily={theme.node.fontFamily}
                  textAnchor="middle"
                  pointerEvents="none"
                >
                  {edge.label}
                </text>
              </>
            )}
          </g>
        )
      })}
    </>
  )
}
