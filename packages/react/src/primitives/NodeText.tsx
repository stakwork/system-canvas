import React, { useId } from 'react'
import type { CanvasTheme, LinearGradientFill, SlotRect } from 'system-canvas'
import { truncateToWidth, wrapTextWithBreaks } from 'system-canvas'

interface NodeTextProps {
  region: SlotRect
  value: string
  theme: CanvasTheme
  color?: string
  /**
   * Optional gradient paint. When set, the component emits a per-instance
   * `<linearGradient>` def and uses `url(#…)` as the text fill, ignoring
   * `color`. Solid-color callers should pass `undefined` and rely on
   * `color` instead.
   */
  fill?: LinearGradientFill
  align?: 'start' | 'center' | 'end'
  fontWeight?: number
  /**
   * Render the label uppercase with letter-spacing. Useful for kicker
   * headers like `CUSTOMER` / `REVENUE`.
   */
  uppercase?: boolean
  /**
   * Use the theme's `labelFont` (display font) rather than `fontFamily`.
   * Defaults to `false` so footer metrics etc. stay monospace.
   */
  useLabelFont?: boolean
  /** Override the font family directly. */
  fontFamily?: string
  /** Override the font size (in px). */
  fontSize?: number
  /**
   * Wrap value to fit `region.width`. When true, splits on `\n` and
   * word-wraps each paragraph; output renders as one `<text>` with one
   * `<tspan>` per line, clipped to the region rect.
   */
  wrap?: boolean
  /** Cap rendered lines when `wrap` is true. Excess truncated with ellipsis. */
  maxLines?: number
  /** Override per-line vertical advance in px. Defaults to ~fontSize * 1.25. */
  lineHeight?: number
  /**
   * Vertical placement of the wrapped block within `region`. Defaults to
   * `'top'` (legacy behavior — block top-aligned, one ascent below
   * `region.y`). `'center'` shifts the block so its midline matches the
   * region's midline; `'bottom'` pins the block's last baseline near the
   * region's bottom. Only meaningful for `wrap: true`; the single-line
   * path always centers vertically in the region.
   */
  verticalAlign?: 'top' | 'center' | 'bottom'
}

/**
 * Text label inside a slot region. Used for headers, footers, body
 * titles, and any other in-slot text.
 *
 * Three rendering paths:
 *   1. **Single line, no wrap** — one `<text>` element (default for header
 *      / footer / corner positions).
 *   2. **Wrapped** — one `<text>` with `<tspan dy="…">` per wrapped line,
 *      clipped to the region rect (default for `body`-position text).
 *   3. **Gradient** — same as 1 or 2 but with a per-instance
 *      `<linearGradient>` def feeding the `fill` attribute.
 *
 * All paths set `pointerEvents="none"` so text never intercepts node clicks.
 */
