import { useState, useRef, useEffect, useCallback } from 'react'
import type { ResolvedNode, ViewportState, MultiSelectKey } from 'system-canvas'
import { screenToCanvas } from 'system-canvas'

/**
 * The concrete (non-`'auto'`) marquee activation keys. `SystemCanvas`
 * resolves `'auto'` against `panMode` before handing the key to this hook,
 * so the hook never sees `'auto'`.
 */
export type ResolvedMultiSelectKey = Exclude<MultiSelectKey, 'auto'>

export interface MarqueeRect {
  x1: number
  y1: number
  x2: number
  y2: number
}

interface UseMultiSelectOptions {
  svgRef: React.RefObject<SVGSVGElement | null>
  viewport: React.RefObject<ViewportState>
  nodesRef: React.RefObject<ResolvedNode[]>
  containerRef: React.RefObject<HTMLElement | null>
  enabled: boolean
  /**
   * How the marquee gesture is activated. Resolved (no `'auto'`) by the
   * caller. Defaults to `'space'` — the historical behavior.
   *
   * - `'space' | 'shift' | 'alt' | 'meta'` — hold the key, then a background
   *   drag draws a marquee; plain drag still pans.
   * - `'none'` — every background drag draws a marquee (no key). The marquee
   *   is "always armed": `marqueeActiveRef` is pinned `true`, so the
   *   viewport's d3-zoom filter suppresses background pan and the gesture is
   *   handled here instead. Only coherent with `panMode: 'trackpad'`.
   */
  activationKey?: ResolvedMultiSelectKey
}

interface UseMultiSelectResult {
  selectedIds: Set<string>
  selectNode: (id: string) => void
  toggleNode: (id: string) => void
  selectAll: () => void
  clearSelection: () => void
  selectMultiple: (ids: string[]) => void
  marqueeRect: MarqueeRect | null
  marqueeActiveRef: React.RefObject<boolean>
}

