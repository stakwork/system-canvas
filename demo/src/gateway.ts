import React, { createElement } from 'react'
import type {
  CanvasData,
  CanvasNode,
  CanvasTheme,
  SlotContext,
} from 'system-canvas'
import { midnightTheme, resolveTheme } from 'system-canvas'

/**
 * Render the gateway's hub-and-spoke network glyph + title as a single
 * `body` slot. The icon sits centered horizontally near the top of the
 * body region; the "Agent Gateway" title sits centered below it. We
 * render this as raw SVG (not `NodeIcon`) because the glyph mixes a
 * stroked polygon hub with stroked outer circles and thin connector
 * lines — `NodeIcon` only handles flat path arrays, so inlining gives
 * us the control to fit-line-to-shape-edge cleanly.
 *
 * Geometry: a central pointy-top hexagon (stroke only) with three
 * peripheral circles (stroke only) arranged as an inverted triangle —
 * two on top (upper-left, upper-right) and one below (bottom-center).
 * Connector lines run from the hub edge to each peripheral circle's
 * edge so the strokes meet cleanly without overlap.
 *
 * Authored in a 24-unit source box and scaled to `iconSize` here.
 */
function renderGatewayBody(ctx: SlotContext): React.ReactNode {
  const { region, theme } = ctx
  const iconSize = 30
  const titleFs = 16
  const gap = 12
  // Center the icon + title block vertically within the body region.
  const blockHeight = iconSize + gap + titleFs
  const blockTop = region.y + (region.height - blockHeight) / 2
  const iconCx = region.x + region.width / 2
  const iconCy = blockTop + iconSize / 2
  const titleY = blockTop + iconSize + gap + titleFs * 0.82

  // Glyph coords in a 24-unit source box.
  const src = 24
  const scale = iconSize / src
  const sx = (u: number) => iconCx + (u - src / 2) * scale
  const sy = (u: number) => iconCy + (u - src / 2) * scale

  const color = theme.node.labelColor

  // Hub: pointy-top hexagon centered at (12, 12) with circumradius 4.
  // For line-stop math we approximate the hub by its inscribed-ish
  // radius along each spoke direction. The peripherals sit far enough
  // out that using the circumradius is visually fine.
  const hubCenter = { x: 12, y: 12 }
  const hubR = 3
  const sqrt3over2 = Math.sqrt(3) / 2
  // Pointy-top hexagon vertices, clockwise from the top.
  const hexVerts: Array<[number, number]> = [
    [hubCenter.x, hubCenter.y - hubR],
    [hubCenter.x + hubR * sqrt3over2, hubCenter.y - hubR / 2],
    [hubCenter.x + hubR * sqrt3over2, hubCenter.y + hubR / 2],
    [hubCenter.x, hubCenter.y + hubR],
    [hubCenter.x - hubR * sqrt3over2, hubCenter.y + hubR / 2],
    [hubCenter.x - hubR * sqrt3over2, hubCenter.y - hubR / 2],
  ]
  const hexPath =
    'M ' +
    hexVerts
      .map(([vx, vy]) => `${sx(vx)} ${sy(vy)}`)
      .join(' L ') +
    ' Z'

  // Two peripherals up, one down. Radius 1.6 in source units.
  const periR = 1.6
  const peripherals = [
    { x: 6, y: 7 },   // upper-left
    { x: 18, y: 7 },  // upper-right
    { x: 12, y: 19.5 },   // bottom-center
  ]

  // For each spoke, compute a line that starts at the hub boundary
  // (hubR units out along the spoke direction) and ends at the
  // peripheral circle boundary (periR units back along the same
  // direction). Keeps the strokes from poking through either shape.
  const spokes = peripherals.map((p) => {
    const dx = p.x - hubCenter.x
    const dy = p.y - hubCenter.y
    const len = Math.hypot(dx, dy)
    const ux = dx / len
    const uy = dy / len
    return {
      x1: hubCenter.x + ux * hubR,
      y1: hubCenter.y + uy * hubR,
      x2: p.x - ux * periR,
      y2: p.y - uy * periR,
    }
  })

  const strokeWidth = 1.6

  // Outer ring enclosing the whole glyph. Pulled in slightly from the
  // 24-unit source-box edge to leave a small margin for the stroke;
  // the inner shapes are positioned with extra clearance so the ring
  // reads as a frame rather than a tight border.
  const ringR = 12

  return createElement(
    'g',
    { pointerEvents: 'none' },
    // Outer ring first, behind everything else.
    createElement('circle', {
      key: 'ring',
      cx: sx(hubCenter.x),
      cy: sy(hubCenter.y),
      r: ringR * scale,
      fill: 'none',
      stroke: color,
      strokeWidth,
      opacity: 0.85,
    }),
    // Connector lines from hub edge to each peripheral edge. Drawn
    // before the shape outlines so any sub-pixel overshoot is hidden
    // by the strokes that follow.
    ...spokes.map((s, i) =>
      createElement('line', {
        key: `spoke-${i}`,
        x1: sx(s.x1),
        y1: sy(s.y1),
        x2: sx(s.x2),
        y2: sy(s.y2),
        stroke: color,
        strokeWidth,
        strokeLinecap: 'round',
        opacity: 0.85,
      })
    ),
    // Hub hexagon (stroke only).
    createElement('path', {
      key: 'hub',
      d: hexPath,
      fill: 'none',
      stroke: color,
      strokeWidth,
      strokeLinejoin: 'round',
      opacity: 0.95,
    }),
    // Peripheral circles (stroke only).
    ...peripherals.map((p, i) =>
      createElement('circle', {
        key: `node-${i}`,
        cx: sx(p.x),
        cy: sy(p.y),
        r: periR * scale,
        fill: 'none',
        stroke: color,
        strokeWidth,
        opacity: 0.9,
      })
    ),
    // Title text centered below the icon.
    createElement(
      'text',
      {
        key: 'title',
        x: iconCx,
        y: titleY,
        textAnchor: 'middle',
        fill: color,
        fontSize: titleFs,
        fontFamily: theme.node.labelFont ?? theme.node.fontFamily,
        fontWeight: 600,
      },
      'Agent Gateway'
    )
  )
}

