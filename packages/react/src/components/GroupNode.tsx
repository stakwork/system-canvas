import React from 'react'
import type {
  CanvasData,
  CategorySlots,
  ResolvedNode,
  CanvasTheme,
} from 'system-canvas'
import { RefIndicator } from './RefIndicator.js'
import { CategorySlotsLayer } from './CategorySlotsLayer.js'
import { toKebabCorner, type RefCorner } from './refCorner.js'

interface GroupNodeProps {
  node: ResolvedNode
  theme: CanvasTheme
  onClick: (node: ResolvedNode, event: React.MouseEvent) => void
  onDoubleClick: (node: ResolvedNode, event: React.MouseEvent) => void
  onContextMenu: (node: ResolvedNode, event: React.MouseEvent) => void
  onNavigate: (node: ResolvedNode, event: React.MouseEvent | React.KeyboardEvent) => void
  onPointerDown?: (node: ResolvedNode, event: React.PointerEvent) => void
  isSelected?: boolean
  isEditing?: boolean
  slots?: CategorySlots
  canvases?: Record<string, CanvasData>
  reservedTop?: number
  reservedBottom?: number
  reservedLeft?: number
  reservedRight?: number
  refCorner?: RefCorner
}

export function GroupNode({
  node,
  theme,
  onClick,
  onDoubleClick,
  onContextMenu,
  onNavigate,
  onPointerDown,
  isSelected,
  isEditing,
  slots,
  canvases,
  reservedTop = 0,
  reservedBottom = 0,
  reservedLeft = 0,
  reservedRight = 0,
  refCorner = 'topRight',
}: GroupNodeProps) {
  const { x, y, width, height } = node

  // Use the node's resolved color for the group border, falling back to group theme
  const stroke = node.color ? node.resolvedStroke : theme.group.stroke
  const fill = node.color ? node.resolvedFill : theme.group.fill

  // Label shifts down by reservedTop (from header slot) and right by
  // reservedLeft (from a left-edge accent).
  const labelX = x + 12 + reservedLeft
  const labelY = y + reservedTop + theme.group.labelFontSize + 8

  return (
    <g
      className="system-canvas-node system-canvas-node--group"
      style={{ cursor: onPointerDown ? 'move' : node.isNavigable ? 'pointer' : 'default' }}
      onClick={(e) => onClick(node, e)}
      onDoubleClick={(e) => onDoubleClick(node, e)}
      onContextMenu={(e) => onContextMenu(node, e)}
      onPointerDown={onPointerDown ? (e) => onPointerDown(node, e) : undefined}
    >
      {/* Dashed boundary */}
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={theme.group.cornerRadius}
        fill={fill}
        stroke={stroke}
        strokeWidth={theme.group.strokeWidth}
        strokeDasharray={theme.group.strokeDasharray}
      />

      {/* Label in top-left — suppressed when a `body` slot owns the content. */}
      {!isEditing && !slots?.body && node.label && (
        <text
          x={labelX}
          y={labelY}
          fill={node.color ? stroke : theme.group.labelColor}
          fontSize={theme.group.labelFontSize}
          fontWeight={600}
          fontFamily={theme.node.fontFamily}
          pointerEvents="none"
        >
          {node.label}
        </text>
      )}

      {/* Category slots */}
      {slots && (
        <CategorySlotsLayer
          node={node}
          theme={theme}
          canvases={canvases}
          slots={slots}
        />
      )}

      {/* Ref indicator — corner chosen by NodeRenderer. */}
      {node.isNavigable && (
        <RefIndicator
          node={node}
          theme={theme}
          nodeX={x}
          nodeY={y}
          nodeWidth={width}
          nodeHeight={height}
          strokeColor={stroke}
          strokeWidth={theme.group.strokeWidth}
          corner={toKebabCorner(refCorner)}
          onNavigate={onNavigate}
        />
      )}
    </g>
  )
}
