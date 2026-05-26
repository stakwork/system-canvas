import { createElement } from 'react'
import type {
  CanvasData,
  CanvasNode,
  CanvasTheme,
  SlotContext,
} from 'system-canvas'
import { darkTheme, resolveTheme } from 'system-canvas'

/**
 * Showcase canvas — reproduces the "org vision" dashboard mockup using
 * the category-slots system end to end. Demonstrates:
 *
 *   - `color` on `topEdge` — short, left-pinned accent strip.
 *   - `pill` on `topRight` — uppercase OK / ATTN / RISK status tag.
 *   - `count` on `topRightOuter` — notched tab badge hanging off the corner.
 *   - `text` on `header` — uppercase kicker (NOTE / CUSTOMER / REVENUE / ...).
 *   - `text` on `footer` — dimmed metrics line.
 *   - `custom` — arbitrary SVG (team-card layout, revenue figure, etc.).
 */

// ---------------------------------------------------------------------------
// Colors & theme
// ---------------------------------------------------------------------------

// Slightly lifted neutral so the near-black node surface stands out
// against the canvas. Keeps the mockup's inky feel but gives the cards
// a visible silhouette.
const BG = '#15171c'
const SURFACE = 'rgba(255, 255, 255, 0.03)'
const STROKE = '#363945'
const TEXT = 'rgba(255, 255, 255, 0.92)'
const MUTED = 'rgba(255, 255, 255, 0.45)'

const STATUS = {
  ok: '#22c55e',
  attn: '#f59e0b',
  risk: '#ef4444',
}

const ACCENT = {
  vision: '#a78bfa',
  note: '#f59e0b',
  decision: '#a78bfa',
  customer: '#22c55e',
  revenue: '#22c55e',
  service: '#67e8f9',
}

/**
 * Brand registry per service `customData.kind`. Each entry declares both
 * the visual identity (icon, color) AND the render mode for the icon —
 * `mode: 'stroke'` for the lib's built-in line glyphs (default), or
 * `mode: 'fill'` paired with `viewBox: 24` for brand silhouettes pulled
 * from simple-icons. Mixing the two in one registry is supported because
 * the `IconSlot` accessors resolve per-node.
 */
type ServiceMeta = {
  icon: string
  color: string
  mode: 'stroke' | 'fill'
  viewBox: 16 | 24
}

const SERVICE_KINDS: Record<string, ServiceMeta> = {
  // Library built-in line glyphs (16x16, stroked).
  database: { icon: 'database', color: '#60a5fa', mode: 'stroke', viewBox: 16 },
  server:   { icon: 'server',   color: '#f59e0b', mode: 'stroke', viewBox: 16 },
  cloud:    { icon: 'cloud',    color: '#67e8f9', mode: 'stroke', viewBox: 16 },
  cog:      { icon: 'cog',      color: '#a78bfa', mode: 'stroke', viewBox: 16 },
  // Brand glyph: simple-icons Vercel triangle, 24x24 filled silhouette.
  // Demonstrates `mode: 'fill'` + `viewBox: 24` on the same IconSlot.
  // The path data lives in `BRAND_ICONS` below and is registered on the
  // theme's `icons` map at theme-build time.
  vercel:   { icon: 'vercel',   color: '#f8fafc', mode: 'fill',   viewBox: 24 },
}

/**
 * Custom icons merged into the theme's icon set. Anything keyed here
 * wins over the library's built-ins (none of these names collide today).
 * Each entry is an array of `d` strings authored in the coordinate space
 * declared by the corresponding `SERVICE_KINDS[id].viewBox`.
 */
const BRAND_ICONS: Record<string, string[]> = {
  // simple-icons "vercel" — a single filled triangle in 24x24 space.
  vercel: ['m12 1.608 12 20.784H0Z'],
}

function serviceMeta(node: CanvasNode): ServiceMeta {
  const kind = (node.customData?.kind as string | undefined) ?? 'cloud'
  return SERVICE_KINDS[kind] ?? SERVICE_KINDS.cloud
}

/**
 * Blue → purple gradient painted across the vision title. Starts cooler
 * (sky blue) on the left and resolves into the vision accent violet
 * on the right.
 */
const VISION_GRADIENT = {
  from: '#60a5fa', // sky-400
  to: '#818cf8',   // indigo-400 — close to the blue so the shift reads as subtle
}

