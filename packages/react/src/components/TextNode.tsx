import React from 'react'
import type {
  CanvasData,
  CategorySlots,
  ResolvedNode,
  CanvasTheme,
} from 'system-canvas'
import { NodeIcon } from './NodeIcon.js'
import { RefIndicator } from './RefIndicator.js'
import { CategorySlotsLayer } from './CategorySlotsLayer.js'
import { NodeText } from '../primitives/NodeText.js'
import { toKebabCorner, type RefCorner } from './refCorner.js'

interface TextNodeProps {
  node: ResolvedNode
  theme: CanvasTheme
  onClick: (node: ResolvedNode, event: React.MouseEvent) => void
  onDoubleClick: (node: ResolvedNode, event: React.MouseEvent) => void
  onContextMenu: (node: ResolvedNode, event: React.MouseEvent) => void
  onNavigate: (node: ResolvedNode, event: React.MouseEvent) => void
  onPointerDown?: (node: ResolvedNode, event: React.PointerEvent) => void
  isSelected?: boolean
  isEditing?: boolean
  slots?: CategorySlots
  canvases?: Record<string, CanvasData>
  /** Pixels reserved at the top of the node's content box for a header slot. */
  reservedTop?: number
  /** Pixels reserved at the bottom for a footer slot. */
  reservedBottom?: number
  /** Pixels reserved on the left for a leftEdge slot. */
  reservedLeft?: number
  /** Pixels reserved on the right for a rightEdge slot. */
  reservedRight?: number
  /** Corner the ref indicator should occupy (chosen by NodeRenderer). */
  refCorner?: RefCorner
}

export function TextNode({
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
}: TextNodeProps) {
  const { x, y, width, height } = node
  const contentX = x + reservedLeft
  const contentY = y + reservedTop
  const contentWidth = Math.max(0, width - reservedLeft - reservedRight)
  const contentHeight = Math.max(0, height - reservedTop - reservedBottom)
  // Padding inside the content rect for the default wrapped label so
  // text doesn't crowd the node's stroke. Reflow already reserves edges
  // for header / footer / leftEdge / rightEdge slots; this is the
  // additional comfort margin for the body text region itself. Slot-
  // owned content (`body` slot) handles its own padding via the slot
  // region geometry.
  //
  // When reflow reservations already provide horizontal inset (dashboard
  // cards with header/footer/topLeft slots), skip the extra body padding
  // so the title left-aligns with the header text instead of being
  // indented further.
  const LABEL_PAD_X = (reservedLeft > 0 || reservedRight > 0) ? 0 : 10
  const LABEL_PAD_Y = 6

  // Full node text. Multi-line via `\n` is preserved by `NodeText`'s wrap
  // path (each paragraph word-wraps independently).
  const text = node.text ?? node.id
  // When the category declares a `body` slot, it owns the main content
  // area — suppress the default label so the two don't stack.
  const hasBodySlot = slots?.body !== undefined

  // Label layout. Three patterns:
  //
  //   1. **Top-aligned** — header / footer / topRight pill / bodyTop bar
  //      (any "top-row" dashboard signal). Title pins under the header
  //      strip and wraps across the content box. `reservedTop > 0` is
  //      the geometry proxy.
  //
  //   2. **Inline row** — only a `topLeft` dot or icon, no top-row signal.
  //      Title vertical-centers (same row as the marker) and left-aligns
  //      flush with the content area.
  //
  //   3. **Centered** — no slots, plain text node. Title centers both
  //      vertically and horizontally (legacy behavior).
  const hasHeader = reservedTop > 0
  const hasInlineLeftMarker =
    slots?.topLeft !== undefined &&
    (slots.topLeft.kind === 'dot' || slots.topLeft.kind === 'icon') &&
    !hasHeader
  const isLeftAligned = hasHeader || hasInlineLeftMarker
  const labelFontSize = theme.node.fontSize + (hasHeader ? 1 : 0)
  // `NodeText` accepts `'start' | 'center' | 'end'` (note: 'center', not
  // 'middle' — its prop, not the SVG textAnchor attribute).
  const labelAlign: 'start' | 'center' = isLeftAligned ? 'start' : 'center'

  return (
    <g
      className="system-canvas-node system-canvas-node--text"
      style={{ cursor: onPointerDown ? 'move' : node.isNavigable ? 'pointer' : 'default' }}
      onClick={(e) => onClick(node, e)}
      onDoubleClick={(e) => onDoubleClick(node, e)}
      onContextMenu={(e) => onContextMenu(node, e)}
      onPointerDown={onPointerDown ? (e) => onPointerDown(node, e) : undefined}
    >
      {/* Opaque backer — masks edges behind semi-transparent fill */}
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

      {/* Label — wraps to the content rect; suppressed when a `body` slot
          owns the main content area. `NodeText`'s wrap path word-wraps each
          `\n`-separated paragraph independently, so multi-line input still
          renders as multi-line and reflows when the node is narrowed.
          `verticalAlign` placement: `'top'` for the header-led pattern
          (title pins under the header strip), `'center'` for the inline-row
          and plain-text patterns (vertically centered in the content rect). */}
      {!isEditing && !hasBodySlot && (
        <NodeText
          region={{
            x: contentX + LABEL_PAD_X,
            y: contentY + LABEL_PAD_Y,
            width: Math.max(0, contentWidth - LABEL_PAD_X * 2),
            height: Math.max(0, contentHeight - LABEL_PAD_Y * 2),
          }}
          value={text}
          theme={theme}
          color={theme.node.labelColor}
          align={labelAlign}
          fontWeight={600}
          fontSize={labelFontSize}
          useLabelFont={true}
          wrap={true}
          verticalAlign={hasHeader ? 'top' : 'center'}
        />
      )}

      {/* Category icon */}
      {node.resolvedIcon && (
        <NodeIcon
          icon={node.resolvedIcon}
          x={x + 8 + reservedLeft}
          y={contentY + contentHeight / 2 - 7}
          size={14}
          color={node.resolvedStroke}
          opacity={0.7}
          customIcons={theme.icons}
        />
      )}

      {/* Category slots — declarative visual add-ons from theme */}
      {slots && (
        <CategorySlotsLayer
          node={node}
          theme={theme}
          canvases={canvases}
          slots={slots}
        />
      )}

      {/* Ref indicator — corner is chosen by NodeRenderer based on which
          corner slots (if any) are occupied by the category. */}
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
