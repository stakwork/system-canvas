import type { CanvasData } from 'system-canvas'
import { evenLanes } from 'system-canvas'

/**
 * "Nested worlds" example.
 *
 * Root canvas is a plain freeform org diagram — no lanes, nodes placed by
 * spatial meaning ("Product" is near "Design" because they collaborate).
 * Each team node `ref`s into a sub-canvas that has its OWN structure:
 *
 *   Product       → a roadmap (columns: Now/Next/Later, rows: teams)
 *   Engineering   → a kanban (columns: To Do / Doing / Review / Done)
 *   Release       → a swimlane (rows: design / eng / qa / release)
 *   Design        → another freeform diagram
 *
 * Each sub-canvas declares `theme: { base: '...' }` so the library
 * automatically swaps themes as the user navigates. Zoom into Product and
 * you land in the roadmap with its own palette; zoom back out and you're
 * back in the neutral org view.
 *
 * The Product node also sets `refCorner: 'topRight'` to demonstrate the
 * per-node override of which corner the navigable ref arrow is carved into
 * (the default is bottom-right) — compare it against the other team nodes.
 */

// ---------------------------------------------------------------------------
// Root: freeform org chart
// ---------------------------------------------------------------------------

export const nestedRoot: CanvasData = {
  theme: { base: 'dark' },
  nodes: [
    {
      id: 'company',
      type: 'text',
      text: 'Acme Co.',
      x: 280,
      y: 20,
      width: 160,
      height: 60,
      color: '6',
    },
    {
      id: 'product',
      type: 'text',
      text: 'Product\n(roadmap)',
      x: 40,
      y: 160,
      width: 160,
      height: 72,
      color: '5',
      ref: 'nested:product',
      // Per-node override: carve the navigable ref arrow into the TOP-RIGHT
      // corner instead of the default bottom-right. The other team nodes keep
      // the default so you can compare the two corners side by side.
      refCorner: 'topRight',
    },
    {
      id: 'engineering',
      type: 'text',
      text: 'Engineering\n(kanban)',
      x: 240,
      y: 160,
      width: 160,
      height: 72,
      color: '4',
      ref: 'nested:engineering',
    },
    {
      id: 'release',
      type: 'text',
      text: 'Release\n(swimlane)',
      x: 440,
      y: 160,
      width: 160,
      height: 72,
      color: '2',
      ref: 'nested:release',
    },
    {
      id: 'design',
      type: 'text',
      text: 'Design\n(freeform)',
      x: 640,
      y: 160,
      width: 160,
      height: 72,
      color: '3',
      ref: 'nested:design',
    },
  ],
  edges: [
    { id: 'r-e1', fromNode: 'company', toNode: 'product' },
    { id: 'r-e2', fromNode: 'company', toNode: 'engineering' },
    { id: 'r-e3', fromNode: 'company', toNode: 'release' },
    { id: 'r-e4', fromNode: 'company', toNode: 'design' },
    { id: 'r-e5', fromNode: 'product', toNode: 'engineering', label: 'specs' },
    { id: 'r-e6', fromNode: 'engineering', toNode: 'release', label: 'builds' },
    { id: 'r-e7', fromNode: 'design', toNode: 'product', label: 'mocks' },
  ],
}

// ---------------------------------------------------------------------------
// Product sub-canvas: a roadmap with columns AND rows
// ---------------------------------------------------------------------------

const PROD_COL = 300
const PROD_ROW = 160
const prodCell = (col: number, row: number, w = 200, h = 72) => ({
  x: col * PROD_COL + (PROD_COL - w) / 2,
  y: row * PROD_ROW + (PROD_ROW - h) / 2,
  width: w,
  height: h,
})

export const productSub: CanvasData = {
  theme: { base: 'roadmap' },
  columns: evenLanes(['Now', 'Next', 'Later'], PROD_COL, 0),
  rows: [
    { id: 'growth', label: 'Growth', start: 0, size: PROD_ROW },
    { id: 'platform', label: 'Platform', start: PROD_ROW, size: PROD_ROW },
    { id: 'mobile', label: 'Mobile', start: PROD_ROW * 2, size: PROD_ROW },
  ],
  nodes: [
    { id: 'p1', type: 'text', category: 'initiative', text: 'Referral program', ...prodCell(0, 0) },
    { id: 'p2', type: 'text', category: 'outcome', text: '2x signups', ...prodCell(1, 0, 200, 68) },
    { id: 'p3', type: 'text', category: 'milestone', text: 'SOC2 audit', ...prodCell(0, 1, 160, 52) },
    { id: 'p4', type: 'text', category: 'initiative', text: 'Multi-region', ...prodCell(1, 1) },
    { id: 'p5', type: 'text', category: 'initiative', text: 'iOS beta', ...prodCell(0, 2) },
    { id: 'p6', type: 'text', category: 'blocker', text: 'App Store review', ...prodCell(1, 2, 180, 56) },
    { id: 'p7', type: 'text', category: 'parked', text: 'Android', ...prodCell(2, 2, 180, 56) },
  ],
  edges: [
    { id: 'pe1', fromNode: 'p1', toNode: 'p2', label: 'drives' },
    { id: 'pe2', fromNode: 'p5', toNode: 'p6' },
  ],
}

// ---------------------------------------------------------------------------
// Engineering sub-canvas: kanban (columns only)
// ---------------------------------------------------------------------------

const ENG_COL = 260
const engCard = (col: number, idx: number, w = 220, h = 68) => ({
  x: col * ENG_COL + (ENG_COL - w) / 2,
  y: 40 + idx * 88,
  width: w,
  height: h,
})

