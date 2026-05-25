import React, { useEffect, useRef, useState } from 'react'
import type {
  CanvasData,
  CanvasNode,
  CanvasTheme,
  ListReveal,
  MetricsReveal,
  ResolvedNode,
  RevealContext,
  RevealListRow,
  RevealMetricBlock,
  RevealPlacement,
  RevealSpec,
  SlotRect,
  TextReveal,
  ViewportState,
} from 'system-canvas'
import {
  computeRevealOpacity,
  computeRevealRegion,
  getCategoryReveals,
  measureTextWidth,
  resolveRevealAccessor,
  resolveRevealThresholds,
  revealEntries,
  rollupNodes,
  truncateToWidth,
  wrapTextWithBreaks,
} from 'system-canvas'
import { NodeIcon } from './NodeIcon.js'

// ---------------------------------------------------------------------------
// RevealsLayer
//
// A single SVG <g> layer that paints every category reveal for every node
// in the current canvas. Lives INSIDE the transformable group so reveal
// panels pan and zoom with the node they're attached to — same coordinate
// space as the node itself.
//
// Performance model: the layer polls the d3-zoom viewport on every animation
// frame via `getViewport()` (same pattern NodeToolbar and LaneHeaders use),
// but only re-renders when the set of "currently visible" reveals actually
// changes. Most pan frames don't cross any reveal's threshold, so the
// re-render is short-circuited — pan stays as cheap as it is today.
//
// Opacity is animated by setting `g.style.opacity` directly on the wrapping
// group; the React re-render only fires on the binary "in-fade-window vs.
// not" transition, not on every intermediate frame.
// ---------------------------------------------------------------------------

interface RevealsLayerProps {
  nodes: ResolvedNode[]
  theme: CanvasTheme
  canvases?: Record<string, CanvasData>
  /** Stable getter for the current viewport (pan + zoom). */
  getViewport: () => ViewportState
}

/**
 * One entry per (node, placement) pair that currently has a renderable
 * reveal. Computed off the latest viewport state.
 */
interface ActiveReveal {
  node: ResolvedNode
  placement: RevealPlacement
  spec: RevealSpec
  region: SlotRect
  /** Resolved opacity at the *snapshot* zoom — updated via DOM, not React. */
  opacity: number
}

