/**
 * CollaboratorsOverlay unit tests
 *
 * Vitest + jsdom. We test pure rendering logic: correct screen positions,
 * halo colors, pointer-events, and conflict-flash visibility.
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { CollaboratorInfo, ResolvedNode, ViewportState } from 'system-canvas'

// ---------------------------------------------------------------------------
// Mock viewport-math utilities so we control the coordinate math.
// These are imported inside CollaboratorsOverlay via the 'system-canvas' alias.
// ---------------------------------------------------------------------------
vi.mock('system-canvas', async (importOriginal) => {
  const actual = await importOriginal<typeof import('system-canvas')>()
  return {
    ...actual,
    canvasToScreen: vi.fn((cx: number, cy: number, vp: ViewportState) => ({
      x: cx * vp.zoom + vp.x,
      y: cy * vp.zoom + vp.y,
    })),
    canvasRectToScreenRect: vi.fn((
      rect: { x: number; y: number; width: number; height: number },
      vp: ViewportState
    ) => ({
      x: rect.x * vp.zoom + vp.x,
      y: rect.y * vp.zoom + vp.y,
      width: rect.width * vp.zoom,
      height: rect.height * vp.zoom,
    })),
  }
})

// Import AFTER vi.mock so the mock is in place.
import { CollaboratorsOverlay } from '../CollaboratorsOverlay.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(id: string, x = 0, y = 0, width = 200, height = 100): ResolvedNode {
  return {
    id,
    type: 'text',
    x,
    y,
    width,
    height,
    text: id,
    resolvedFill: '#fff',
    resolvedStroke: '#000',
    resolvedWidth: width,
    resolvedHeight: height,
  } as unknown as ResolvedNode
}

function makeNodeMap(...nodes: ResolvedNode[]): Map<string, ResolvedNode> {
  return new Map(nodes.map((n) => [n.id, n]))
}

const VIEWPORT: ViewportState = { x: 0, y: 0, zoom: 1 }
const VIEWPORT_2X: ViewportState = { x: 10, y: 20, zoom: 2 }

// ---------------------------------------------------------------------------
// CollaboratorsOverlay tests
// ---------------------------------------------------------------------------

describe('CollaboratorsOverlay', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // -------------------------------------------------------------------------
  // Baseline / empty state
  // -------------------------------------------------------------------------

  it('renders nothing when collaborators is empty and no flash', () => {
    const { container } = render(
      <CollaboratorsOverlay
        collaborators={[]}
        viewport={VIEWPORT}
        nodeMap={makeNodeMap()}
        flashNodeIds={new Map()}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  // -------------------------------------------------------------------------
  // Overlay container
  // -------------------------------------------------------------------------

  it('overlay container has pointer-events: none', () => {
    const collab: CollaboratorInfo = {
      id: 'u1',
      name: 'Alice',
      color: '#ff0000',
      cursor: { x: 50, y: 100 },
    }
    const { container } = render(
      <CollaboratorsOverlay
        collaborators={[collab]}
        viewport={VIEWPORT}
        nodeMap={makeNodeMap()}
        flashNodeIds={new Map()}
      />
    )
    const overlay = container.firstChild as HTMLElement
    expect(overlay).not.toBeNull()
    expect(overlay.style.pointerEvents).toBe('none')
  })

  it('overlay container is absolutely positioned and fills its parent', () => {
    const collab: CollaboratorInfo = {
      id: 'u1',
      name: 'Alice',
      color: '#ff0000',
      cursor: { x: 10, y: 20 },
    }
    const { container } = render(
      <CollaboratorsOverlay
        collaborators={[collab]}
        viewport={VIEWPORT}
        nodeMap={makeNodeMap()}
        flashNodeIds={new Map()}
      />
    )
    const overlay = container.firstChild as HTMLElement
    expect(overlay.style.position).toBe('absolute')
    expect(overlay.style.inset).toBe('0px')
    expect(overlay.style.overflow).toBe('hidden')
  })

  // -------------------------------------------------------------------------
  // Cursor layer
  // -------------------------------------------------------------------------

  it('renders a cursor element for a collaborator with a non-null cursor', () => {
    const collab: CollaboratorInfo = {
      id: 'u1',
      name: 'Alice',
      color: '#ff0000',
      cursor: { x: 50, y: 100 },
    }
    render(
      <CollaboratorsOverlay
        collaborators={[collab]}
        viewport={VIEWPORT}
        nodeMap={makeNodeMap()}
        flashNodeIds={new Map()}
      />
    )
    // Name pill should appear
    expect(screen.getAllByText('Alice').length).toBeGreaterThanOrEqual(1)
  })

  it('does not render a cursor element when cursor is null', () => {
    const collab: CollaboratorInfo = {
      id: 'u1',
      name: 'GhostUser',
      color: '#0000ff',
      cursor: null,
    }
    render(
      <CollaboratorsOverlay
        collaborators={[collab]}
        viewport={VIEWPORT}
        nodeMap={makeNodeMap()}
        flashNodeIds={new Map()}
      />
    )
    // Only the halo label might appear, not the cursor name pill
    // Since no selectedNodeId either, no text at all expected
    expect(screen.queryByText('GhostUser')).toBeNull()
  })

  it('renders avatar img when collaborator has image URL', () => {
    const collab: CollaboratorInfo = {
      id: 'u1',
      name: 'Alice',
      color: '#ff0000',
      cursor: { x: 50, y: 100 },
      image: 'https://example.com/avatar.jpg',
    }
    const { container } = render(
      <CollaboratorsOverlay
        collaborators={[collab]}
        viewport={VIEWPORT}
        nodeMap={makeNodeMap()}
        flashNodeIds={new Map()}
      />
    )
    const img = container.querySelector('img[src="https://example.com/avatar.jpg"]')
    expect(img).not.toBeNull()
  })

  it('renders initials fallback when collaborator has no image', () => {
    const collab: CollaboratorInfo = {
      id: 'u2',
      name: 'Dave',
      color: '#0000ff',
      cursor: { x: 10, y: 20 },
      image: null,
    }
    const { container } = render(
      <CollaboratorsOverlay
        collaborators={[collab]}
        viewport={VIEWPORT}
        nodeMap={makeNodeMap()}
        flashNodeIds={new Map()}
      />
    )
    // No img element should be present in the cursor area
    expect(container.querySelector('img')).toBeNull()
    // The initial 'D' should be rendered
    expect(screen.getByText('D')).toBeTruthy()
  })

  it('positions cursor at screen-space coordinates derived from viewport', () => {
    // With VIEWPORT_2X: screen = (cx * 2 + 10, cy * 2 + 20)
    // cursor (50, 100) → screen (110, 220)
    const collab: CollaboratorInfo = {
      id: 'u1',
      name: 'Bob',
      color: '#00ff00',
      cursor: { x: 50, y: 100 },
    }
    const { container } = render(
      <CollaboratorsOverlay
        collaborators={[collab]}
        viewport={VIEWPORT_2X}
        nodeMap={makeNodeMap()}
        flashNodeIds={new Map()}
      />
    )
    // Find the cursor container div
    const overlay = container.firstChild as HTMLElement
    const cursorEl = overlay.querySelector('[style*="left: 110px"]') as HTMLElement | null
    expect(cursorEl).not.toBeNull()
    expect(cursorEl!.style.top).toBe('220px')
  })

  // -------------------------------------------------------------------------
  // Halo layer
  // -------------------------------------------------------------------------

  it('renders a halo around a node that a collaborator has selected', () => {
    const node = makeNode('node-1', 100, 200, 300, 150)
    const collab: CollaboratorInfo = {
      id: 'u2',
      name: 'Carol',
      color: '#aa00bb',
      cursor: null,
      selectedNodeId: 'node-1',
    }
    render(
      <CollaboratorsOverlay
        collaborators={[collab]}
        viewport={VIEWPORT}
        nodeMap={makeNodeMap(node)}
        flashNodeIds={new Map()}
      />
    )
    // The collaborator name should appear as a halo label
    expect(screen.getByText('Carol')).toBeTruthy()
  })

  it('uses collaborator color for the halo border', () => {
    const node = makeNode('node-1', 0, 0, 200, 100)
    const collab: CollaboratorInfo = {
      id: 'u2',
      name: 'Carol',
      color: '#aa00bb',
      cursor: null,
      selectedNodeId: 'node-1',
    }
    const { container } = render(
      <CollaboratorsOverlay
        collaborators={[collab]}
        viewport={VIEWPORT}
        nodeMap={makeNodeMap(node)}
        flashNodeIds={new Map()}
      />
    )
    // Border div should include the collaborator color
    const overlay = container.firstChild as HTMLElement
    const borderDiv = overlay.querySelector('[style*="border: 2px solid"]') as HTMLElement | null
    expect(borderDiv).not.toBeNull()
    // jsdom normalises hex → rgb; check either representation
    const borderStyle = borderDiv!.style.border
    const hasBorderColor =
      borderStyle.includes('#aa00bb') || borderStyle.includes('rgb(170, 0, 187)')
    expect(hasBorderColor).toBe(true)
  })

  it('does not render halo when selectedNodeId does not match any node', () => {
    const collab: CollaboratorInfo = {
      id: 'u2',
      name: 'Carol',
      color: '#aa00bb',
      cursor: null,
      selectedNodeId: 'nonexistent-node',
    }
    const { container } = render(
      <CollaboratorsOverlay
        collaborators={[collab]}
        viewport={VIEWPORT}
        nodeMap={makeNodeMap()} // empty map
        flashNodeIds={new Map()}
      />
    )
    // No halo border div
    const overlay = container.firstChild as HTMLElement
    expect(overlay.querySelector('[style*="border: 2px solid"]')).toBeNull()
  })

  it('stacks halos for multiple collaborators selecting the same node', () => {
    const node = makeNode('node-1', 0, 0, 200, 100)
    const collaborators: CollaboratorInfo[] = [
      { id: 'u1', name: 'Alice', color: '#ff0000', cursor: null, selectedNodeId: 'node-1' },
      { id: 'u2', name: 'Bob',   color: '#0000ff', cursor: null, selectedNodeId: 'node-1' },
    ]
    const { container } = render(
      <CollaboratorsOverlay
        collaborators={collaborators}
        viewport={VIEWPORT}
        nodeMap={makeNodeMap(node)}
        flashNodeIds={new Map()}
      />
    )
    const overlay = container.firstChild as HTMLElement
    const haloDivs = overlay.querySelectorAll('[style*="border: 2px solid"]')
    expect(haloDivs.length).toBe(2)
  })

  // -------------------------------------------------------------------------
  // Conflict flash
  // -------------------------------------------------------------------------

  it('renders a flash overlay for a nodeId present in flashNodeIds', () => {
    const node = makeNode('flash-node', 0, 0, 200, 100)
    const flashNodeIds = new Map<string, number>([['flash-node', Date.now() + 600]])
    const { container } = render(
      <CollaboratorsOverlay
        collaborators={[]}
        viewport={VIEWPORT}
        nodeMap={makeNodeMap(node)}
        flashNodeIds={flashNodeIds}
      />
    )
    const overlay = container.firstChild as HTMLElement
    expect(overlay).not.toBeNull()
    // Flash div has animation style
    const flashDiv = overlay.querySelector('[style*="sc-collab-flash"]') as HTMLElement | null
    expect(flashDiv).not.toBeNull()
  })

  it('does not render a flash overlay for a nodeId not in flashNodeIds', () => {
    const node = makeNode('other-node', 0, 0, 200, 100)
    const flashNodeIds = new Map<string, number>([['flash-node', Date.now() + 600]])
    const { container } = render(
      <CollaboratorsOverlay
        collaborators={[]}
        viewport={VIEWPORT}
        nodeMap={makeNodeMap(node)} // 'other-node' is in nodeMap, but not in flashNodeIds
        flashNodeIds={flashNodeIds}
      />
    )
    // overlay renders because flashNodeIds is non-empty, but 'flash-node' is not in nodeMap
    const overlay = container.firstChild as HTMLElement
    // flash-node is not in nodeMap, so no flash div should appear
    const flashDiv = overlay?.querySelector('[style*="sc-collab-flash"]')
    expect(flashDiv).toBeNull()
  })

  it('does not render flash when flashNodeIds is empty', () => {
    const { container } = render(
      <CollaboratorsOverlay
        collaborators={[]}
        viewport={VIEWPORT}
        nodeMap={makeNodeMap(makeNode('n1'))}
        flashNodeIds={new Map()}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('does not crash when collaborators is empty', () => {
    expect(() =>
      render(
        <CollaboratorsOverlay
          collaborators={[]}
          viewport={VIEWPORT}
          nodeMap={makeNodeMap()}
          flashNodeIds={new Map()}
        />
      )
    ).not.toThrow()
  })

  // -------------------------------------------------------------------------
  // Clip guard
  // -------------------------------------------------------------------------

  it('renders cursor within bounds when containerWidth/Height are provided', () => {
    // cursor at canvas (50, 50) with identity viewport → screen (50, 50)
    // container 200×200 → within [-100, 300] on both axes
    const collab: CollaboratorInfo = {
      id: 'u1',
      name: 'Alice',
      color: '#ff0000',
      cursor: { x: 50, y: 50 },
    }
    render(
      <CollaboratorsOverlay
        collaborators={[collab]}
        viewport={VIEWPORT}
        nodeMap={makeNodeMap()}
        flashNodeIds={new Map()}
        containerWidth={200}
        containerHeight={200}
      />
    )
    expect(screen.getAllByText('Alice').length).toBeGreaterThanOrEqual(1)
  })

  it('does not render cursor beyond CLIP_GUARD_MARGIN outside the container', () => {
    // cursor at canvas (-200, 50) with identity viewport → screen (-200, 50)
    // -200 < -100 (CLIP_GUARD_MARGIN), so should be clipped
    const collab: CollaboratorInfo = {
      id: 'u1',
      name: 'ClippedUser',
      color: '#ff0000',
      cursor: { x: -200, y: 50 },
    }
    render(
      <CollaboratorsOverlay
        collaborators={[collab]}
        viewport={VIEWPORT}
        nodeMap={makeNodeMap()}
        flashNodeIds={new Map()}
        containerWidth={200}
        containerHeight={200}
      />
    )
    expect(screen.queryByText('ClippedUser')).toBeNull()
  })

  it('renders cursor exactly at -CLIP_GUARD_MARGIN boundary (inclusive)', () => {
    // cursor at canvas (-100, 50) → screen (-100, 50); -100 is not < -100, so renders
    const collab: CollaboratorInfo = {
      id: 'u1',
      name: 'BoundaryUser',
      color: '#ff0000',
      cursor: { x: -100, y: 50 },
    }
    render(
      <CollaboratorsOverlay
        collaborators={[collab]}
        viewport={VIEWPORT}
        nodeMap={makeNodeMap()}
        flashNodeIds={new Map()}
        containerWidth={200}
        containerHeight={200}
      />
    )
    expect(screen.getAllByText('BoundaryUser').length).toBeGreaterThanOrEqual(1)
  })

  it('renders cursors regardless of position when containerWidth/Height are omitted (backward compat)', () => {
    // screen position way outside any real container
    const collab: CollaboratorInfo = {
      id: 'u1',
      name: 'FarAwayUser',
      color: '#ff0000',
      cursor: { x: 999999, y: 999999 },
    }
    render(
      <CollaboratorsOverlay
        collaborators={[collab]}
        viewport={VIEWPORT}
        nodeMap={makeNodeMap()}
        flashNodeIds={new Map()}
        // no containerWidth / containerHeight — defaults to Infinity
      />
    )
    expect(screen.getAllByText('FarAwayUser').length).toBeGreaterThanOrEqual(1)
  })

  it('halo layer is unaffected by container size props', () => {
    const node = makeNode('node-1', 100, 200, 300, 150)
    const collab: CollaboratorInfo = {
      id: 'u2',
      name: 'HaloUser',
      color: '#aa00bb',
      cursor: null,
      selectedNodeId: 'node-1',
    }
    render(
      <CollaboratorsOverlay
        collaborators={[collab]}
        viewport={VIEWPORT}
        nodeMap={makeNodeMap(node)}
        flashNodeIds={new Map()}
        containerWidth={10}
        containerHeight={10}
      />
    )
    // Halo label still renders even with tiny container
    expect(screen.getByText('HaloUser')).toBeTruthy()
  })
})