const LABEL_FONT =
  "'Inter', 'SF Pro Text', 'Helvetica Neue', system-ui, sans-serif"
const MONO_FONT =
  "'JetBrains Mono', 'SF Mono', ui-monospace, monospace"

// ---------------------------------------------------------------------------
// Typography & layout
// ---------------------------------------------------------------------------

const CARD_W = 240
const CARD_H = 104
const SMALL_W = 220
const SMALL_H = 76
const VISION_W = 340
const VISION_H = 116
const REVENUE_W = 220
const REVENUE_H = 108

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

const baseCard = {
  fill: SURFACE,
  stroke: STROKE,
  cornerRadius: 10,
}

/**
 * Status-card factory — the mockup's "dashboard card" pattern. Uses
 * color inheritance: the category's `stroke` is the status color, and
 * every slot omits an explicit `color` so it inherits `resolvedStroke`.
 * Changing `node.color` via the toolbar re-tints every slot at once.
 *
 *   - `topEdge` — solid color strip that bleeds into the rounded corners.
 *   - `topRight` pill — OK / ATTN / RISK tag.
 *   - `topRightOuter` count — hanging tab badge for blocker count.
 *   - `bodyTop` progress bar — inline capsule under the title.
 *   - `footer` metrics — dim "38% 4 blockers" line (still custom, uses
 *     `ctx.node.resolvedStroke` so it tracks color too).
 */
/**
 * Canonical "color picker that's really a status switcher" — 3 swatches
 * that patch `category` (not `color`), with `isActive` keyed on the
 * category name. Clicking a swatch transforms the node's stroke, slots,
 * and toolbar in one go because the new category owns all of that.
 */
const statusToolbar = [
  {
    id: 'status',
    label: 'Status',
    kind: 'swatches' as const,
    actions: [
      {
        id: 'status-ok',
        label: 'OK',
        swatch: STATUS.ok,
        patch: { category: 'status-ok' },
        isActive: (n: CanvasNode) => n.category === 'status-ok',
      },
      {
        id: 'status-attn',
        label: 'Attention',
        swatch: STATUS.attn,
        patch: { category: 'status-attn' },
        isActive: (n: CanvasNode) => n.category === 'status-attn',
      },
      {
        id: 'status-risk',
        label: 'Risk',
        swatch: STATUS.risk,
        patch: { category: 'status-risk' },
        isActive: (n: CanvasNode) => n.category === 'status-risk',
      },
    ],
  },
]

function statusCategory(
  status: 'ok' | 'attn' | 'risk',
  label: string
): any {
  const color = STATUS[status]
  return {
    ...baseCard,
    // The category's stroke IS the status color — slots inherit from it.
    stroke: color,
    defaultWidth: CARD_W,
    defaultHeight: CARD_H,
    type: 'text' as const,
    toolbar: statusToolbar,
    slots: {
      topEdge: { kind: 'color', extent: 'full' },
      bodyTop: {
        kind: 'progress',
        value: (ctx: SlotContext) =>
          parsePercent(ctx.node.customData?.primary),
      },
      topRight: { kind: 'pill', value: label },
      topRightOuter: {
        kind: 'count',
        value: (ctx: SlotContext) =>
          (ctx.node.customData?.count as number | undefined) ?? 0,
      },
      footer: {
        kind: 'custom',
        render: (ctx: SlotContext) =>
          renderMetricsFooter(ctx, ctx.node.resolvedStroke),
      },
    },
  }
}

/**
 * Parse a percentage-ish value from `customData`. Accepts `"38%"` and
 * `0.38` and `38`, all coercing to `0.38`. Returns 0 for anything else.
 */
function parsePercent(raw: unknown): number {
  if (typeof raw === 'number') {
    return raw > 1 ? raw / 100 : raw
  }
  if (typeof raw === 'string') {
    const m = raw.match(/(-?\d+(?:\.\d+)?)/)
    if (!m) return 0
    const n = Number(m[1])
    if (Number.isNaN(n)) return 0
    return n > 1 ? n / 100 : n
  }
  return 0
}

/**
 * Footer metrics — first piece muted ("38%"), second piece colored by
 * status ("4 blockers" in red, "7 ppl" in muted, etc). Read from
 * `customData.primary` + `customData.secondary`.
 */