export function useMultiSelect(options: UseMultiSelectOptions): UseMultiSelectResult {
  const { svgRef, viewport, nodesRef, containerRef, enabled, activationKey = 'space' } = options

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [marqueeRect, setMarqueeRect] = useState<MarqueeRect | null>(null)

  // `'none'` means the marquee is always armed: a plain background drag
  // marquees with no key held. We seed the ref to `true` for that mode so the
  // viewport's d3-zoom filter suppresses background pan from the first frame.
  const marqueeActiveRef = useRef(activationKey === 'none')
  const isDrawingRef = useRef(false)
  const startScreenRef = useRef<{ x: number; y: number } | null>(null)
  const pointerIdRef = useRef<number | null>(null)

  // Keep a stable ref to the latest selectedIds so callbacks don't stale-close
  const selectedIdsRef = useRef(selectedIds)
  selectedIdsRef.current = selectedIds

  // -------------------------------------------------------------------------
  // Named actions
  // -------------------------------------------------------------------------

  const selectNode = useCallback((id: string) => {
    setSelectedIds(new Set([id]))
  }, [])

  const toggleNode = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const selectAll = useCallback(() => {
    const nodes = nodesRef.current
    if (!nodes) return
    setSelectedIds(new Set(nodes.map(n => n.id)))
  }, [nodesRef])

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  const selectMultiple = useCallback((ids: string[]) => {
    setSelectedIds(new Set(ids))
  }, [])

  // -------------------------------------------------------------------------
  // Activation key — hold to arm marquee mode
  //
  // For `'space' | 'shift' | 'alt' | 'meta'` the marquee is armed while the
  // key is held (keydown arms, keyup disarms). For `'none'` the marquee is
  // always armed (seeded above) and there is no key to listen for, so this
  // effect is a no-op.
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!enabled) return
    if (activationKey === 'none') {
      // Always armed — keep the ref pinned even across re-renders.
      marqueeActiveRef.current = true
      return
    }
    const container = containerRef.current
    if (!container) return

    // The physical key for the configured activation key. Space is matched on
    // `e.code` ('Space'); the modifiers are matched on their `e.key` value.
    const matchesKey = (e: KeyboardEvent): boolean => {
      switch (activationKey) {
        case 'space':
          return e.code === 'Space'
        case 'shift':
          return e.key === 'Shift'
        case 'alt':
          return e.key === 'Alt'
        case 'meta':
          // Meta is Cmd on macOS, the Windows key elsewhere. Ctrl is
          // intentionally not folded in — it collides with right-click on
          // macOS and with Cmd/Ctrl+A select-all.
          return e.key === 'Meta'
        default:
          // `'none'` returned early above; this satisfies the type checker.
          return false
      }
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (!matchesKey(e) || e.repeat) return
      // Don't intercept when a text input / editor has focus.
      const active = document.activeElement
      if (
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        (active instanceof HTMLElement && active.isContentEditable)
      ) {
        return
      }
      // Only Space scrolls the page on its own, so only Space needs the
      // default suppressed; suppressing it for the modifiers would swallow
      // their normal behavior elsewhere.
      if (activationKey === 'space') e.preventDefault()
      marqueeActiveRef.current = true
    }

    const onKeyUp = (e: KeyboardEvent) => {
      if (!matchesKey(e)) return
      marqueeActiveRef.current = false
      // Cancel any in-progress marquee draw cleanly
      if (isDrawingRef.current) {
        isDrawingRef.current = false
        startScreenRef.current = null
        pointerIdRef.current = null
        setMarqueeRect(null)
      }
    }

    container.addEventListener('keydown', onKeyDown)
    container.addEventListener('keyup', onKeyUp)
    return () => {
      container.removeEventListener('keydown', onKeyDown)
      container.removeEventListener('keyup', onKeyUp)
    }
  }, [enabled, containerRef, activationKey])

  // -------------------------------------------------------------------------
  // Cmd+A — select all
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!enabled) return
    const container = containerRef.current
    if (!container) return

    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        const active = document.activeElement
        if (
          active instanceof HTMLInputElement ||
          active instanceof HTMLTextAreaElement ||
          (active instanceof HTMLElement && active.isContentEditable)
        ) {
          return
        }
        e.preventDefault()
        selectAll()
      }
    }

    container.addEventListener('keydown', onKeyDown)
    return () => {
      container.removeEventListener('keydown', onKeyDown)
    }
  }, [enabled, containerRef, selectAll])

  // -------------------------------------------------------------------------
  // Pointer events — marquee drawing
  //
  // Listeners are bound to the container div (available synchronously on
  // mount). The SVG element is read lazily inside each handler via
  // `svgRef.current` because it is populated after the Viewport child
  // mounts — binding directly to the SVG in an effect would miss it.
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!enabled) return
    const container = containerRef.current
    if (!container) return

    const onPointerDown = (e: PointerEvent) => {
      if (!marqueeActiveRef.current) return
      if (e.button !== 0) return
      const target = e.target as Element | null
      if (target && typeof target.closest === 'function') {
        // Mirror the viewport's d3-zoom filter exclusions: a drag starting on
        // a node, a resize handle, or a connection handle is that gesture, not
        // a marquee. Matters most in `'none'` mode where the marquee is always
        // armed and can't rely on a key being released to defer.
        if (target.closest('.system-canvas-node')) return
        if (target.closest('.system-canvas-resize-handles')) return
        if (target.closest('.system-canvas-connection-handles')) return
      }

      const svg = svgRef.current
      if (!svg) return

      const rect = svg.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top

      startScreenRef.current = { x, y }
      isDrawingRef.current = true
      pointerIdRef.current = e.pointerId
      setMarqueeRect({ x1: x, y1: y, x2: x, y2: y })

      try {
        container.setPointerCapture(e.pointerId)
      } catch {
        // ignore
      }

      e.preventDefault()
      e.stopPropagation()
    }

    const onPointerMove = (e: PointerEvent) => {
      if (!isDrawingRef.current) return
      if (e.pointerId !== pointerIdRef.current) return

      const svg = svgRef.current
      if (!svg) return

      const rect = svg.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      const start = startScreenRef.current!

      setMarqueeRect({ x1: start.x, y1: start.y, x2: x, y2: y })
    }

    const onPointerUp = (e: PointerEvent) => {
      if (!isDrawingRef.current) return
      if (e.pointerId !== pointerIdRef.current) return

      const svg = svgRef.current
      if (!svg) return

      const rect = svg.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      const start = startScreenRef.current!

      // Convert marquee corners to canvas-space
      const vp = viewport.current ?? { x: 0, y: 0, zoom: 1 }
      const topLeft = screenToCanvas(
        Math.min(start.x, x),
        Math.min(start.y, y),
        vp
      )
      const bottomRight = screenToCanvas(
        Math.max(start.x, x),
        Math.max(start.y, y),
        vp
      )

      const rectLeft = topLeft.x
      const rectTop = topLeft.y
      const rectRight = bottomRight.x
      const rectBottom = bottomRight.y

      // Hit-test nodes
      const nodes = nodesRef.current ?? []
      const matched = new Set<string>()
      for (const node of nodes) {
        const nRight = node.x + node.width
        const nBottom = node.y + node.height
        if (
          node.x < rectRight &&
          nRight > rectLeft &&
          node.y < rectBottom &&
          nBottom > rectTop
        ) {
          matched.add(node.id)
        }
      }

      setSelectedIds(matched)
      setMarqueeRect(null)
      isDrawingRef.current = false
      startScreenRef.current = null
      pointerIdRef.current = null

      try {
        container.releasePointerCapture(e.pointerId)
      } catch {
        // ignore
      }
    }

    container.addEventListener('pointerdown', onPointerDown)
    container.addEventListener('pointermove', onPointerMove)
    container.addEventListener('pointerup', onPointerUp)

    return () => {
      container.removeEventListener('pointerdown', onPointerDown)
      container.removeEventListener('pointermove', onPointerMove)
      container.removeEventListener('pointerup', onPointerUp)
    }
  }, [enabled, containerRef, svgRef, viewport, nodesRef])

  return {
    selectedIds,
    selectNode,
    toggleNode,
    selectAll,
    clearSelection,
    selectMultiple,
    marqueeRect,
    marqueeActiveRef,
  }
}
