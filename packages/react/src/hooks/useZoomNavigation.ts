import { useCallback, useEffect, useRef } from 'react'
import type {
  CanvasData,
  CanvasTheme,
  Rect,
  ResolvedNode,
  ViewportState,
} from 'system-canvas'
import {
  computeBoundingBox,
  fitBoundsIntoRect,
  canvasRectToScreenRect,
  resolveCanvas,
} from 'system-canvas'

/**
 * Controls how zoom-to-navigate behaves.
 */
export interface ZoomNavigationConfig {
  /**
   * When a ref-bearing node's on-screen size reaches this fraction of the
   * viewport in the dominant dimension, the library commits navigation
   * into the sub-canvas. Default 0.7.
   */
  enterThreshold?: number
  /**
   * When the current sub-canvas's on-screen bounding box shrinks to this
   * fraction of the viewport in the dominant dimension, the library pops
   * back to the parent. Should be well below `enterThreshold` to avoid
   * oscillation. Default 0.35.
   */
  exitThreshold?: number
  /**
   * When a ref-bearing node reaches this fraction of the viewport (a
   * lower bar than `enterThreshold`), the library pre-fetches its
   * sub-canvas via `onResolveCanvas` so the handoff is synchronous when
   * `enterThreshold` is crossed. Default 0.4.
   */
  prefetchThreshold?: number
  /**
   * Post-handoff, the child canvas is fit into the parent node's old
   * on-screen rect expanded by this factor around its center. A value of
   * 1.0 means "exactly where the parent node was"; 1.3 means the child
   * lands 30% larger than the parent node, centered on the same point.
   * The transform is then clamped so no child content falls outside the
   * viewport. Default 1.3.
   */
  landingScale?: number
  /**
   * Fraction of the target rect's smaller dimension reserved as padding
   * around the child content on landing. Gives the landed content visual
   * breathing room so it doesn't hug the edges of the parent node's old
   * rect. Default 0.08 (8%).
   */
  landingPadding?: number
  /**
   * Duration in milliseconds of the opacity fade-in applied to the new
   * canvas after a zoom-enter or zoom-exit handoff. Set to 0 to disable
   * fade entirely. Default 200.
   */
  fadeDuration?: number
}

interface UseZoomNavigationOptions {
  enabled: boolean
  config: Required<ZoomNavigationConfig>
  /**
   * The nodes of the *current* canvas, with resolved dimensions. Used to
   * hit-test against the viewport.
   */
  nodes: ResolvedNode[]
  /** The current canvas (used to compute its bbox for exit detection). */
  currentCanvas: CanvasData
  /**
   * The ref of the canvas we just entered via zoom-enter, along with the
   * resolved rect of the parent node at the moment of entry. Null when at
   * a canvas not reached via zoom-enter.
   */
  parentFrame: ParentFrame | null
  /** Sync canvases map — used for pre-resolution check and pre-fetch. */
  canvases?: Record<string, CanvasData>
  /** Async resolver — used for pre-fetch. */
  onResolveCanvas?: (ref: string) => Promise<CanvasData>
  /**
   * Called to seed pre-fetched canvas data into whatever cache
   * `navigateToRef` consults, so the subsequent navigation is synchronous.
   */
  onSeedCanvas?: (ref: string, data: CanvasData) => void
  /**
   * The active theme, needed so we can resolve the pre-fetched sub-canvas
   * to compute its bounding box for the handoff math.
   */
  theme: CanvasTheme
  /** Getter for the current viewport screen size. */
  getViewportSize: () => { width: number; height: number } | null
  /**
   * Getter for the current cursor position in screen-space relative to
   * the SVG's top-left corner. Returns null when no cursor has been
   * observed (pointer hasn't entered the canvas, or has just left).
   *
   * Used to anchor enter-detection: when the cursor is over a
   * ref-bearing node, only that node is eligible to enter — even if a
   * larger nearby ref-bearing node has crossed `enterThreshold` first.
   * Without this, zooming toward a small node "under" a larger one
   * accidentally navigates into the larger node because it grows past
   * the threshold sooner. When the cursor is absent, or sits over
   * empty space / a non-ref node, falls back to today's
   * "closest-to-viewport-center among threshold-crossers" behavior so a
   * cursor parked over a Note-style leaf node doesn't block legitimate
   * enter gestures on a nearby Initiative-style ref node.
   */
  getCursorScreenPos: () => { x: number; y: number } | null
  /**
   * Called to commit a zoom-enter navigation. Receives the (resolved)
   * node being entered and the target viewport transform that must be
   * applied on the newly-loaded canvas to make the handoff seamless.
   */
  onEnter: (node: ResolvedNode, targetTransform: ViewportState) => void
  /**
   * Called to commit a zoom-exit navigation. Receives the target viewport
   * transform that must be applied on the parent canvas to make the
   * handoff seamless.
   */
  onExit: (targetTransform: ViewportState) => void
}