/**
 * Render a two-piece footer — left label + right value — over a single
 * `footer` slot region. `NodeText` already supports `align: 'start' | 'end'`,
 * so we just paint two `<text>` elements at the region's left and right
 * edges, vertically centered. Lets a single footer row carry both
 * "23 runs" and the cost without needing two separate slot positions.
 */
function renderSplitFooter(
  ctx: SlotContext,
  left: string,
  right: string,
  opts: { fontSize?: number; color?: string } = {}
): React.ReactNode {
  const { region, theme } = ctx
  const fs = opts.fontSize ?? 11
  const color = opts.color ?? '#9ca3af'
  const y = region.y + region.height / 2 + fs * 0.36
  const font = theme.node.fontFamily
  const common = {
    y,
    fill: color,
    fontSize: fs,
    fontFamily: font,
    fontWeight: 500,
    pointerEvents: 'none' as const,
  }
  return createElement(
    'g',
    { pointerEvents: 'none' },
    left &&
      createElement(
        'text',
        { ...common, x: region.x, textAnchor: 'start' },
        left
      ),
    right &&
      createElement(
        'text',
        { ...common, x: region.x + region.width, textAnchor: 'end' },
        right
      )
  )
}

/**
 * Gateway canvas — recreates the four-column LLM-routing flowchart from
 * the stakgraph/gateway admin UI's `/_plugin/ui/` Canvas page.
 *
 * Four columns:
 *   1. Agents   — one card per (agent × user) pairing. Bot icon, agent
 *                  name, per-pairing cost.
 *   2. Humans   — one card per distinct user. Person icon, username,
 *                  total cost across all that user's agents.
 *   3. Gateway  — singleton hub. "Agent Gateway" title, swarm-wide total.
 *   4. Providers— one per configured LLM provider (Anthropic / OpenAI /
 *                  Gemini / OpenRouter), with brand-icon glyphs.
 *
 * Design priorities, in order:
 *
 *   - Same card shape for agents and humans so the columns read as a
 *     coherent stack — icon + name in the top row, cost in the bottom.
 *   - Top row aligned: icon and name on the same Y. (This is the lib
 *     limitation we're working on in the parallel slot-region patch —
 *     this demo file is the proving ground.)
 *   - Provider brand icons via simple-icons path data, in `mode: 'fill'`
 *     with `viewBox: 24`. OpenRouter doesn't have a real brand glyph;
 *     a generic chain-link line glyph stands in.
 *
 * Mock data here exercises the layout edge cases (long usernames, varied
 * agent names, sub-cent costs) so we can validate before pushing back
 * upstream.
 */

