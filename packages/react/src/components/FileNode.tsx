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

interface FileNodeProps {
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

/**
 * File nodes have a distinct visual style:
 * - Square corners (rx=2) instead of rounded
 * - Thinner border (0.75px)
 * - Dog-ear fold in the top-right corner
 * - Monospace filename rendering
 * - Text clipped to node bounds
 */
export function FileNode({
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
}: FileNodeProps) {
  const { x, y, width, height } = node

  // Display the filename (last segment of path)
  const filePath = node.file ?? ''
  const fileName = filePath.split('/').pop() ?? filePath
  const dirPath = filePath.includes('/')
    ? filePath.slice(0, filePath.lastIndexOf('/'))
    : ''
  const subpath = node.subpath ?? ''

  // Dog-ear size
  const fold = 10
  const textPadding = 10 + reservedLeft
  const maxTextWidth = width - textPadding - reservedRight - fold
  // Vertical comfort padding for the wrapped filename region when no
  // dir-path header is present. Without it, a single-line filename sits
  // flush against the top/bottom strokes.
  const LABEL_PAD_Y = 6

  // Content-box top/bottom for vertical text layout.
  const contentY = y + reservedTop
  const contentHeight = Math.max(0, height - reservedTop - reservedBottom)

  // File shape: rectangle with a folded corner (top-right)
  const shapePath = [
    `M ${x + 2} ${y}`,
    `L ${x + width - fold} ${y}`,
    `L ${x + width} ${y + fold}`,
    `L ${x + width} ${y + height - 2}`,
    `Q ${x + width} ${y + height} ${x + width - 2} ${y + height}`,
    `L ${x + 2} ${y + height}`,
    `Q ${x} ${y + height} ${x} ${y + height - 2}`,
    `L ${x} ${y + 2}`,
    `Q ${x} ${y} ${x + 2} ${y}`,
    'Z',
  ].join(' ')

  // Fold crease line
  const foldPath = `M ${x + width - fold} ${y} L ${x + width - fold} ${y + fold} L ${x + width} ${y + fold}`

  const strokeColor = node.resolvedStroke
  const thinStroke = 0.75
  const clipId = `file-clip-${node.id}`

  return (
    <g
      className="system-canvas-node system-canvas-node--file"
      style={{ cursor: onPointerDown ? 'move' : node.isNavigable ? 'pointer' : 'default' }}
      onClick={(e) => onClick(node, e)}
      onDoubleClick={(e) => onDoubleClick(node, e)}
      onContextMenu={(e) => onContextMenu(node, e)}
      onPointerDown={onPointerDown ? (e) => onPointerDown(node, e) : undefined}
    >
      {/* Clip path to contain text within the node */}
      <defs>
        <clipPath id={clipId}>
          <rect
            x={x + textPadding}
            y={contentY}
            width={maxTextWidth}
            height={contentHeight}
          />
        </clipPath>
      </defs>

      {/* Opaque backer */}
      <path d={shapePath} fill={theme.background} />
      {/* Styled overlay */}
      <path
        d={shapePath}
        fill={node.resolvedFill}
        stroke={strokeColor}
        strokeWidth={thinStroke}
      />
      {/* Fold crease */}
      <path
        d={foldPath}
        fill="none"
        stroke={strokeColor}
        strokeWidth={thinStroke}
        opacity={0.5}
      />

      {/* Clipped text group — suppressed when a `body` slot owns the main
          content area. The filename is the only field that wraps; dirPath
          and subpath stay single-line by design (they are path metadata
          that should stay on one row and truncate naturally via the
          clipPath when long). The filename renders through `NodeText` so
          long filenames wrap to the available width instead of being cut
          off mid-character. */}
      {!isEditing && !slots?.body && (
      <g clipPath={`url(#${clipId})`}>
        {/* Directory path (small, above filename) */}
        {dirPath && (
          <text
            x={x + textPadding}
            y={contentY + 14}
            fill={theme.node.sublabelColor}
            fontSize={theme.node.sublabelFontSize - 1}
            fontFamily={theme.node.fontFamily}
            pointerEvents="none"
            opacity={0.6}
          >
            {dirPath}/
          </text>
        )}

        {/* Filename (wraps). `LABEL_PAD_Y` keeps the wrapped filename
            block from crowding the top/bottom strokes when no `dirPath`
            or `subpath` is present (without it, a single-line filename
            sits flush against the node border). Horizontal padding is
            already baked into `textPadding`. */}
        <NodeText
          region={{
            x: x + textPadding,
            y: dirPath
              ? contentY + 18
              : contentY + (subpath ? 8 : LABEL_PAD_Y),
            width: maxTextWidth,
            height: dirPath
              ? Math.max(0, contentHeight - 18 - (subpath ? 16 : 0))
              : Math.max(
                  0,
                  contentHeight - (subpath ? 16 : 0) - LABEL_PAD_Y * 2,
                ),
          }}
          value={fileName}
          theme={theme}
          color={theme.node.labelColor}
          align="start"
          fontWeight={500}
          fontSize={theme.node.fontSize - 1}
          wrap={true}
          verticalAlign={dirPath ? 'top' : 'center'}
        />

        {/* Subpath */}
        {subpath && (
          <text
            x={x + textPadding}
            y={
              contentY +
              (dirPath ? 40 : contentHeight / 2 + theme.node.fontSize + 2)
            }
            fill={theme.node.sublabelColor}
            fontSize={theme.node.sublabelFontSize}
            fontFamily={theme.node.fontFamily}
            pointerEvents="none"
          >
            {subpath}
          </text>
        )}
      </g>
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
          strokeColor={strokeColor}
          strokeWidth={thinStroke}
          corner={toKebabCorner(refCorner)}
          onNavigate={onNavigate}
        />
      )}
    </g>
  )
}