function renderMetricsFooter(
  ctx: SlotContext,
  accent: string
): React.ReactNode {
  const { region, node, theme } = ctx
  const primary = String(node.customData?.primary ?? '')
  const secondary = String(node.customData?.secondary ?? '')
  const secondaryAccent = Boolean(node.customData?.secondaryAccent)

  if (!primary && !secondary) return null

  const fs = 11
  const y = region.y + region.height / 2 + fs * 0.36
  const font = theme.node.fontFamily

  const primaryProps = {
    x: region.x,
    y,
    fill: MUTED,
    fontSize: fs,
    fontFamily: font,
    fontWeight: 500,
    pointerEvents: 'none' as const,
  }
  const secondaryX = region.x + estimateTextWidth(primary, fs) + 8
  const secondaryProps = {
    x: secondaryX,
    y,
    fill: secondaryAccent ? accent : MUTED,
    fontSize: fs,
    fontFamily: font,
    fontWeight: secondaryAccent ? 600 : 500,
    pointerEvents: 'none' as const,
  }

  return createElement(
    'g',
    { pointerEvents: 'none' },
    primary && createElement('text', primaryProps, primary),
    secondary && createElement('text', secondaryProps, secondary)
  )
}

function estimateTextWidth(text: string, fontSize: number): number {
  // Rough monospace estimate — good enough for positioning the second
  // piece relative to the first.
  return text.length * fontSize * 0.62
}

/**
 * Team card — a small monochrome card with a colored status dot and a
 * metrics line. Used for the top row of the mockup.
 */
function teamCategory(): any {
  return {
    ...baseCard,
    defaultWidth: SMALL_W,
    defaultHeight: SMALL_H,
    type: 'text' as const,
    slots: {
      topLeft: {
        kind: 'dot',
        color: (ctx: SlotContext) =>
          STATUS[
            (ctx.node.customData?.status as 'ok' | 'attn' | 'risk') ?? 'ok'
          ],
      },
      footer: {
        kind: 'custom',
        render: (ctx: SlotContext) => renderTeamFooter(ctx),
      },
    },
  }
}

function renderTeamFooter(ctx: SlotContext): React.ReactNode {
  const { region, node, theme } = ctx
  const status = (node.customData?.status as 'ok' | 'attn' | 'risk') ?? 'ok'
  const blocked = node.customData?.blocked as number | undefined
  const total = node.customData?.total as string | number | undefined
  const members = node.customData?.members as string | undefined

  const fs = 11
  const y = region.y + region.height / 2 + fs * 0.36
  const font = theme.node.fontFamily
  const color = STATUS[status]

  // Layout: either "N blocked · M" (when blocked > 0), or "M members"/"M users".
  if (blocked != null && total != null) {
    const left = `${blocked} blocked`
    const mid = '·'
    const right = `${total}`
    const leftWidth = estimateTextWidth(left, fs)
    const midWidth = estimateTextWidth(mid, fs)
    return createElement(
      'g',
      { pointerEvents: 'none' },
      createElement(
        'text',
        {
          x: region.x,
          y,
          fill: color,
          fontSize: fs,
          fontFamily: font,
          fontWeight: 600,
          pointerEvents: 'none',
        },
        left
      ),
      createElement(
        'text',
        {
          x: region.x + leftWidth + 6,
          y,
          fill: MUTED,
          fontSize: fs,
          fontFamily: font,
          pointerEvents: 'none',
        },
        mid
      ),
      createElement(
        'text',
        {
          x: region.x + leftWidth + midWidth + 12,
          y,
          fill: MUTED,
          fontSize: fs,
          fontFamily: font,
          pointerEvents: 'none',
        },
        right
      )
    )
  }

  return createElement(
    'text',
    {
      x: region.x,
      y,
      fill: MUTED,
      fontSize: fs,
      fontFamily: font,
      pointerEvents: 'none',
    },
    members ?? ''
  )
}

/**
 * Vision card — larger, with a purple "12-MONTH VISION" kicker and a
 * sky-blue → indigo gradient title body that auto-wraps to the card
 * width.
 *
 * Originally implemented as a `body: { kind: 'custom' }` slot with a
 * ~50-line `renderVisionBody` function (manual `<linearGradient>` def,
 * manual `\n` splitting, manual line layout). After system-canvas
 * 0.1.3 / system-canvas-react 0.1.4, all of that is declarative:
 *
 *   - `wrap: true` (the default for body-position text) auto-wraps to
 *     `region.width` and honors `\n` for explicit paragraph breaks.
 *   - `fill: { from, to }` generates the per-node `<linearGradient>`
 *     def and paints text glyphs with `url(#…)`.
 *
 * Try it: select the vision card and double-click to open the editor.
 * Type a longer paragraph and watch the title reflow to fit the card.
 */