// ---------------------------------------------------------------------------
// Formatting helpers (mirror the gateway UI's fmtUSD)
// ---------------------------------------------------------------------------

function fmtUSD(v: number): string {
  if (!v) return '$0.00'
  const digits = Math.abs(v) < 0.01 ? 6 : 2
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(v)
}

// ---------------------------------------------------------------------------
// Provider icons — vendored from the gateway UI's platforms.ts
// (simple-icons paths in a 24-unit viewBox, fill mode).
// ---------------------------------------------------------------------------

const ANTHROPIC_PATHS = [
  'M17.3041 3.541h-3.6718l6.696 16.918H24Zm-10.6082 0L0 20.459h3.7442l1.3693-3.5527h7.0052l1.3693 3.5528h3.7442L10.5363 3.5409Zm-.3712 10.2232 2.2914-5.9456 2.2914 5.9456Z',
]

const OPENAI_PATHS = [
  'M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z',
]

const GEMINI_PATHS = [
  'M11.04 19.32Q12 21.51 12 24q0-2.49.93-4.68.96-2.19 2.58-3.81t3.81-2.55Q21.51 12 24 12q-2.49 0-4.68-.93a12.3 12.3 0 0 1-3.81-2.58 12.3 12.3 0 0 1-2.58-3.81Q12 2.49 12 0q0 2.49-.96 4.68-.93 2.19-2.55 3.81a12.3 12.3 0 0 1-3.81 2.58Q2.49 12 0 12q2.49 0 4.68.96 2.19.93 3.81 2.55t2.55 3.81',
]

const OPENROUTER_PATHS = [
  // Hand-rolled chain-link line glyph in 16-unit space, stroke mode.
  'M 7 9 L 5 11 A 2.5 2.5 0 0 1 1.5 7.5 L 4 5',
  'M 9 7 L 11 5 A 2.5 2.5 0 0 1 14.5 8.5 L 12 11',
  'M 6 10 L 10 6',
]

// Bot + person icons recreated from the gateway UI's
// components/icons.tsx (which used <circle>/<rect> primitives that the
// lib's icon slot can't consume — only `d` path strings). Authored in
// the source 24-unit viewBox.
//
// Tiny dot trick: an `l 0.001 0` near-zero segment renders as a filled
// disc of diameter = stroke-width when `stroke-linecap: round` is
// applied (which the lib always does in stroke mode). Used here for
// the bot's antenna tip and eye dots.

const PERSON_PATHS = [
  'M 8.5 8 A 3.5 3.5 0 1 0 15.5 8 A 3.5 3.5 0 1 0 8.5 8',
  'M 5 20 c 0 -3.5 3.13 -6 7 -6 s 7 2.5 7 6',
]

const BOT_PATHS = [
  // Antenna stub + tip dot
  'M 12 4 v 2',
  'M 12 3.5 l 0.001 0',
  // Head/body: rounded rect from y=7 to y=20, leaving room for mouth
  'M 7 7 H 17 A 2.5 2.5 0 0 1 19.5 9.5 V 17.5 A 2.5 2.5 0 0 1 17 20 H 7 A 2.5 2.5 0 0 1 4.5 17.5 V 9.5 A 2.5 2.5 0 0 1 7 7 Z',
  // Eyes — higher up so they don't crowd the mouth
  'M 9 11.5 l 0.001 0',
  'M 15 11.5 l 0.001 0',
  // Mouth — pulled inward from the body floor
  'M 10 15.5 h 4',
]

