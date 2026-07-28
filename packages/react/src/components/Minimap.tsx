import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { CanvasTheme, ResolvedNode, ViewportState } from 'system-canvas'
import { computeBoundingBox } from 'system-canvas'

interface MinimapProps {
  nodes: ResolvedNode[]
  theme: CanvasTheme
  getViewport: () => ViewportState
  setTransform: (
    transform: ViewportState,
    options?: { animate?: boolean; durationMs?: number }
  ) => void
  getSvgElement: () => SVGSVGElement | null
  width?: number
  height?: number
}

const PAD = 20
const DENSITY_NODE_THRESHOLD = 300
const DENSITY_PX_THRESHOLD = 3
const DENSITY_GRID = 8

// ---------------------------------------------------------------------------
// Pure helpers (exported for unit tests)
// ---------------------------------------------------------------------------

export type Bounds = ReturnType<typeof computeBoundingBox>

/** Union a node-only bounding box with a viewport world-space rect. */
export function unionBounds(
  nodeBounds: Bounds,
  vp: { x: number; y: number; width: number; height: number }
): Bounds {
  const minX = Math.min(nodeBounds.minX, vp.x)
  const minY = Math.min(nodeBounds.minY, vp.y)
  const maxX = Math.max(nodeBounds.maxX, vp.x + vp.width)
  const maxY = Math.max(nodeBounds.maxY, vp.y + vp.height)
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY }
}

/** Whether density-mode should activate for a given canvas snapshot. */
export function shouldUseDensityMode(
  nodeCount: number,
  avgNodeWidth: number,
  scale: number
): boolean {
  return nodeCount >= DENSITY_NODE_THRESHOLD && avgNodeWidth * scale < DENSITY_PX_THRESHOLD
}