const visionCategory: any = {
  ...baseCard,
  defaultWidth: VISION_W,
  defaultHeight: VISION_H,
  stroke: 'rgba(167, 139, 250, 0.35)',
  fill: 'rgba(167, 139, 250, 0.05)',
  type: 'text' as const,
  slots: {
    header: {
      kind: 'text',
      value: '12-MONTH VISION',
      color: ACCENT.vision,
    },
    body: {
      kind: 'text',
      value: (ctx: SlotContext) => ctx.node.text ?? '',
      fill: VISION_GRADIENT,
      // 1.35× the base body font reads as a "headline" without
      // crowding the kicker above it.
      fontSize: (ctx: SlotContext) =>
        Math.round(ctx.theme.node.fontSize * 1.35),
      fontWeight: 600,
    },
  },
}

/**
 * Customer card — green kicker, large number, small meta line.
 */
const customerCategory: any = {
  ...baseCard,
  defaultWidth: SMALL_W,
  defaultHeight: 86,
  type: 'text' as const,
  slots: {
    header: {
      kind: 'text',
      value: 'CUSTOMER',
      color: ACCENT.customer,
    },
    footer: {
      kind: 'custom',
      render: (ctx: SlotContext) => {
        const meta = String(ctx.node.customData?.meta ?? '')
        if (!meta) return null
        const { region, theme } = ctx
        const fs = 11
        return createElement(
          'text',
          {
            x: region.x,
            y: region.y + region.height / 2 + fs * 0.36,
            fill: MUTED,
            fontSize: fs,
            fontFamily: theme.node.fontFamily,
            pointerEvents: 'none',
          },
          meta
        )
      },
    },
  },
}

/**
 * Revenue card — REVENUE kicker, large $$$ figure, "+18% MoM" meta.
 * The headline figure (`$142k`) uses a `body` slot with `kind: 'text'`
 * so the category owns the main-content rendering: bigger than a normal
 * label, label-font, bold, left-aligned under the header.
 */
const revenueCategory: any = {
  ...baseCard,
  defaultWidth: REVENUE_W,
  defaultHeight: REVENUE_H,
  type: 'text' as const,
  slots: {
    header: { kind: 'text', value: 'REVENUE', color: ACCENT.revenue },
    body: {
      kind: 'text',
      value: (ctx: SlotContext) => ctx.node.text ?? '',
      fontSize: 26,
      fontWeight: 700,
      useLabelFont: true,
    },
    footer: {
      kind: 'custom',
      render: (ctx: SlotContext) => {
        const delta = String(ctx.node.customData?.delta ?? '')
        const period = String(ctx.node.customData?.period ?? '')
        if (!delta && !period) return null
        const { region, theme } = ctx
        const fs = 11
        const y = region.y + region.height / 2 + fs * 0.36
        const deltaWidth = estimateTextWidth(delta, fs)
        return createElement(
          'g',
          { pointerEvents: 'none' },
          delta &&
            createElement(
              'text',
              {
                x: region.x,
                y,
                fill: ACCENT.revenue,
                fontSize: fs,
                fontFamily: theme.node.fontFamily,
                fontWeight: 600,
                pointerEvents: 'none',
              },
              delta
            ),
          period &&
            createElement(
              'text',
              {
                x: region.x + deltaWidth + 6,
                y,
                fill: MUTED,
                fontSize: fs,
                fontFamily: theme.node.fontFamily,
                pointerEvents: 'none',
              },
              period
            )
        )
      },
    },
  },
}

/**
 * Service card — demonstrates `kind: 'icon'`. A single `service` category
 * whose icon and accent color resolve from `customData.kind` against a
 * small brand registry. No header kicker — the icon IS the visual ID, the
 * body text is the user-typed service name. This is the canonical "one
 * category, many platforms" pattern (Vercel / EC2 / Postgres / etc. in
 * hive-style consumers — here we use the lib's built-in icon names so the
 * showcase has no external deps).
 *
 * The category itself has a static stroke/fill (the service-cyan accent),
 * but both the brand stripe on the left edge AND the topLeft icon use
 * NodeAccessor values to look up the per-brand color from
 * `customData.kind` at render time. Switching `customData.kind` re-paints
 * stripe + icon in one shot, no category swap needed.
 */