/**
 * Remembers the parent node rect (in parent-canvas coordinates) and the
 * parent canvas ref for the canvas we most recently entered via
 * zoom-navigation. Used to compute the reverse handoff on zoom-exit.
 */
export interface ParentFrame {
  parentCanvasRef: string | undefined
  parentNodeRect: Rect
}

/**
 * Return a new rect expanded by `factor` around its center.
 * factor=1.0 is a no-op; factor=1.4 grows the rect by 40%.
 */
function expandRect(rect: Rect, factor: number): Rect {
  if (factor === 1) return rect
  const cx = rect.x + rect.width / 2
  const cy = rect.y + rect.height / 2
  const w = rect.width * factor
  const h = rect.height * factor
  return { x: cx - w / 2, y: cy - h / 2, width: w, height: h }
}

/**
 * Shift `transform` so that `bounds` rendered at that transform stays
 * fully inside the viewport (with a `margin` on each side). Zoom is not
 * changed. If the bounds at the given zoom are too large to fit in the
 * viewport, the content is centered instead.
 */
function clampTransformToViewport(
  transform: ViewportState,
  bounds: { minX: number; minY: number; width: number; height: number },
  viewport: { width: number; height: number },
  margin: number
): ViewportState {
  const { zoom } = transform
  let { x, y } = transform
  const scaledW = bounds.width * zoom
  const scaledH = bounds.height * zoom

  // Where the bounds currently land on screen.
  const screenLeft = bounds.minX * zoom + x
  const screenTop = bounds.minY * zoom + y

  // Horizontal
  if (scaledW + 2 * margin >= viewport.width) {
    // Too wide to respect margins — center horizontally.
    x = (viewport.width - scaledW) / 2 - bounds.minX * zoom
  } else {
    if (screenLeft < margin) x += margin - screenLeft
    else if (screenLeft + scaledW > viewport.width - margin)
      x -= screenLeft + scaledW - (viewport.width - margin)
  }

  // Vertical
  const newScreenTop = bounds.minY * zoom + y
  if (scaledH + 2 * margin >= viewport.height) {
    y = (viewport.height - scaledH) / 2 - bounds.minY * zoom
  } else {
    if (newScreenTop < margin) y += margin - newScreenTop
    else if (newScreenTop + scaledH > viewport.height - margin)
      y -= newScreenTop + scaledH - (viewport.height - margin)
  }

  return { x, y, zoom }
}

interface PrefetchState {
  ref: string
  data?: CanvasData
  loading: boolean
}