/** Bucket an array of nodes into a DENSITY_GRID × DENSITY_GRID count grid. */
export function bucketNodes(
  nodes: ResolvedNode[],
  bounds: Bounds
): number[][] {
  const grid: number[][] = Array.from({ length: DENSITY_GRID }, () =>
    new Array<number>(DENSITY_GRID).fill(0)
  )
  const bw = bounds.width || 1
  const bh = bounds.height || 1
  for (const node of nodes) {
    const cx = node.x + node.width / 2
    const cy = node.y + node.height / 2
    const col = Math.min(
      DENSITY_GRID - 1,
      Math.max(0, Math.floor(((cx - bounds.minX) / bw) * DENSITY_GRID))
    )
    const row = Math.min(
      DENSITY_GRID - 1,
      Math.max(0, Math.floor(((cy - bounds.minY) / bh) * DENSITY_GRID))
    )
    grid[row][col]++
  }
  return grid
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function Minimap({
  nodes,
  theme,
  getViewport,
  setTransform,
  getSvgElement,
  width = 160,
  height = 120,
}: MinimapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [hovered, setHovered] = useState(false)
  const draggingRef = useRef(false)

  // Node-only bounds — recomputed only when nodes change.
  const nodeBoundsRef = useRef(computeBoundingBox(nodes))
  useEffect(() => {
    nodeBoundsRef.current = computeBoundingBox(nodes)
  }, [nodes])

  // Live bounds — union of node bounds + current viewport, written every paint().
  const boundsRef = useRef(computeBoundingBox(nodes))

  const toMinimap = useCallback(
    (cx: number, cy: number, bounds: Bounds) => {
      const bw = bounds.width || 1
      const bh = bounds.height || 1
      const scale = Math.min((width - PAD * 2) / bw, (height - PAD * 2) / bh)
      const ox = (width - bw * scale) / 2
      const oy = (height - bh * scale) / 2
      return {
        x: ox + (cx - bounds.minX) * scale,
        y: oy + (cy - bounds.minY) * scale,
        scale,
      }
    },
    [width, height]
  )

  const fromMinimap = useCallback(
    (mx: number, my: number, bounds: Bounds) => {
      const bw = bounds.width || 1
      const bh = bounds.height || 1
      const scale = Math.min((width - PAD * 2) / bw, (height - PAD * 2) / bh)
      const ox = (width - bw * scale) / 2
      const oy = (height - bh * scale) / 2
      return {
        cx: (mx - ox) / scale + bounds.minX,
        cy: (my - oy) / scale + bounds.minY,
      }
    },
    [width, height]
  )

  const paint = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // --- 1. Fetch viewport + svg early so we can compute unified bounds -----
    const vp = getViewport()
    const svg = getSvgElement()

    if (svg && vp.zoom > 0) {
      const svgRect = svg.getBoundingClientRect()
      const vpWorldRect = {
        x: -vp.x / vp.zoom,
        y: -vp.y / vp.zoom,
        width: svgRect.width / vp.zoom,
        height: svgRect.height / vp.zoom,
      }
      boundsRef.current = unionBounds(nodeBoundsRef.current, vpWorldRect)
    } else {
      boundsRef.current = nodeBoundsRef.current
    }

    const bounds = boundsRef.current

    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, width, height)

    if (bounds.width === 0 && bounds.height === 0) return

    // --- 2. Compute scale once for this frame --------------------------------
    const bw = bounds.width || 1
    const bh = bounds.height || 1
    const frameScale = Math.min((width - PAD * 2) / bw, (height - PAD * 2) / bh)

    // --- 3. Draw nodes (or density map) --------------------------------------
    const avgNodeWidth =
      nodes.length > 0
        ? nodes.reduce((sum, n) => sum + n.width, 0) / nodes.length
        : 0

    if (shouldUseDensityMode(nodes.length, avgNodeWidth, frameScale)) {
      // Density heat-map mode
      const grid = bucketNodes(nodes, bounds)
      let maxCount = 0
      for (const row of grid) for (const c of row) if (c > maxCount) maxCount = c
      if (maxCount > 0) {
        const cellWorldW = bw / DENSITY_GRID
        const cellWorldH = bh / DENSITY_GRID
        const baseColor = theme.node.labelColor
        for (let row = 0; row < DENSITY_GRID; row++) {
          for (let col = 0; col < DENSITY_GRID; col++) {
            const count = grid[row][col]
            if (count === 0) continue
            // Top-left world coord of this cell
            const cellX = bounds.minX + col * cellWorldW
            const cellY = bounds.minY + row * cellWorldH
            const { x: mx, y: my } = toMinimap(cellX, cellY, bounds)
            const mw = cellWorldW * frameScale
            const mh = cellWorldH * frameScale
            const alpha = Math.min(0.85, 0.15 + (count / maxCount) * 0.7)
            ctx.fillStyle = baseColor
            ctx.globalAlpha = alpha
            roundRect(ctx, mx, my, Math.max(mw, 1), Math.max(mh, 1), 1)
            ctx.fill()
          }
        }
      }
    } else {
      // Per-node mode (existing behavior)
      for (const node of nodes) {
        const { x: mx, y: my, scale } = toMinimap(node.x, node.y, bounds)
        const mw = node.width * scale
        const mh = node.height * scale
        const color = node.resolvedStroke ?? node.resolvedFill ?? theme.node.labelColor
        ctx.fillStyle = color
        ctx.globalAlpha = node.type === 'group' ? 0.15 : 0.6
        const r = Math.min(2, (node.resolvedCornerRadius ?? 0) * scale)
        roundRect(ctx, mx, my, Math.max(mw, 2), Math.max(mh, 2), r)
        ctx.fill()
      }
    }
    ctx.globalAlpha = 1

    // --- 4. Draw viewport indicator (reuse vpWorldRect already computed) -----
    if (svg && vp.zoom > 0) {
      const svgRect = svg.getBoundingClientRect()
      const vpLeft = -vp.x / vp.zoom
      const vpTop = -vp.y / vp.zoom
      const vpWidth = svgRect.width / vp.zoom
      const vpHeight = svgRect.height / vp.zoom

      const tl = toMinimap(vpLeft, vpTop, bounds)
      const vw = vpWidth * tl.scale
      const vh = vpHeight * tl.scale

      ctx.strokeStyle = theme.node.labelColor
      ctx.lineWidth = 1.5
      ctx.globalAlpha = 0.7
      roundRect(ctx, tl.x, tl.y, vw, vh, 2)
      ctx.stroke()
    }
  }, [nodes, theme, width, height, getViewport, getSvgElement, toMinimap])

  // rAF loop for painting
  useEffect(() => {
    let raf = 0
    const tick = () => {
      paint()
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [paint])

  const jumpTo = useCallback(
    (e: React.MouseEvent | MouseEvent) => {
      const container = containerRef.current
      const svg = getSvgElement()
      if (!container || !svg) return
      const rect = container.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      // Use the live unified bounds so click coords match what is rendered.
      const bounds = boundsRef.current
      const { cx, cy } = fromMinimap(mx, my, bounds)

      const svgRect = svg.getBoundingClientRect()
      const vp = getViewport()
      const newX = -cx * vp.zoom + svgRect.width / 2
      const newY = -cy * vp.zoom + svgRect.height / 2

      if (draggingRef.current) {
        setTransform({ x: newX, y: newY, zoom: vp.zoom })
      } else {
        setTransform({ x: newX, y: newY, zoom: vp.zoom }, { animate: true, durationMs: 300 })
      }
    },
    [fromMinimap, getViewport, getSvgElement, setTransform]
  )

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      e.stopPropagation()
      draggingRef.current = true
      ;(e.target as Element).setPointerCapture(e.pointerId)
      jumpTo(e)
    },
    [jumpTo]
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!draggingRef.current) return
      jumpTo(e)
    },
    [jumpTo]
  )

  const onPointerUp = useCallback(() => {
    draggingRef.current = false
  }, [])

  if (nodes.length === 0) return null

  return (
    <div
      ref={containerRef}
      className="system-canvas-minimap"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => {
        setHovered(false)
        draggingRef.current = false
      }}
      style={{
        position: 'absolute',
        bottom: 12,
        left: 12,
        width,
        height,
        borderRadius: 8,
        background: theme.breadcrumbs.background,
        border: `1px solid ${theme.breadcrumbs.separatorColor}`,
        backdropFilter: 'blur(8px)',
        opacity: hovered ? 0.95 : 0.5,
        transition: 'opacity 200ms ease-out',
        cursor: 'pointer',
        overflow: 'hidden',
        zIndex: 5,
        pointerEvents: 'auto',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
        }}
      />
    </div>
  )
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}