const serviceCategory: any = {
  ...baseCard,
  defaultWidth: SMALL_W,
  defaultHeight: SMALL_H,
  type: 'text' as const,
  stroke: hexAlpha(ACCENT.service, 0.45),
  fill: hexAlpha(ACCENT.service, 0.05),
  slots: {
    // Brand stripe down the left edge. Color resolves per-node from the
    // brand registry — distinct accent for each `customData.kind`.
    leftEdge: {
      kind: 'color',
      extent: 'full',
      color: (ctx: SlotContext) => serviceMeta(ctx.node).color,
    },
    // Icon next to the title. Every field is an accessor — they switch
    // as `customData.kind` changes. The Vercel card uses `mode: 'fill'`
    // and `viewBox: 24` (simple-icons format); every other card stays on
    // the lib's `mode: 'stroke'` + `viewBox: 16` line-glyph defaults.
    topLeft: {
      kind: 'icon',
      name: (ctx: SlotContext) => serviceMeta(ctx.node).icon,
      color: (ctx: SlotContext) => serviceMeta(ctx.node).color,
      mode: (ctx: SlotContext) => serviceMeta(ctx.node).mode,
      viewBox: (ctx: SlotContext) => serviceMeta(ctx.node).viewBox,
    },
  },
}

/**
 * Note / decision card — amber or purple kicker, tinted background.
 */
function accentNote(color: string, kicker: string): any {
  return {
    ...baseCard,
    defaultWidth: SMALL_W,
    defaultHeight: 110,
    type: 'text' as const,
    stroke: hexAlpha(color, 0.35),
    fill: hexAlpha(color, 0.05),
    slots: {
      header: { kind: 'text', value: kicker, color },
    },
  }
}