export function useZoomNavigation(options: UseZoomNavigationOptions) {
  const {
    enabled,
    config,
    nodes,
    currentCanvas,
    parentFrame,
    canvases,
    onResolveCanvas,
    onSeedCanvas,
    theme,
    getViewportSize,
    getCursorScreenPos,
    onEnter,
    onExit,
  } = options

  // Guard against firing the commit repeatedly when the viewport is
  // continuously changing past threshold. Cleared explicitly by the
  // consumer via clearCommitting() once the handoff has been applied.
  const committingRef = useRef(false)
  // Lock: when a click-triggered zoom is in flight, restricts enter-commits
  // to the intended target ref so a bystander node cannot hijack navigation.
  const pendingNavRefRef = useRef<string | null>(null)
  // Also reset on canvas change as a belt-and-braces fallback.
  useEffect(() => {
    committingRef.current = false
    pendingNavRefRef.current = null
  }, [currentCanvas])

  // Arm exit detection only after the child canvas has, at some point
  // since landing, filled at least `exitThreshold` of the viewport.
  // Without this, a sub-canvas whose content is small relative to the
  // parent node's on-screen rect (sparse initiative, single tiny node,
  // etc.) lands already-below-threshold and the very next viewport
  // change after handoff trips an immediate exit — the user clicks the
  // ref icon, sees the child for one frame, then any zoom-in attempt
  // (which generates a viewport-change event) bounces them back to the
  // parent. Arming on first "above threshold" observation means a small
  // child waits for a real zoom-in-then-out gesture before becoming
  // exit-eligible; a normally-sized child arms on the first frame and
  // behaves as before.
  const exitArmedRef = useRef(false)
  useEffect(() => {
    exitArmedRef.current = false
  }, [currentCanvas, parentFrame])

  // Most-recent pre-fetch in flight, keyed by ref to avoid duplicates.
  const prefetchRef = useRef<Map<string, PrefetchState>>(new Map())

  const prefetch = useCallback(
    (ref: string) => {
      if (!onResolveCanvas) return
      if (canvases?.[ref]) return // already synchronously available
      const existing = prefetchRef.current.get(ref)
      if (existing) return // already fetched or in flight
      const state: PrefetchState = { ref, loading: true }
      prefetchRef.current.set(ref, state)
      onResolveCanvas(ref)
        .then((data) => {
          state.data = data
          state.loading = false
          onSeedCanvas?.(ref, data)
        })
        .catch(() => {
          state.loading = false
        })
    },
    [canvases, onResolveCanvas, onSeedCanvas]
  )

  /**
   * Called on every viewport change. Detects enter/exit thresholds and
   * dispatches the appropriate handoff.
   */
  const handleViewportChange = useCallback(
    (vp: ViewportState) => {
      if (!enabled) return
      if (committingRef.current) return
      const size = getViewportSize()
      if (!size) return

      // --- Enter detection: any ref-bearing node filling the viewport ---
      //
      // First pass: find a ref-bearing node whose on-screen rect contains
      // the cursor (if a cursor position is available). When the user
      // is zooming toward a specific node, the d3-zoom anchor is the
      // cursor — not the viewport center — so the cursor is the most
      // reliable signal for "which node did the user mean?". If a
      // ref-bearing node is under the cursor, that node *exclusively*
      // owns enter-detection: a larger ref-bearing node sitting above
      // or below it will still grow past `enterThreshold` first, but we
      // ignore it here so the gesture commits on the hovered node once
      // it crosses the bar itself. Among nested ref-bearing nodes (rare,
      // but possible), the smallest screen-area wins — that's the one
      // the user is "deeper" into.
      //
      // Second pass (cursor over empty space / non-ref node / no
      // cursor observed): collect every on-screen ref-bearing node that
      // crosses thresholds and commit on the one whose center is closest
      // to the viewport center. This preserves today's behavior for
      // touchpad pinch with a stale pointer or cursor parked over a
      // leaf node, where a nearby Initiative-style ref node should
      // still legitimately enter.
      const cursor = getCursorScreenPos()
      const viewportCenterX = size.width / 2
      const viewportCenterY = size.height / 2

      // First pass: ref-bearing node under cursor (smallest wins for nesting).
      let cursorNode:
        | { node: ResolvedNode; screen: Rect; area: number }
        | null = null
      if (cursor) {
        for (const n of nodes) {
          if (!n.ref) continue
          const screen = canvasRectToScreenRect(
            { x: n.x, y: n.y, width: n.width, height: n.height },
            vp
          )
          if (
            cursor.x < screen.x ||
            cursor.x > screen.x + screen.width ||
            cursor.y < screen.y ||
            cursor.y > screen.y + screen.height
          ) {
            continue
          }
          const area = screen.width * screen.height
          if (!cursorNode || area < cursorNode.area) {
            cursorNode = { node: n, screen, area }
          }
        }
      }

      let bestCandidate:
        | { node: ResolvedNode; screen: Rect; distSq: number }
        | null = null

      if (cursorNode) {
        // Cursor-locked mode: only the hovered ref-node is eligible.
        // Other ref-nodes still get prefetched so the handoff stays
        // synchronous if the user pans away and zooms a different one.
        const screen = cursorNode.screen
        const fillFraction = Math.max(
          screen.width / size.width,
          screen.height / size.height
        )
        if (
          fillFraction >= config.prefetchThreshold &&
          cursorNode.node.ref
        ) {
          prefetch(cursorNode.node.ref)
        }
        if (fillFraction >= config.enterThreshold) {
          bestCandidate = { node: cursorNode.node, screen, distSq: 0 }
        }
        // Prefetch other on-screen ref-nodes that are warming up too.
        for (const n of nodes) {
          if (!n.ref) continue
          if (n === cursorNode.node) continue
          const s = canvasRectToScreenRect(
            { x: n.x, y: n.y, width: n.width, height: n.height },
            vp
          )
          const ff = Math.max(s.width / size.width, s.height / size.height)
          if (ff >= config.prefetchThreshold) prefetch(n.ref)
        }
      } else {
        // Fallback: closest-to-viewport-center among threshold-crossers.
        for (const n of nodes) {
          if (!n.ref) continue
          const screen = canvasRectToScreenRect(
            { x: n.x, y: n.y, width: n.width, height: n.height },
            vp
          )

          // The node must actually be on-screen — its center must lie
          // inside the viewport. Without this check, any ref-bearing
          // node grows with zoom and may pass the fill-fraction
          // threshold even when it's entirely off to the side; the
          // loop would then enter that node instead of the one the
          // user is actually zooming on.
          const centerX = screen.x + screen.width / 2
          const centerY = screen.y + screen.height / 2
          const centerOnScreen =
            centerX >= 0 &&
            centerX <= size.width &&
            centerY >= 0 &&
            centerY <= size.height
          if (!centerOnScreen) continue

          const fillFraction = Math.max(
            screen.width / size.width,
            screen.height / size.height
          )

          if (
            fillFraction >= config.prefetchThreshold &&
            fillFraction < config.enterThreshold
          ) {
            prefetch(n.ref)
          }

          if (fillFraction >= config.enterThreshold) {
            const dx = centerX - viewportCenterX
            const dy = centerY - viewportCenterY
            const distSq = dx * dx + dy * dy
            if (!bestCandidate || distSq < bestCandidate.distSq) {
              bestCandidate = { node: n, screen, distSq }
            }
          }
        }
      }

      if (
        bestCandidate &&
        !(
          pendingNavRefRef.current !== null &&
          bestCandidate.node.ref !== pendingNavRefRef.current
        )
      ) {
        // Lock guard: if a click-triggered zoom is in flight toward a specific
        // ref, the condition above skips enter-commit for any other node so a
        // bystander cannot hijack navigation. Prefetching still runs above.
        const n = bestCandidate.node
        const screen = bestCandidate.screen
        const ref = n.ref as string

        // Resolve the sub-canvas synchronously from canvases map or
        // pre-fetch cache. If not available, kick off a prefetch and
        // bail (discrete nav will take over via normal maxZoom pinning).
        const childData =
          canvases?.[ref] ?? prefetchRef.current.get(ref)?.data
        if (!childData) {
          prefetch(ref)
        } else {
          // Resolve child canvas so we can compute its bounding box.
          const resolved = resolveCanvas(childData, theme)
          if (resolved.nodes.length > 0) {
            const bounds = computeBoundingBox(resolved.nodes)
            // Target: fit child bbox into the parent node's on-screen
            // rect, expanded by `landingScale` around its center.
            // Expanding makes the child content land larger than the
            // parent node itself, while still anchored to where the
            // parent node was.
            const targetRect = expandRect(screen, config.landingScale)
            // Inset padding (proportional to the smaller dimension) so
            // the child content has breathing room inside the target
            // rect instead of hugging its edges.
            const landingPad =
              Math.min(targetRect.width, targetRect.height) *
              config.landingPadding
            let targetTransform = fitBoundsIntoRect(
              bounds,
              targetRect,
              landingPad
            )
            // Nudge the transform so the child bbox stays fully on
            // screen (with a small margin). This preserves the size and
            // only shifts the translation when the anchored position
            // would put content off the edge of the viewport.
            targetTransform = clampTransformToViewport(
              targetTransform,
              bounds,
              size,
              16
            )

            committingRef.current = true
            onEnter(n, targetTransform)
            return
          }
        }
      }

      // --- Exit detection: the current canvas shrunk below threshold ---
      if (parentFrame && nodes.length > 0) {
        const bounds = computeBoundingBox(nodes)
        if (bounds.width === 0 || bounds.height === 0) return
        const screen = canvasRectToScreenRect(
          {
            x: bounds.minX,
            y: bounds.minY,
            width: bounds.width,
            height: bounds.height,
          },
          vp
        )
        const fillFraction = Math.max(
          screen.width / size.width,
          screen.height / size.height
        )
        // Arm exit detection only once the child has been observed
        // filling at least `exitThreshold` of the viewport. See the
        // comment on `exitArmedRef` for the why.
        if (!exitArmedRef.current) {
          if (fillFraction > config.exitThreshold) {
            exitArmedRef.current = true
          }
          return
        }
        if (fillFraction <= config.exitThreshold) {
          // Target on the parent canvas: the parent node rect should
          // appear at the current on-screen rect of the child canvas bbox.
          const targetTransform = fitBoundsIntoRect(
            {
              minX: parentFrame.parentNodeRect.x,
              minY: parentFrame.parentNodeRect.y,
              maxX:
                parentFrame.parentNodeRect.x + parentFrame.parentNodeRect.width,
              maxY:
                parentFrame.parentNodeRect.y +
                parentFrame.parentNodeRect.height,
              width: parentFrame.parentNodeRect.width,
              height: parentFrame.parentNodeRect.height,
            },
            {
              x: screen.x,
              y: screen.y,
              width: screen.width,
              height: screen.height,
            }
          )
          committingRef.current = true
          onExit(targetTransform)
        }
      }
    },
    [
      enabled,
      nodes,
      parentFrame,
      canvases,
      theme,
      config,
      getViewportSize,
      getCursorScreenPos,
      prefetch,
      onEnter,
      onExit,
    ]
  )

  const clearCommitting = useCallback(() => {
    committingRef.current = false
    pendingNavRefRef.current = null
  }, [])

  const setPendingNavRef = useCallback((ref: string | null) => {
    pendingNavRefRef.current = ref
  }, [])

  return { handleViewportChange, clearCommitting, setPendingNavRef }
}