// Per-provider icon meta (mode + viewBox), so a single `provider`
// category serves all four with a single accessor-driven slot.
const PROVIDER_ICON_META: Record<
  string,
  { mode: 'fill' | 'stroke'; viewBox: 16 | 24 }
> = {
  anthropic: { mode: 'fill', viewBox: 24 },
  openai: { mode: 'fill', viewBox: 24 },
  gemini: { mode: 'fill', viewBox: 24 },
  openrouter: { mode: 'stroke', viewBox: 16 },
}

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

export const gatewayTheme: CanvasTheme = resolveTheme(
  {
    name: 'gateway',
    icons: {
      bot: BOT_PATHS,
      person: PERSON_PATHS,
      anthropic: ANTHROPIC_PATHS,
      openai: OPENAI_PATHS,
      gemini: GEMINI_PATHS,
      openrouter: OPENROUTER_PATHS,
    },
    categories: {
      // ─── agent ───────────────────────────────────────────────────
      // Small per-(agent × user) card. Bot icon top-left, agent name
      // beside it as the default label, per-pairing cost in the
      // footer.
      //
      // The known lib limitation we're solving with the parallel
      // patch: when `topLeft icon` and `header text` coexist, the
      // header doesn't auto-reserve left padding for the icon.
      // Today we work around it by either (a) using inline-row layout
      // (no header) which vertically centers icon + label OR
      // (b) padding the header value with leading spaces. Once the
      // patch lands, neither workaround will be needed.
      agent: {
        defaultWidth: 160,
        defaultHeight: 52,
        fill: 'rgba(52, 211, 153, 0.08)',
        stroke: '#34d399',
        cornerRadius: 6,
        type: 'text',
        slots: {
          leftEdge: { kind: 'color', extent: 'full' },
          topLeft: { kind: 'icon', name: 'bot', viewBox: 24, size: 14 },
          header: {
            kind: 'text',
            value: (ctx: SlotContext) =>
              (ctx.node.customData?.name as string) ?? '',
            fontSize: 13,
            uppercase: false,
            useLabelFont: false,
            // `kind: 'text'` slots default to `theme.node.sublabelColor`
            // (muted gray) for every position except `body`. The agent
            // / user name is a primary identity, not a caption — bump
            // to the label color so it reads at full weight.
            color: (ctx: SlotContext) => ctx.theme.node.labelColor,
          },
          footer: {
            kind: 'custom',
            render: (ctx: SlotContext) =>
              renderSplitFooter(
                ctx,
                `${(ctx.node.customData?.calls as number) ?? 0} runs`,
                fmtUSD((ctx.node.customData?.cost as number) ?? 0)
              ),
          },
        },
      },

      // ─── user ────────────────────────────────────────────────────
      // Same recipe as `agent` so the columns visually rhyme. The
      // pill at top-right used to be the headline metric for users,
      // but moving the cost to the footer keeps both card kinds
      // identical in structure.
      user: {
        defaultWidth: 180,
        defaultHeight: 64,
        fill: 'rgba(34, 211, 238, 0.10)',
        stroke: '#22d3ee',
        cornerRadius: 8,
        type: 'text',
        slots: {
          leftEdge: { kind: 'color', extent: 'full' },
          topLeft: { kind: 'icon', name: 'person', viewBox: 24 },
          header: {
            kind: 'text',
            value: (ctx: SlotContext) =>
              (ctx.node.customData?.name as string) ?? '',
            fontSize: 13,
            uppercase: false,
            useLabelFont: false,
            // See note on the agent category — same color bump from
            // the muted slot default to the primary label color.
            color: (ctx: SlotContext) => ctx.theme.node.labelColor,
          },
          footer: {
            kind: 'custom',
            render: (ctx: SlotContext) =>
              renderSplitFooter(
                ctx,
                `${(ctx.node.customData?.requestCount as number) ?? 0} runs`,
                fmtUSD((ctx.node.customData?.totalCost as number) ?? 0)
              ),
          },
        },
      },

      // ─── gateway ─────────────────────────────────────────────────
      // Singleton hub. Big purple card sitting in the middle.
      //
      // At fit-zoom the card reads as the central "Agent Gateway" hub
      // with the swarm total in the footer. Zooming in past `threshold`
      // fades in a 4-row trust-context panel BELOW the node so the
      // operator can verify who's actually issuing tokens to this
      // mothership without leaving the canvas. The panel is a category
      // reveal — declared here, populated per-node via `customData`.
      gateway: {
        defaultWidth: 220,
        defaultHeight: 100,
        fill: 'rgba(167, 139, 250, 0.10)',
        stroke: '#a78bfa',
        cornerRadius: 10,
        type: 'text',
        slots: {
          topEdge: { kind: 'color', extent: 'full' },
          body: {
            kind: 'custom',
            render: renderGatewayBody,
          },
          footer: {
            kind: 'text',
            value: (ctx: SlotContext) =>
              `${fmtUSD((ctx.node.customData?.totalCost as number) ?? 0)} swarm total`,
            fontSize: 11,
            align: 'center',
            color: '#9ca3af',
          },
        },
        // Zoom in past the threshold and a "Provenance" panel fades in
        // below — a 1:1 mirror of the AuthorizedBy card on the live
        // RunDetail page (gateway/internal/adminapi/ui src/pages/
        // RunDetail.tsx#AuthorizedBy). Same shape, same labels, same
        // formatting, same conditional rendering for issuer + realm +
        // grace. `customData` here uses the real wire field names
        // (snake_case, matching `TrustOrg` in src/api/types.ts) so the
        // demo doubles as a copy-paste template for the live UI.
        reveals: {
          below: {
            kind: 'list',
            // Fully opaque at zoom 1.6; starts fading in at 1.2.
            threshold: 1.6,
            fadeWindow: 0.4,
            offset: 14,
            // Pin the panel's left edge to the node's left edge and
            // match the node's width so the panel reads as a
            // continuation of the card rather than a floating tooltip.
            width: 220,
            align: 'start',
            alignValues: true,
            // Reference details, not headline figures — render label
            // and value at normal weight so the panel reads as a flat
            // key/value dump.
            valueWeight: 400,
            labelWeight: 400,
            rows: [
              {
                icon: 'shield',
                label: 'Org',
                value: (ctx) =>
                  (ctx.node.customData?.org_id as string) ?? null,
              },
              {
                label: 'Pubkey',
                // Mirror RunDetail.tsx's `fmtKey`: keep first 8 and
                // last 6 characters of the key, joined by "…", but
                // only when the original is longer than 16 chars
                // (shorter keys render verbatim). The lib clamps to
                // panel width as a safety net regardless.
                value: (ctx) => {
                  const pk = ctx.node.customData?.pubkey as string | undefined
                  if (!pk) return null
                  return pk.length > 16
                    ? `${pk.slice(0, 8)}…${pk.slice(-6)}`
                    : pk
                },
                mono: true,
              },
              {
                // Conditional on the live card: only rendered when
                // issuer_url is truthy. Returning null from the
                // accessor drops the row and reflows siblings.
                label: 'Issuer',
                value: (ctx) =>
                  (ctx.node.customData?.issuer_url as string) || null,
              },
              {
                // The realm row on the live card comes from a sibling
                // endpoint (`GET /trust/status` → `realm_id`), not
                // from `TrustOrg` — we stash it under `realm_id` on
                // `customData` to keep the naming honest.
                label: 'Realm',
                value: (ctx) =>
                  (ctx.node.customData?.realm_id as string) || null,
                mono: true,
              }
            ],
          },
        },
      },

      // ─── provider ────────────────────────────────────────────────
      // One node per configured LLM provider. The icon is driven
      // per-node from `customData.icon` (matches a key in
      // `theme.icons` declared above), with per-provider mode +
      // viewBox dispatched off `PROVIDER_ICON_META`.
      provider: {
        defaultWidth: 180,
        defaultHeight: 64,
        fill: 'rgba(251, 146, 60, 0.08)',
        stroke: '#fb923c',
        cornerRadius: 8,
        type: 'text',
        slots: {
          rightEdge: { kind: 'color', extent: 'full' },
          topLeft: {
            kind: 'icon',
            name: (ctx: SlotContext) =>
              (ctx.node.customData?.icon as string) ?? 'anthropic',
            mode: (ctx: SlotContext) =>
              PROVIDER_ICON_META[ctx.node.customData?.icon as string]?.mode ??
              'fill',
            viewBox: (ctx: SlotContext) =>
              PROVIDER_ICON_META[ctx.node.customData?.icon as string]
                ?.viewBox ?? 24,
          },
          header: {
            kind: 'text',
            value: (ctx: SlotContext) =>
              (ctx.node.customData?.name as string) ?? '',
            fontSize: 13,
            uppercase: false,
            useLabelFont: false,
            color: (ctx: SlotContext) => ctx.theme.node.labelColor,
          },
        },
      },
    },
  },
  midnightTheme,
)