export function RevealsLayer({
  nodes,
  theme,
  canvases,
  getViewport,
}: RevealsLayerProps) {
  // Snapshot of the zoom value that controls which reveals are mounted.
  // Updated only when a reveal crosses its `[threshold - fadeWindow,
  // threshold]` band — i.e. enters or leaves the "alive" range. Inside
  // the band we update opacity via direct DOM writes (see below).
  const [zoomTick, setZoomTick] = useState(getViewport().zoom)

  // Latest known zoom — used by the DOM-write opacity tick and read by
  // accessors so they see a consistent value within a frame.
  const zoomRef = useRef(getViewport().zoom)

  useEffect(() => {
    let raf = 0
    let lastZoom = -Infinity
    let lastTickedZoom = zoomTick

    const tick = () => {
      const vp = getViewport()
      const z = vp.zoom
      zoomRef.current = z

      if (z !== lastZoom) {
        lastZoom = z
        // Update opacity on every mounted reveal via direct DOM writes.
        // This avoids a React re-render for every frame while the
        // panels are inside a fade window. The wrapping <g> uses
        // `data-reveal-id` so we can find them without a ref-per-node
        // bookkeeping dance.
        if (rootRef.current) {
          const groups = rootRef.current.querySelectorAll<SVGGElement>(
            '[data-reveal-key]'
          )
          for (const g of Array.from(groups)) {
            const t = parseFloat(g.dataset.threshold ?? 'NaN')
            const f = parseFloat(g.dataset.fadeWindow ?? 'NaN')
            if (Number.isFinite(t) && Number.isFinite(f)) {
              const op = computeRevealOpacity(z, t, f)
              g.style.opacity = String(op)
            }
          }
        }

        // Decide whether the mount set should change. We re-render
        // when crossing the "alive vs. not" boundary for any reveal,
        // approximated by checking whether the integer-floored
        // distance-to-threshold band has changed for any active
        // category-bearing node. Cheaper proxy: re-tick state when
        // the zoom changes by more than 0.02 — that's enough to keep
        // the mount/unmount transitions sharp without thrashing.
        if (Math.abs(z - lastTickedZoom) >= 0.02) {
          lastTickedZoom = z
          setZoomTick(z)
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [getViewport, zoomTick])

  const rootRef = useRef<SVGGElement | null>(null)

  // Compute the active set off the most recent state-tick zoom. This is
  // recomputed when nodes/theme/canvases change OR when the zoom-tick
  // crosses the 0.02 threshold above. Inside that window opacity is
  // animated directly via DOM writes.
  const active = computeActiveReveals(nodes, theme, canvases, zoomTick)

  if (active.length === 0) return null

  return (
    <g
      ref={rootRef}
      className="system-canvas-reveals"
      pointerEvents="none"
    >
      {active.map((entry) => {
        const { threshold, fadeWindow } = resolveRevealThresholds(
          entry.spec,
          theme
        )
        const key = `${entry.node.id}:${entry.placement}`
        return (
          <g
            key={key}
            data-reveal-key={key}
            data-threshold={threshold}
            data-fade-window={fadeWindow}
            style={{ opacity: entry.opacity }}
          >
            <RevealRenderer
              node={entry.node}
              theme={theme}
              canvases={canvases}
              placement={entry.placement}
              spec={entry.spec}
              region={entry.region}
              zoom={zoomRef.current}
              opacity={entry.opacity}
            />
          </g>
        )
      })}
    </g>
  )
}

// ---------------------------------------------------------------------------
// Active-set computation
// ---------------------------------------------------------------------------

function computeActiveReveals(
  nodes: ResolvedNode[],
  theme: CanvasTheme,
  canvases: Record<string, CanvasData> | undefined,
  zoom: number
): ActiveReveal[] {
  const out: ActiveReveal[] = []
  for (const node of nodes) {
    const reveals = getCategoryReveals(node, theme)
    if (!reveals) continue
    for (const [placement, spec] of revealEntries(reveals)) {
      const { threshold, fadeWindow } = resolveRevealThresholds(spec, theme)
      // Below the fade band → skip entirely so no SVG is produced.
      if (zoom < threshold - fadeWindow) continue
      const region = computeRevealRegion(node, theme, placement, spec)
      const opacity = computeRevealOpacity(zoom, threshold, fadeWindow)
      // Build the context once so the visible-gate accessor sees the
      // same values as the renderer does.
      const ctx = buildRevealContext({
        node,
        theme,
        region,
        placement,
        zoom,
        opacity,
        canvases,
      })
      if (spec.visible !== undefined) {
        const v = resolveRevealAccessor(spec.visible, ctx)
        if (!v) continue
      }
      out.push({ node, placement, spec, region, opacity })
    }
  }
  return out
}

function buildRevealContext(args: {
  node: ResolvedNode
  theme: CanvasTheme
  region: SlotRect
  placement: RevealPlacement
  zoom: number
  opacity: number
  canvases?: Record<string, CanvasData>
}): RevealContext {
  const { node, theme, region, placement, zoom, opacity, canvases } = args
  const getSubCanvas = (ref: string) => canvases?.[ref]
  return {
    node,
    theme,
    region,
    placement,
    zoom,
    opacity,
    getSubCanvas,
    canvases,
    rollup: (predicate: (n: CanvasNode) => boolean) =>
      node.ref
        ? rollupNodes(getSubCanvas(node.ref), predicate)
        : { total: 0, matched: 0, fraction: 0 },
  }
}

// ---------------------------------------------------------------------------
// Reveal renderer — dispatches per kind
// ---------------------------------------------------------------------------

interface RevealRendererProps {
  node: ResolvedNode
  theme: CanvasTheme
  canvases?: Record<string, CanvasData>
  placement: RevealPlacement
  spec: RevealSpec
  region: SlotRect
  zoom: number
  opacity: number
}

function RevealRenderer(props: RevealRendererProps) {
  const { spec } = props
  switch (spec.kind) {
    case 'text':
      return <TextRevealRenderer {...props} spec={spec} />
    case 'list':
      return <ListRevealRenderer {...props} spec={spec} />
    case 'metrics':
      return <MetricsRevealRenderer {...props} spec={spec} />
    case 'custom':
      return <CustomRevealRenderer {...props} />
    default:
      return null
  }
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Paint the optional panel background (fill + border) behind a reveal. */
function PanelBackground({
  region,
  theme,
}: {
  region: SlotRect
  theme: CanvasTheme
}) {
  const td = theme.reveals
  const fill = td?.panelFill
  const stroke = td?.panelStroke
  const rx = td?.panelCornerRadius ?? 6
  if (!fill && !stroke) return null
  return (
    <rect
      x={region.x}
      y={region.y}
      width={region.width}
      height={region.height}
      rx={rx}
      fill={fill ?? 'none'}
      stroke={stroke ?? 'none'}
      strokeWidth={stroke ? 1 : 0}
    />
  )
}

/**
 * Build the per-reveal `RevealContext` for accessor calls inside a
 * specific renderer. Mirrors `buildRevealContext` above but the
 * `canvases` map flows in as a prop so the closure stays cheap.
 */
function makeCtx(
  props: Pick<
    RevealRendererProps,
    | 'node'
    | 'theme'
    | 'region'
    | 'placement'
    | 'zoom'
    | 'opacity'
    | 'canvases'
  >
): RevealContext {
  return buildRevealContext(props)
}

/**
 * Resolve a `NodeAccessor<string | null | undefined>` and coerce the
 * result into a string suitable for rendering (or null to skip).
 */
function resolveTextField(
  accessor: undefined | Parameters<typeof resolveRevealAccessor<string | null | undefined>>[0],
  ctx: RevealContext
): string | null {
  if (accessor === undefined) return null
  const v = resolveRevealAccessor(accessor, ctx)
  if (v === null || v === undefined) return null
  return String(v)
}

// ---------------------------------------------------------------------------
// kind: 'text' — headline + body + optional leading icon
// ---------------------------------------------------------------------------

const PANEL_PAD_X = 12
const PANEL_PAD_Y = 10

function TextRevealRenderer(props: RevealRendererProps & { spec: TextReveal }) {
  const { node, theme, region, spec } = props
  const ctx = makeCtx(props)
  const headline = resolveTextField(spec.headline, ctx)
  const body = resolveTextField(spec.body, ctx)
  const iconName = resolveTextField(spec.icon, ctx)
  if (!headline && !body) return null

  const fontSize = theme.node.fontSize
  const labelColor = resolveRevealAccessor(
    spec.headlineColor ?? (theme.node.labelColor as string),
    ctx
  )
  const bodyColor = resolveRevealAccessor(
    spec.bodyColor ?? (theme.node.sublabelColor as string),
    ctx
  )
  const iconColor = resolveRevealAccessor(
    spec.iconColor ?? (node.resolvedStroke as string),
    ctx
  )

  const align = spec.textAlign ?? 'start'
  const iconSize = 14
  const iconGap = 8
  const contentLeft = region.x + PANEL_PAD_X + (iconName ? iconSize + iconGap : 0)
  const contentRight = region.x + region.width - PANEL_PAD_X
  const contentWidth = Math.max(0, contentRight - contentLeft)

  // Anchor x for proportional text alignment.
  const anchorX =
    align === 'center'
      ? region.x + region.width / 2
      : align === 'end'
        ? contentRight
        : contentLeft
  const textAnchor: 'start' | 'middle' | 'end' =
    align === 'center' ? 'middle' : align === 'end' ? 'end' : 'start'

  // Layout: headline near the top, body wrapping below.
  const headlineFs = Math.round(fontSize * 1.05)
  const bodyFs = fontSize
  const headlineY = region.y + PANEL_PAD_Y + headlineFs * 0.85
  const bodyStartY = headlineY + (headline ? headlineFs * 0.9 : 0)
  const bodyLines = body
    ? wrapTextWithBreaks(body, contentWidth, bodyFs)
    : []
  const bodyLineHeight = Math.round(bodyFs * 1.35)

  return (
    <g>
      <PanelBackground region={region} theme={theme} />
      {iconName && (
        <NodeIcon
          icon={iconName}
          x={region.x + PANEL_PAD_X}
          y={region.y + PANEL_PAD_Y - 1}
          size={iconSize}
          color={iconColor}
          opacity={1}
          customIcons={theme.icons}
        />
      )}
      {headline && (
        <text
          x={anchorX}
          y={headlineY}
          fill={labelColor}
          fontSize={headlineFs}
          fontFamily={theme.node.labelFont ?? theme.node.fontFamily}
          fontWeight={600}
          textAnchor={textAnchor}
        >
          {headline}
        </text>
      )}
      {bodyLines.length > 0 && (
        <text
          x={anchorX}
          y={bodyStartY}
          fill={bodyColor}
          fontSize={bodyFs}
          fontFamily={theme.node.fontFamily}
          textAnchor={textAnchor}
        >
          {bodyLines.map((line, i) => (
            <tspan key={i} x={anchorX} dy={i === 0 ? '1em' : bodyLineHeight}>
              {line}
            </tspan>
          ))}
        </text>
      )}
    </g>
  )
}

// ---------------------------------------------------------------------------
// kind: 'list' — stack of optional [icon] [label] [value] rows
// ---------------------------------------------------------------------------

interface ResolvedListRow {
  icon: string | null
  iconColor: string
  label: string | null
  value: string
  valueColor: string
  mono: boolean
}

function ListRevealRenderer(props: RevealRendererProps & { spec: ListReveal }) {
  const { theme, region, spec } = props
  const ctx = makeCtx(props)
  const fontSize = spec.fontSize ?? theme.node.fontSize
  const rowH = spec.rowHeight ?? Math.round(fontSize * 1.6)
  const alignValues = spec.alignValues ?? true
  const valueWeight = spec.valueWeight ?? 600
  const labelWeight = spec.labelWeight ?? 500

  // Resolve every row up front so we know which rows are renderable
  // before we lay anything out.
  const resolved: ResolvedListRow[] = []
  for (const row of spec.rows) {
    const value = resolveRevealAccessor(row.value, ctx)
    if (value === null || value === undefined) continue
    resolved.push({
      icon: resolveTextField(row.icon, ctx),
      iconColor: resolveRevealAccessor(
        row.iconColor ?? (props.node.resolvedStroke as string),
        ctx
      ),
      label: resolveTextField(row.label, ctx),
      value: String(value),
      valueColor: resolveRevealAccessor(
        row.valueColor ?? (theme.node.labelColor as string),
        ctx
      ),
      mono: row.mono ?? false,
    })
  }
  if (resolved.length === 0) return null

  const labelColor = theme.node.sublabelColor
  const iconSize = 13
  const iconGap = 8
  const labelGap = 10

  // Compute the label column width — used when `alignValues` is on to
  // line every row's value at the same x.
  const labelCol = alignValues
    ? Math.max(
        0,
        ...resolved.map((r) =>
          r.label ? measureTextWidth(r.label, fontSize) : 0
        )
      )
    : 0

  // x positions. We always inset by PANEL_PAD_X; icons (when present
  // on any row) consume the leading column even on rows that don't
  // have one, so labels/values line up vertically.
  const anyIcon = resolved.some((r) => r.icon !== null)
  const xIcon = region.x + PANEL_PAD_X
  const xLabel = xIcon + (anyIcon ? iconSize + iconGap : 0)
  const xValue = xLabel + (labelCol > 0 ? labelCol + labelGap : 0)
  const valueRight = region.x + region.width - PANEL_PAD_X
  const valueMaxWidth = Math.max(0, valueRight - xValue)

  const fontFamily = theme.node.fontFamily
  const monoFamily =
    'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, monospace'

  return (
    <g>
      <PanelBackground region={region} theme={theme} />
      {resolved.map((r, i) => {
        const baselineY = region.y + PANEL_PAD_Y + rowH * (i + 0.5) + fontSize * 0.36
        // Safety net so the lib never paints values that overflow the
        // panel. Consumers who want middle-truncation or any other
        // custom shape should slice/format the string inside their
        // own accessor before returning it — `measureTextWidth` and
        // `truncateToWidth` are both exported from core for that.
        const renderedValue = truncateToWidth(r.value, valueMaxWidth, fontSize)
        return (
          <g key={i}>
            {r.icon && (
              <NodeIcon
                icon={r.icon}
                x={xIcon}
                y={baselineY - fontSize}
                size={iconSize}
                color={r.iconColor}
                opacity={1}
                customIcons={theme.icons}
              />
            )}
            {r.label && (
              <text
                x={xLabel}
                y={baselineY}
                fill={labelColor}
                fontSize={fontSize}
                fontFamily={fontFamily}
                fontWeight={labelWeight}
              >
                {r.label}
              </text>
            )}
            <text
              x={xValue}
              y={baselineY}
              fill={r.valueColor}
              fontSize={fontSize}
              fontFamily={r.mono ? monoFamily : fontFamily}
              fontWeight={valueWeight}
            >
              {renderedValue}
            </text>
          </g>
        )
      })}
    </g>
  )
}

// ---------------------------------------------------------------------------
// kind: 'metrics' — row of label/value/delta blocks
// ---------------------------------------------------------------------------

interface ResolvedMetricBlock {
  label: string | null
  value: string
  delta: string | null
  color: string
}

function MetricsRevealRenderer(
  props: RevealRendererProps & { spec: MetricsReveal }
) {
  const { theme, region, spec } = props
  const ctx = makeCtx(props)

  const resolved: ResolvedMetricBlock[] = []
  for (const block of spec.blocks) {
    const value = resolveRevealAccessor(block.value, ctx)
    if (value === null || value === undefined) continue
    resolved.push({
      label: resolveTextField(block.label, ctx),
      value: String(value),
      delta: resolveTextField(block.delta, ctx),
      color: resolveRevealAccessor(
        block.color ?? (theme.node.labelColor as string),
        ctx
      ),
    })
  }
  if (resolved.length === 0) return null

  const fontSize = theme.node.fontSize
  const labelFs = Math.round(fontSize * 0.85)
  const valueFs = Math.round(fontSize * 1.4)
  const deltaFs = Math.round(fontSize * 0.85)
  const fontFamily = theme.node.fontFamily

  // Evenly divide horizontal space between blocks.
  const innerLeft = region.x + PANEL_PAD_X
  const innerRight = region.x + region.width - PANEL_PAD_X
  const innerWidth = Math.max(0, innerRight - innerLeft)
  const blockWidth = innerWidth / resolved.length

  const topPad = PANEL_PAD_Y
  const labelY = region.y + topPad + labelFs * 0.85
  const valueY = labelY + valueFs * 0.95
  const deltaY = valueY + deltaFs * 1.1

  return (
    <g>
      <PanelBackground region={region} theme={theme} />
      {resolved.map((b, i) => {
        const cx = innerLeft + blockWidth * (i + 0.5)
        return (
          <g key={i}>
            {b.label && (
              <text
                x={cx}
                y={labelY}
                fill={theme.node.sublabelColor}
                fontSize={labelFs}
                fontFamily={fontFamily}
                fontWeight={500}
                textAnchor="middle"
              >
                {b.label}
              </text>
            )}
            <text
              x={cx}
              y={valueY}
              fill={b.color}
              fontSize={valueFs}
              fontFamily={theme.node.labelFont ?? fontFamily}
              fontWeight={700}
              textAnchor="middle"
            >
              {b.value}
            </text>
            {b.delta && (
              <text
                x={cx}
                y={deltaY}
                fill={theme.node.sublabelColor}
                fontSize={deltaFs}
                fontFamily={fontFamily}
                textAnchor="middle"
              >
                {b.delta}
              </text>
            )}
          </g>
        )
      })}
    </g>
  )
}

// ---------------------------------------------------------------------------
// kind: 'custom' — consumer escape hatch
// ---------------------------------------------------------------------------

function CustomRevealRenderer(props: RevealRendererProps) {
  const ctx = makeCtx(props)
  const { spec } = props
  if (spec.kind !== 'custom') return null
  const out = spec.render(ctx)
  // React accepts most node shapes — coerce to ReactNode via the cast.
  return <>{out as React.ReactNode}</>
}


