import React, { useEffect, useRef, useState } from 'react'
import type {
  CanvasEdge,
  CanvasTheme,
  ContextMenuTheme,
  EdgeContextMenuConfig,
  EdgeContextMenuItem,
  EdgeContextMenuMatchContext,
} from 'system-canvas'
import { NodeIcon } from './NodeIcon.js'

/**
 * State the overlay needs to render itself for one open instance. The
 * library owns this state — the consumer never sees it.
 */
export interface EdgeContextMenuOverlayState {
  /** Filtered items (already passed `match` predicates). */
  items: EdgeContextMenuItem[]
  edge: CanvasEdge
  /** clientX/clientY at the time of the right-click. */
  screenPosition: { x: number; y: number }
  /** Canvas the right-clicked edge lives on. `null` for root. */
  canvasRef: string | null
}

interface EdgeContextMenuOverlayProps {
  state: EdgeContextMenuOverlayState | null
  config: EdgeContextMenuConfig
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
 * right-click position. Lives outside the SVG (a regular HTML `<div>` with
 * `position: fixed`) so it isn't clipped by the canvas viewport and
 * doesn't interfere with d3-zoom hit-testing.
 *
 * Dismissal: outside `mousedown`, Escape, scroll, window blur, or after
 * the consumer's `onSelect` runs.
 */
export function EdgeContextMenuOverlay({
  state,
  config,
  theme,
  onClose,
}: EdgeContextMenuOverlayProps) {
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
  const itemHeight = cm.itemPaddingY * 2 + cm.fontSize + 4
  const estimatedHeight = state.items.length * itemHeight + cm.paddingY * 2
  const left = vw
    ? Math.min(state.screenPosition.x, vw - ESTIMATED_MENU_WIDTH - VIEWPORT_MARGIN)
    : state.screenPosition.x
  const top = vh
    ? Math.min(state.screenPosition.y, vh - estimatedHeight - VIEWPORT_MARGIN)
    : state.screenPosition.y

  const matchCtx: EdgeContextMenuMatchContext = { canvasRef: state.canvasRef }

  const anyIcon = state.items.some((item) => !!item.icon)

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
      {state.items.map((item) => {
        const isDisabled = item.disabled?.(state.edge, matchCtx) ?? false
        const isHovered = !isDisabled && hoveredId === item.id
        const color = item.destructive ? cm.destructiveItemColor : cm.itemColor
        return (
          <div
            key={item.id}
            role="menuitem"
            aria-disabled={isDisabled}
            onMouseEnter={() => !isDisabled && setHoveredId(item.id)}
            onMouseLeave={() => setHoveredId((id) => (id === item.id ? null : id))}
            onClick={() => {
              if (isDisabled) return
              config.onSelect(item.id, state.edge, {
                canvasRef: state.canvasRef,
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
              cursor: isDisabled ? 'not-allowed' : 'pointer',
              opacity: isDisabled ? 0.45 : 1,
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