// ---------------------------------------------------------------------------
// Mock data — exercises edge cases the live gateway data has hit:
//   - sub-cent costs (6 decimal formatting)
//   - long usernames (`evanfeenstra-with-extras`)
//   - mix of one-off and high-volume agents
// ---------------------------------------------------------------------------

interface AgentUserSpend {
  agent_name: string
  user_id: string
  user_name: string
  total_cost: number
  request_count: number
}

const MOCK_ROWS: AgentUserSpend[] = [
  // Heavy user with multiple agents
  { agent_name: 'chat-agent', user_id: 'evanfeenstra', user_name: 'evanfeenstra', total_cost: 0.142391, request_count: 412 },
  { agent_name: 'code-agent', user_id: 'evanfeenstra', user_name: 'evanfeenstra', total_cost: 0.089123, request_count: 218 },
  { agent_name: 'web-search', user_id: 'evanfeenstra', user_name: 'evanfeenstra', total_cost: 0.012004, request_count: 63 },
  { agent_name: 'review-changes', user_id: 'evanfeenstra', user_name: 'evanfeenstra', total_cost: 0.003113, request_count: 31 },
  // Lighter user
  { agent_name: 'chat-agent', user_id: 'u_alice', user_name: 'u_alice', total_cost: 0.006469, request_count: 63 },
  { agent_name: 'code-agent', user_id: 'u_alice', user_name: 'u_alice', total_cost: 0.004003, request_count: 41 },
  // One-off user
  { agent_name: 'web-search', user_id: 'u_bob', user_name: 'u_bob', total_cost: 0.003113, request_count: 31 },
  // Tiny-cost edge case
  { agent_name: 'code-agent', user_id: 'u_eve', user_name: 'u_eve', total_cost: 0.000088, request_count: 1 },
]