function hexAlpha(hex: string, a: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

// ---------------------------------------------------------------------------
// Theme build
// ---------------------------------------------------------------------------

export const showcaseTheme: CanvasTheme = resolveTheme(
  {
    name: 'showcase',
    background: BG,
    node: {
      ...darkTheme.node,
      fill: SURFACE,
      stroke: STROKE,
      cornerRadius: 10,
      labelColor: TEXT,
      sublabelColor: MUTED,
      fontFamily: MONO_FONT,
      labelFont: LABEL_FONT,
      fontSize: 13,
      sublabelFontSize: 11,
      strokeWidth: 1,
    },
    group: {
      ...darkTheme.group,
      fill: 'rgba(255,255,255,0.02)',
      stroke: 'rgba(255,255,255,0.08)',
      strokeDasharray: '4 4',
      labelColor: MUTED,
      labelFontSize: 11,
      cornerRadius: 10,
      strokeWidth: 1,
    },
    grid: {
      ...darkTheme.grid,
      color: 'rgba(255, 255, 255, 0.03)',
    },
    categories: {
      vision: visionCategory,
      team: teamCategory(),
      'status-risk': statusCategory('risk', 'RISK'),
      'status-attn': statusCategory('attn', 'ATTN'),
      'status-ok': statusCategory('ok', 'OK'),
      note: accentNote(ACCENT.note, 'NOTE'),
      decision: accentNote(ACCENT.decision, 'DECISION'),
      customer: customerCategory,
      revenue: revenueCategory,
      service: serviceCategory,
    },
    // Brand-icon paths merged into the theme's icon set. The library's
    // built-in stroked glyphs (database / server / cloud / cog / ...) stay
    // available; entries here are picked up by `kind: 'icon'` slots that
    // reference them by name. See `BRAND_ICONS` above.
    icons: BRAND_ICONS,
    toolbarAlign: 'left',
  },
  darkTheme
)

// ---------------------------------------------------------------------------
// Canvas layout
// ---------------------------------------------------------------------------

// Vertical rhythm
const ROW_Y = {
  vision: 0,
  teams: 200,
  initiatives: 380,
  secondary: 560,
  footer: 760,
  services: 900,
}

const teams: Array<{
  id: string
  label: string
  status: 'ok' | 'attn' | 'risk'
  blocked?: number
  total?: number | string
  members?: string
}> = [
  { id: 'hive', label: 'hive', status: 'ok', members: '6 members' },
  { id: 'bounty', label: 'bounty-platform', status: 'risk', blocked: 3, total: 11 },
  { id: 'sphinx-server', label: 'Sphinx Server', status: 'attn', blocked: 1, total: 5 },
  { id: 'graph-swarm', label: 'Graph & Swarm', status: 'ok', members: '8 members' },
  { id: 'sphinx-apps', label: 'Sphinx Apps', status: 'ok', members: '4 members' },
]

const initiatives: Array<{
  id: string
  label: string
  category: 'status-risk' | 'status-attn' | 'status-ok'
  primary: string
  secondary: string
  count?: number
}> = [
  {
    id: 'v2-migration',
    label: 'V2 Platform Migration',
    category: 'status-risk',
    primary: '38%',
    secondary: '4 blockers',
    count: 4,
  },
  {
    id: 'ai-orchestration',
    label: 'AI Agent Orchestration',
    category: 'status-attn',
    primary: '45%',
    secondary: '2 blockers',
    count: 2,
  },
  {
    id: 'sphinx-mobile',
    label: 'Sphinx Mobile App',
    category: 'status-ok',
    primary: '81%',
    secondary: '6 ppl',
  },
]

const secondary: Array<{
  id: string
  label: string
  category: 'status-attn' | 'status-ok'
  primary: string
  secondary: string
  count?: number
}> = [
  {
    id: 'stakeholder-dash',
    label: 'Stakeholder Dashboard',
    category: 'status-attn',
    primary: '26%',
    secondary: '1 blocker',
    count: 1,
  },
  {
    id: 'graph-network',
    label: 'Graph Network Expansion',
    category: 'status-ok',
    primary: '76%',
    secondary: '7 ppl',
  },
  {
    id: 'code-quality',
    label: 'Code Quality Automation',
    category: 'status-ok',
    primary: '65%',
    secondary: '4 ppl',
  },
]

// Horizontal layouts — just stack with consistent gaps.
const TEAM_GAP = 20
const CARD_GAP = 30

const teamsStartX = 0
const teamsTotalW = teams.length * SMALL_W + (teams.length - 1) * TEAM_GAP

const initiativesStartX = 0
const initiativesTotalW =
  initiatives.length * CARD_W + (initiatives.length - 1) * CARD_GAP

const secondaryTotalW =
  secondary.length * CARD_W + (secondary.length - 1) * CARD_GAP

// Center rows relative to the teams row (widest).
const centerX = teamsTotalW / 2

const nodes: CanvasNode[] = []

// --- Vision ---
// Long-ish paragraph (no manual `\n` breaks) to demonstrate the
// library's auto-wrap on a `body` text slot. Edit this card live to
// see the title reflow as you type — wrap math is in the library
// (`wrapTextWithBreaks` from `system-canvas`), and the gradient is
// generated by the slot renderer per node id.
nodes.push({
  id: 'vision',
  type: 'text',
  category: 'vision',
  text: '10x the decentralized content network and become the default home for creator-owned media',
  x: centerX - VISION_W / 2,
  y: ROW_Y.vision,
  width: VISION_W,
  height: VISION_H,
})

// --- Teams ---
teams.forEach((t, i) => {
  nodes.push({
    id: t.id,
    type: 'text',
    category: 'team',
    text: t.label,
    x: teamsStartX + i * (SMALL_W + TEAM_GAP),
    y: ROW_Y.teams,
    width: SMALL_W,
    height: SMALL_H,
    customData: {
      status: t.status,
      blocked: t.blocked,
      total: t.total,
      members: t.members,
    },
  })
})

// --- Initiatives ---
const initiativesOffsetX = centerX - initiativesTotalW / 2
initiatives.forEach((it, i) => {
  nodes.push({
    id: it.id,
    type: 'text',
    category: it.category,
    text: it.label,
    x: initiativesOffsetX + i * (CARD_W + CARD_GAP),
    y: ROW_Y.initiatives,
    width: CARD_W,
    height: CARD_H,
    customData: {
      primary: it.primary,
      secondary: it.secondary,
      secondaryAccent: it.category !== 'status-ok',
      count: it.count,
    },
  })
})

// Note card to the right of the initiatives row.
nodes.push({
  id: 'note-deprecation',
  type: 'text',
  category: 'note',
  text: 'API deprecation decision\nneeded this week',
  x: initiativesOffsetX + initiativesTotalW + CARD_GAP,
  y: ROW_Y.initiatives,
  width: SMALL_W,
  height: 110,
})

// --- Secondary initiatives ---
const secondaryOffsetX = centerX - secondaryTotalW / 2 - (CARD_W + CARD_GAP) / 2
secondary.forEach((it, i) => {
  nodes.push({
    id: it.id,
    type: 'text',
    category: it.category,
    text: it.label,
    x: secondaryOffsetX + i * (CARD_W + CARD_GAP),
    y: ROW_Y.secondary,
    width: CARD_W,
    height: CARD_H,
    customData: {
      primary: it.primary,
      secondary: it.secondary,
      secondaryAccent: it.category !== 'status-ok',
      count: it.count,
    },
  })
})

// Decision card to the right of the secondary row.
nodes.push({
  id: 'decision-pools',
  type: 'text',
  category: 'decision',
  text: 'Shared vs dedicated agent\npools?',
  x: secondaryOffsetX + secondaryTotalW + CARD_GAP,
  y: ROW_Y.secondary,
  width: SMALL_W,
  height: 110,
})

// --- Footer cards: customers + revenue ---
const footerItems: Array<{
  id: string
  category: 'customer' | 'revenue'
  title: string
  meta?: string
  delta?: string
  period?: string
}> = [
  { id: 'c-content', category: 'customer', title: 'Content Creators', meta: '12k users' },
  { id: 'c-dev', category: 'customer', title: 'Dev Teams', meta: '340 teams' },
  { id: 'c-ent', category: 'customer', title: 'Enterprise', meta: '8 in pipeline' },
  {
    id: 'rev',
    category: 'revenue',
    title: '$142k',
    delta: '+18%',
    period: 'MoM',
  },
]

const FOOTER_GAP = 20
const footerTotalW =
  footerItems.length * SMALL_W + (footerItems.length - 1) * FOOTER_GAP
const footerOffsetX = centerX - footerTotalW / 2

footerItems.forEach((it, i) => {
  nodes.push({
    id: it.id,
    type: 'text',
    category: it.category,
    text: it.title,
    x: footerOffsetX + i * (SMALL_W + FOOTER_GAP),
    y: ROW_Y.footer,
    width: SMALL_W,
    height: 86,
    customData: {
      meta: it.meta,
      delta: it.delta,
      period: it.period,
    },
  })
})

// --- Services row: kind: 'icon' demo ---
// Five service cards, each driven by a distinct `customData.kind`. The
// brand icon, the leftEdge stripe color, and the icon's mode/viewBox are
// all resolved per-node from the SERVICE_KINDS registry — one category
// renders five visually distinct cards via accessor-driven slots. The
// last card (Vercel) demonstrates the new `mode: 'fill'` + `viewBox: 24`
// path for brand silhouettes alongside the lib's stroked built-ins.
const services: Array<{ id: string; title: string; kind: string }> = [
  { id: 'svc-db', title: 'Postgres primary', kind: 'database' },
  { id: 'svc-srv', title: 'API gateway', kind: 'server' },
  { id: 'svc-cloud', title: 'CDN / edge', kind: 'cloud' },
  { id: 'svc-cog', title: 'Workers', kind: 'cog' },
  // Vercel — `mode: 'fill'` + `viewBox: 24` brand glyph. Demonstrates
  // mixing stroked line icons and filled brand silhouettes in a single
  // category's IconSlot via NodeAccessor resolution per node.
  { id: 'svc-vercel', title: 'Frontend (Vercel)', kind: 'vercel' },
]
const SERVICE_GAP = 20
const servicesTotalW =
  services.length * SMALL_W + (services.length - 1) * SERVICE_GAP
const servicesOffsetX = centerX - servicesTotalW / 2
services.forEach((s, i) => {
  nodes.push({
    id: s.id,
    type: 'text',
    category: 'service',
    text: s.title,
    x: servicesOffsetX + i * (SMALL_W + SERVICE_GAP),
    y: ROW_Y.services,
    width: SMALL_W,
    height: SMALL_H,
    customData: { kind: s.kind },
  })
})

export const showcaseRoot: CanvasData = {
  theme: { base: 'showcase' },
  nodes,
}

export const showcaseCanvasMap: Record<string, CanvasData> = {}