export const engineeringSub: CanvasData = {
  theme: { base: 'kanban' },
  columns: evenLanes(['To Do', 'In Progress', 'Review', 'Done'], ENG_COL, 0),
  nodes: [
    { id: 'e1', type: 'text', category: 'feature', text: 'SSO for billing', ...engCard(0, 0) },
    { id: 'e2', type: 'text', category: 'bug', text: 'Webhook retries dropping', ...engCard(0, 1), color: '1', customData: { priority: 'urgent' } },
    { id: 'e3', type: 'text', category: 'chore', text: 'Bump to Node 22', ...engCard(0, 2) },
    { id: 'e4', type: 'text', category: 'feature', text: 'Notification preferences', ...engCard(1, 0), color: '2' },
    { id: 'e5', type: 'text', category: 'research', text: 'Auth provider comparison', ...engCard(1, 1) },
    { id: 'e6', type: 'text', category: 'feature', text: 'Audit log viewer', ...engCard(2, 0), color: '2' },
    { id: 'e7', type: 'text', category: 'bug', text: 'Timezone bug in reports', ...engCard(3, 0), color: '4' },
    { id: 'e8', type: 'text', category: 'feature', text: 'CSV export', ...engCard(3, 1), color: '4' },
  ],
  edges: [],
}

// ---------------------------------------------------------------------------
// Release sub-canvas: swimlane (rows only)
// ---------------------------------------------------------------------------

const REL_ROW = 140
const relAt = (row: number, x: number, w = 160, h = 52) => ({
  x,
  y: row * REL_ROW + (REL_ROW - h) / 2,
  width: w,
  height: h,
})

export const releaseSub: CanvasData = {
  theme: { base: 'swimlane' },
  rows: [
    { id: 'design', label: 'Design', start: 0, size: REL_ROW },
    { id: 'eng', label: 'Engineering', start: REL_ROW, size: REL_ROW },
    { id: 'qa', label: 'QA', start: REL_ROW * 2, size: REL_ROW },
    { id: 'rel', label: 'Release', start: REL_ROW * 3, size: REL_ROW },
  ],
  nodes: [
    { id: 'rd1', type: 'text', category: 'task', text: 'Final polish', ...relAt(0, 60), color: '4' },
    { id: 'rd2', type: 'text', category: 'decision', text: 'Copy review', ...relAt(0, 260), color: '3' },
    { id: 'rd3', type: 'text', category: 'task', text: 'Ship-ready build', ...relAt(1, 260), color: '3' },
    { id: 'rd4', type: 'text', category: 'handoff', text: 'Code freeze', ...relAt(1, 460, 160, 44), color: '5' },
    { id: 'rd5', type: 'text', category: 'task', text: 'Regression', ...relAt(2, 460), color: '5' },
    { id: 'rd6', type: 'text', category: 'decision', text: 'Go / no-go', ...relAt(2, 660, 170), color: '5' },
    { id: 'rd7', type: 'text', category: 'release', text: 'Staging', ...relAt(3, 660), color: '5' },
    { id: 'rd8', type: 'text', category: 'release', text: 'Production', ...relAt(3, 860), color: '5' },
  ],
  edges: [
    { id: 'rde1', fromNode: 'rd1', toNode: 'rd2' },
    { id: 'rde2', fromNode: 'rd2', toNode: 'rd3', label: 'handoff' },
    { id: 'rde3', fromNode: 'rd3', toNode: 'rd4' },
    { id: 'rde4', fromNode: 'rd4', toNode: 'rd5', label: 'QA starts' },
    { id: 'rde5', fromNode: 'rd5', toNode: 'rd6' },
    { id: 'rde6', fromNode: 'rd6', toNode: 'rd7', label: 'approved' },
    { id: 'rde7', fromNode: 'rd7', toNode: 'rd8' },
  ],
}

// ---------------------------------------------------------------------------
// Design sub-canvas: another freeform layer (no lanes)
// ---------------------------------------------------------------------------

export const designSub: CanvasData = {
  theme: { base: 'blueprint' },
  nodes: [
    { id: 'ds1', type: 'text', text: 'Brand system', x: 60, y: 40, width: 160, height: 60, color: '5' },
    { id: 'ds2', type: 'text', text: 'Typography', x: 60, y: 140, width: 160, height: 60, color: '3' },
    { id: 'ds3', type: 'text', text: 'Color tokens', x: 240, y: 140, width: 160, height: 60, color: '3' },
    { id: 'ds4', type: 'text', text: 'Components', x: 420, y: 140, width: 160, height: 60, color: '4' },
    { id: 'ds5', type: 'text', text: 'Motion', x: 420, y: 40, width: 160, height: 60, color: '6' },
    { id: 'ds6', type: 'text', text: 'Illustrations', x: 240, y: 240, width: 160, height: 60, color: '2' },
  ],
  edges: [
    { id: 'dse1', fromNode: 'ds1', toNode: 'ds2' },
    { id: 'dse2', fromNode: 'ds1', toNode: 'ds3' },
    { id: 'dse3', fromNode: 'ds1', toNode: 'ds5' },
    { id: 'dse4', fromNode: 'ds2', toNode: 'ds4' },
    { id: 'dse5', fromNode: 'ds3', toNode: 'ds4' },
    { id: 'dse6', fromNode: 'ds4', toNode: 'ds6' },
  ],
}

export const nestedCanvasMap: Record<string, CanvasData> = {
  'nested:product': productSub,
  'nested:engineering': engineeringSub,
  'nested:release': releaseSub,
  'nested:design': designSub,
}
