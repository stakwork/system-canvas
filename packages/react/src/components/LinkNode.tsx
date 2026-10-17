import React from 'react'
import type {
  CanvasData,
  CategorySlots,
  ResolvedNode,
  CanvasTheme,
} from 'system-canvas'
import { RefIndicator } from './RefIndicator.js'
import { CategorySlotsLayer } from './CategorySlotsLayer.js'
import { NodeText } from '../primitives/NodeText.js'
import { toKebabCorner, type RefCorner } from './refCorner.js'

interface LinkNodeProps {
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

export function LinkNode({
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
  refCorner = 'bottomRight',
}: LinkNodeProps) {
  const { x, y, width, height } = node
  const contentX = x + reservedLeft
  const contentY = y + reservedTop
  const contentWidth = Math.max(0, width - reservedLeft - reservedRight)
  const contentHeight = Math.max(0, height - reservedTop - reservedBottom)
  // Reserve space at the left for the link glyph so the wrapped URL text
  // doesn't overlap it. Matches the glyph's `contentX + 12` placement plus
  // a small gap.
  const glyphReserve = 20
  // Comfort padding inside the content rect — keeps the URL from crowding
  // the right border and the top/bottom strokes.
  const LABEL_PAD_X = 10
  const LABEL_PAD_Y = 6

  // Parse URL to show hostname
  let displayUrl = node.url ?? ''
  try {
    const url = new URL(displayUrl)
    displayUrl = url.hostname
  } catch {
    // Keep full URL if parsing fails
  }

  return (
    <g
      className="system-canvas-node system-canvas-node--link"
      style={{ cursor: onPointerDown ? 'move' : 'pointer' }}
      onClick={(e) => onClick(node, e)}
      onDoubleClick={(e) => onDoubleClick(node, e)}
      onContextMenu={(e) => onContextMenu(node, e)}
      onPointerDown={onPointerDown ? (e) => onPointerDown(node, e) : undefined}
    >
      {/* Opaque backer */}
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={node.resolvedCornerRadius}
        fill={theme.background}
      />
      {/* Styled overlay */}
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={node.resolvedCornerRadius}
        fill={node.resolvedFill}
        stroke={node.resolvedStroke}
        strokeWidth={theme.node.strokeWidth}
      />

      {/* Link icon — suppressed when a `body` slot owns the content area. */}
      {!isEditing && !slots?.body && (
        <text
          x={contentX + 12}
          y={contentY + contentHeight / 2 + 4}
          fill={node.resolvedStroke}
          fontSize={12}
          fontFamily={theme.node.fontFamily}
          pointerEvents="none"
          opacity={0.6}
        >
          {'\u{29C9}'}
        </text>
      )}

      {/* URL display — suppressed when a `body` slot owns the content area.
          Wraps long URLs (or full URLs when `new URL()` parsing fails)
          across the available width. `textDecoration` doesn't reach
          `NodeText` directly today; underline is intentionally dropped on
          wrapped output to keep the wrapped block readable — visually a
          single-line non-wrapped URL is still the common case. */}
      {!isEditing && !slots?.body && (
        <NodeText
          region={{
            x: contentX + glyphReserve,
            y: contentY + LABEL_PAD_Y,
            width: Math.max(0, contentWidth - glyphReserve - LABEL_PAD_X),
            height: Math.max(0, contentHeight - LABEL_PAD_Y * 2),
          }}
          value={displayUrl}
          theme={theme}
          color={theme.node.labelColor}
          align="center"
          fontWeight={600}
          fontSize={theme.node.fontSize}
          wrap={true}
          verticalAlign="center"
        />
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

      {/* Ref indicator */}
      {node.isNavigable && (
        <RefIndicator
          node={node}
          theme={theme}
          nodeX={x}
          nodeY={y}
          nodeWidth={width}
          nodeHeight={height}
          strokeColor={node.resolvedStroke}
          strokeWidth={theme.node.strokeWidth}
          corner={toKebabCorner(refCorner)}
          onNavigate={onNavigate}
        />
      )}
    </g>
  )
}