export function NodeText({
  region,
  value,
  theme,
  color,
  fill,
  align = 'start',
  fontWeight = 500,
  uppercase = false,
  useLabelFont = false,
  fontFamily,
  fontSize: fontSizeProp,
  wrap = false,
  maxLines,
  lineHeight: lineHeightProp,
  verticalAlign = 'top',
}: NodeTextProps) {
  // Stable id per render so multiple wrapped/gradient nodes never collide on
  // shared `<defs>`. `useId` returns a deterministic value for SSR/CSR.
  const reactId = useId()
  const safeId = reactId.replace(/:/g, '')

  if (!value) return null

  const fontSize =
    fontSizeProp ??
    Math.max(9, Math.min(theme.node.fontSize - 2, region.height * 0.85))
  const lineHeight = lineHeightProp ?? Math.round(fontSize * 1.25)
  const anchor: 'start' | 'middle' | 'end' =
    align === 'start' ? 'start' : align === 'center' ? 'middle' : 'end'
  const x =
    align === 'start'
      ? region.x
      : align === 'center'
        ? region.x + region.width / 2
        : region.x + region.width

  const font =
    fontFamily ??
    (useLabelFont
      ? theme.node.labelFont ?? theme.node.fontFamily
      : theme.node.fontFamily)

  // Gradient setup. Same id is used by the `fill` attr below.
  const gradId = fill ? `sc-text-grad-${safeId}` : undefined
  const fillAttr = gradId ? `url(#${gradId})` : color ?? theme.node.sublabelColor

  // Text content prep.
  const displayValue = uppercase ? value.toUpperCase() : value

  // ----- Single line -----
  if (!wrap) {
    // Character-wise truncate when the rendered text would overflow
    // the region's right edge. Without this, a long header value
    // (e.g. a long username, file path, or any single-token string)
    // would render past the node's body — visually broken and a
    // mouse-event hazard if the consumer ever attached a click
    // listener to the text. Truncation is identity on values that
    // already fit, so this is free for the common case.
    //
    // The `wrap` path already clips to the region via `<clipPath>`,
    // so it doesn't need this guard.
    const rendered = truncateToWidth(displayValue, region.width, fontSize)
    const y = region.y + region.height / 2 + fontSize * 0.36
    return (
      <g pointerEvents="none">
        {fill && <GradientDef id={gradId!} fill={fill} />}
        <text
          x={x}
          y={y}
          fill={fillAttr}
          fontSize={fontSize}
          fontWeight={fontWeight}
          fontFamily={font}
          textAnchor={anchor}
          letterSpacing={uppercase ? 0.8 : 0.2}
          pointerEvents="none"
        >
          {rendered}
        </text>
      </g>
    )
  }

  // ----- Wrapped -----
  // Wrap to the region's full width. The slot layer clips wrapped
  // output to the region rect as a safety net, so any minor rendering
  // overflow under the rounded corners is hidden visually rather than
  // pre-empted by an aggressive inset (which would cause "wraps too
  // early" with whitespace still visible on the right).
  const lines = wrapTextWithBreaks(displayValue, region.width, fontSize, maxLines)
  if (lines.length === 0) return null

  // Baseline anchor: top of region + one ascent by default. Subsequent
  // lines use `dy={lineHeight}` so SVG handles vertical advance natively.
  // For `verticalAlign: 'center' | 'bottom'`, shift the first baseline so
  // the rendered block (height ≈ fontSize + (n-1)*lineHeight) is centered
  // or bottom-pinned within the region.
  const blockHeight = fontSize + (lines.length - 1) * lineHeight
  const topY = region.y + fontSize
  const baseY =
    verticalAlign === 'center'
      ? region.y + (region.height - blockHeight) / 2 + fontSize
      : verticalAlign === 'bottom'
        ? region.y + region.height - blockHeight + fontSize
        : topY
  const clipId = `sc-text-clip-${safeId}`

  return (
    <g pointerEvents="none">
      <defs>
        {fill && <GradientDef id={gradId!} fill={fill} />}
        <clipPath id={clipId}>
          <rect
            x={region.x}
            y={region.y}
            width={region.width}
            height={region.height}
          />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`} pointerEvents="none">
        <text
          x={x}
          y={baseY}
          fill={fillAttr}
          fontSize={fontSize}
          fontWeight={fontWeight}
          fontFamily={font}
          textAnchor={anchor}
          letterSpacing={uppercase ? 0.8 : 0.2}
          pointerEvents="none"
        >
          {lines.map((line: string, i: number) => (
            <tspan key={i} x={x} dy={i === 0 ? 0 : lineHeight}>
              {line || ' '}
            </tspan>
          ))}
        </text>
      </g>
    </g>
  )
}

/**
 * Inline `<linearGradient>` def. Kept local because it's only meaningful
 * paired with a `<text fill="url(#id)">` reference in the same component.
 */
function GradientDef({ id, fill }: { id: string; fill: LinearGradientFill }) {
  // Translate angle (deg) to gradientTransform-friendly rotation. Default
  // 0 = horizontal (x1=0,y1=0 → x2=1,y2=0), 90 = vertical, etc.
  const angle = fill.angle ?? 0
  return (
    <linearGradient
      id={id}
      x1="0"
      y1="0"
      x2="1"
      y2="0"
      gradientUnits="objectBoundingBox"
      gradientTransform={angle ? `rotate(${angle} 0.5 0.5)` : undefined}
    >
      <stop offset="0%" stopColor={fill.from} />
      <stop offset="100%" stopColor={fill.to} />
    </linearGradient>
  )
}