// Per-provider brand-ish colors. Drives both the node stroke (and thus
// the rightEdge color strip via inheritance) and the brand-icon fill.
const PROVIDERS = [
  { id: 'anthropic', label: 'Anthropic', color: '#d97706' }, // amber
  { id: 'openai', label: 'OpenAI', color: '#10a37f' }, // OpenAI green
  { id: 'gemini', label: 'Gemini', color: '#4285f4' }, // Google blue
  { id: 'openrouter', label: 'OpenRouter', color: '#a855f7' }, // purple
]

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

const COL_X = {
  agent: -600,
  user: -300,
  gateway: 40,
  provider: 360,
} as const

const SIZE = {
  agent: { w: 160, h: 52, gap: 10 },
  user: { w: 180, h: 64, gap: 16 },
  gateway: { w: 220, h: 100 },
  provider: { w: 180, h: 64, gap: 16 },
} as const

function stackY(count: number, i: number, h: number, gap: number): number {
  const totalH = count * h + (count - 1) * gap
  const startY = -totalH / 2
  return startY + i * (h + gap) + h / 2 // node centers at this y
}

function buildGatewayCanvas(): CanvasData {
  const rows = MOCK_ROWS

  // Roll up by user (for the User column) while iterating rows once.
  const userTotals = new Map<
    string,
    { totalCost: number; requestCount: number; userName: string }
  >()
  let swarmTotal = 0
  for (const r of rows) {
    swarmTotal += r.total_cost
    const u = userTotals.get(r.user_id)
    if (u) {
      u.totalCost += r.total_cost
      u.requestCount += r.request_count
    } else {
      userTotals.set(r.user_id, {
        totalCost: r.total_cost,
        requestCount: r.request_count,
        userName: r.user_name || r.user_id,
      })
    }
  }

  const users = Array.from(userTotals.entries())
  users.sort((a, b) => b[1].totalCost - a[1].totalCost)

  const nodes: CanvasNode[] = []

  // Agents column — one per pairing.
  rows.forEach((r, i) => {
    nodes.push({
      id: `agent:${r.agent_name}:${r.user_id}`,
      type: 'text',
      category: 'agent',
      text: '',
      x: COL_X.agent,
      y: stackY(rows.length, i, SIZE.agent.h, SIZE.agent.gap),
      width: SIZE.agent.w,
      height: SIZE.agent.h,
      customData: {
        name: r.agent_name,
        cost: r.total_cost,
        calls: r.request_count,
      },
    })
  })

  // Users column.
  users.forEach(([userID, agg], i) => {
    nodes.push({
      id: `user:${userID}`,
      type: 'text',
      category: 'user',
      text: '',
      x: COL_X.user,
      y: stackY(users.length, i, SIZE.user.h, SIZE.user.gap),
      width: SIZE.user.w,
      height: SIZE.user.h,
      customData: {
        name: agg.userName,
        totalCost: agg.totalCost,
        requestCount: agg.requestCount,
      },
    })
  })

  // Gateway singleton.
  //
  // `customData` here feeds two things: the existing footer slot reads
  // `totalCost`, and the zoom-gated reveal panel reads the trust-
  // registry fields. Field names mirror the live wire shape exactly —
  // see `TrustOrg` in gateway/internal/adminapi/ui src/api/types.ts —
  // so the demo doubles as a copy-paste template for the live UI:
  //
  //   org_id                  — registry key, rendered next to "Org"
  //   pubkey                  — ed25519 public key, fmtKey-truncated
  //   issuer_url              — JWT issuer URL (optional)
  //   grace_pubkeys           — keys still accepted during rotation
  //   grace_until             — grace-window expiry timestamp
  //
  // `realm_id` belongs to the swarm (GET /trust/status), not to the
  // TrustOrg record itself — but the live AuthorizedBy card renders it
  // alongside the trust fields, so we stash it on the same node here.
  // `revocation_poll_seconds` exists on TrustOrg but the live UI never
  // displays it, so we omit it here too.
  nodes.push({
    id: 'gateway',
    type: 'text',
    category: 'gateway',
    text: 'Agent Gateway',
    x: COL_X.gateway,
    y: 0,
    width: SIZE.gateway.w,
    height: SIZE.gateway.h,
    customData: {
      totalCost: swarmTotal,
      org_id: 'sphinx-labs',
      pubkey:
        '1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b',
      issuer_url: 'https://auth.sphinx.chat',
      realm_id: 'mothership-prod',
      grace_pubkeys: ['9f8e7d6c5b4a39281706f5e4d3c2b1a0' /* one rotating key */],
      grace_until: '2026-06-01T00:00:00Z',
    },
  })

  // Providers column.
  PROVIDERS.forEach((p, i) => {
    nodes.push({
      id: `provider:${p.id}`,
      type: 'text',
      category: 'provider',
      text: '',
      x: COL_X.provider,
      y: stackY(PROVIDERS.length, i, SIZE.provider.h, SIZE.provider.gap),
      width: SIZE.provider.w,
      height: SIZE.provider.h,
      color: p.color,
      customData: { name: p.label, icon: p.id },
    })
  })

  return { nodes, edges: [] }
}

export const gatewayRoot: CanvasData = buildGatewayCanvas()

// No sub-canvases (yet) — the gateway page is a single root view.
// Reserved for a future "drill into agent" flow that lists per-call
// logs as nested nodes.
export const gatewayCanvasMap: Record<string, CanvasData> = {}
