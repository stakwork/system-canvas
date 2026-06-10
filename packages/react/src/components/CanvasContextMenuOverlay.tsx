import React, { useEffect, useRef, useState } from 'react'
import type {
  CanvasTheme,
  ContextMenuTheme,
  CanvasContextMenuConfig,
  CanvasContextMenuItem,
} from 'system-canvas'
import type { CanvasContextMenuOverlayState } from 'system-canvas'
import { NodeIcon } from './NodeIcon.js'

interface CanvasContextMenuOverlayProps {
  state: CanvasContextMenuOverlayState | null
  config: CanvasContextMenuConfig
  theme: CanvasTheme
  /** Called whenever the menu should close (outside-click, Esc, item pick). */
  onClose: () => void
}

/** Approximate menu width — only used for off-right-edge clamping. */
const ESTIMATED_MENU_WIDTH = 200
const MIN_MENU_WIDTH = 160
const VIEWPORT_MARGIN = 8

/**
 * Floating, dismissible menu rendered above the canvas at the user's
 * right-click position on empty canvas space. Lives outside the SVG (a
 * regular HTML `<div>` with `position: fixed`) so it isn't clipped by the
 * canvas viewport and doesn't interfere with d3-zoom hit-testing.
 *
 * Items are pre-filtered by the consumer — no per-item `match` predicate
 * evaluation happens here.
 *
 * Dismissal: outside `mousedown`, Escape, scroll, window blur, or after
 * the consumer's `onSelect` runs.
 */
export function CanvasContextMenuOverlay({
  state,
  config,
  theme,
  onClose,
}: CanvasContextMenuOverlayProps) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  // Reset hover whenever a new menu opens.
  useEffect(() => {
    if (state) setHoveredId(null)
  }, [state])

  // Outside-click / Escape / scroll / blur dismissal. Only wired while open.
  useEffect(() => {
    if (!state) return
    function onDown(e: MouseEvent) {
      const root = rootRef.current
      if (!root) return
      if (root.contains(e.target as Node)) return
      onClose()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    function onScroll() {
      onClose()
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('blur', onClose)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('blur', onClose)
    }
  }, [state, onClose])

  if (!state) return null
  const cm: ContextMenuTheme | undefined = theme.contextMenu
  // If a consumer plugs in a hand-rolled CanvasTheme (not via resolveTheme)
  // and forgets the contextMenu block, render nothing rather than throwing.
  if (!cm) return null

  const vw = typeof window !== 'undefined' ? window.innerWidth : 0
  const vh = typeof window !== 'undefined' ? window.innerHeight : 0
  // Separator items count as a thin divider — use a smaller height estimate.
  const sepCount = state.items.filter((i) => i.id === '__sep__').length
  const rowCount = state.items.length - sepCount
  const itemHeight = cm.itemPaddingY * 2 + cm.fontSize + 4
  const estimatedHeight =
    rowCount * itemHeight + sepCount * 9 + cm.paddingY * 2
  const left = vw
    ? Math.min(state.screenPosition.x, vw - ESTIMATED_MENU_WIDTH - VIEWPORT_MARGIN)
    : state.screenPosition.x
  const top = vh
    ? Math.min(state.screenPosition.y, vh - estimatedHeight - VIEWPORT_MARGIN)
    : state.screenPosition.y

  const anyIcon = state.items.some((item) => item.id !== '__sep__' && !!item.icon)

  return (
    <div
      ref={rootRef}
      role="menu"
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
      style={{
        position: 'fixed',
        left,
        top,
        zIndex: 1000,
        minWidth: MIN_MENU_WIDTH,
        padding: `${cm.paddingY}px ${cm.paddingX}px`,
        background: cm.background,
        color: cm.itemColor,
        border: `1px solid ${cm.borderColor}`,
        borderRadius: cm.borderRadius,
        boxShadow: cm.shadow,
        fontFamily: cm.fontFamily,
        fontSize: cm.fontSize,
        backdropFilter: 'blur(10px)',
        userSelect: 'none',
        pointerEvents: 'auto',
      }}
    >
      {state.items.map((item: CanvasContextMenuItem, idx: number) => {
        // Separator sentinel — renders as a visual divider, not clickable.
        if (item.id === '__sep__') {
          return (
            <hr
              key={`__sep__${idx}`}
              style={{
                border: 'none',
                borderTop: `1px solid ${theme.breadcrumbs?.separatorColor ?? cm.borderColor}`,
                margin: `4px 0`,
              }}
            />
          )
        }

        const isHovered = hoveredId === item.id
        const color = item.destructive ? cm.destructiveItemColor : cm.itemColor
        return (
          <div
            key={item.id}
            role="menuitem"
            onMouseEnter={() => setHoveredId(item.id)}
            onMouseLeave={() => setHoveredId((id) => (id === item.id ? null : id))}
            onClick={() => {
              config.onSelect(item.id, {
                canvasRef: state.canvasRef,
                position: state.position,
                screenPosition: state.screenPosition,
              })
              onClose()
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: `${cm.itemPaddingY}px ${cm.itemPaddingX}px`,
              borderRadius: Math.max(0, cm.borderRadius - 4),
              cursor: 'pointer',
              background: isHovered ? cm.itemHoverBackground : 'transparent',
              color,
            }}
          >
            {item.icon ? (
              <svg
                width={14}
                height={14}
                viewBox="0 0 16 16"
                style={{ flexShrink: 0, overflow: 'visible' }}
              >
                <NodeIcon
                  icon={item.icon}
                  x={0}
                  y={0}
                  size={14}
                  color={color}
                  opacity={1}
                  customIcons={theme.icons}
                />
              </svg>
            ) : anyIcon ? (
              <span style={{ width: 14, flexShrink: 0 }} aria-hidden />
            ) : null}
            <span>{item.label}</span>
          </div>
        )
      })}
    </div>
  )
}
