/**
 * SystemCanvas emphasis tests (dimmedNodeIds / highlightedNodeIds)
 *
 * The first full SystemCanvas mount tests in the repo. jsdom harness notes:
 * - ResizeObserver is not implemented by jsdom and vitest.config.ts has no
 *   setupFiles, so it is stubbed inline below (SystemCanvas, Viewport, and
 *   NodeToolbar all construct one in effects).
 * - The container measures 0x0 in jsdom, which disables Viewport's node/edge
 *   culling (the `w <= 0` short-circuit) — every node and edge renders.
 * - `measureTextWidth` is ratio-based, so no canvas 2d context is needed.
 * - NodeRenderer's mount fade-in writes inline `style.opacity` on each node
 *   `<g>` and clears it ~216ms later (clear-after-fade). Tests asserting
 *   attribute-governed dimming after a prop change must wait past that
 *   window; inline style shadows the SVG presentation attribute until then.
 */
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent, waitFor } from '@testing-library/react'
import type { CanvasData, CanvasEdge, CanvasNode } from 'system-canvas'
import { SystemCanvas, unionIdSets } from '../SystemCanvas.js'

// ---------------------------------------------------------------------------
// jsdom harness stubs (vitest.config.ts has no setupFiles — stub inline)
// ---------------------------------------------------------------------------

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver =
  ResizeObserverStub

// jsdom does not implement SVGSVGElement.width/height. d3-zoom's
// defaultExtent reads `width.baseVal.value` / `height.baseVal.value` to
// derive the zoom extent when the svg has no viewBox attribute (Viewport's
// svg doesn't). Provide minimal SVGAnimatedLength-shaped stubs so the
// animated auto-fit transition doesn't throw inside a timer flush.
const svgProto = SVGSVGElement.prototype as unknown as {
  width?: unknown
  height?: unknown
}
function stubLength(attr: string, fallback: number) {
  return function (this: SVGSVGElement) {
    const v = parseFloat(this.getAttribute(attr) ?? '')
    return {
      baseVal: { value: Number.isFinite(v) ? v : fallback },
      animVal: { value: Number.isFinite(v) ? v : fallback },
    }
  }
}
Object.defineProperty(svgProto, 'width', {
  configurable: true,
  get: stubLength('width', 800),
})
Object.defineProperty(svgProto, 'height', {
  configurable: true,
  get: stubLength('height', 600),
})

// jsdom does not implement SVGGeometryElement.getTotalLength; EdgeRenderer's
// draw-in animation calls it in the AnimatedEdgePath mount effect. The len
// value is only used for the dash draw-in cosmetics — 0 is safe here.
const svgElementProto = SVGElement.prototype as unknown as {
  getTotalLength?: () => number
}
if (typeof svgElementProto.getTotalLength !== 'function') {
  svgElementProto.getTotalLength = function () {
    return 0
  }
}

// ---------------------------------------------------------------------------
// Fixtures — stable ids double as the node text so DOM lookup is trivial
// ---------------------------------------------------------------------------

function makeNode(id: string, x: number, y: number): CanvasNode {
  return { id, type: 'text', x, y, width: 120, height: 48, text: id }
}

const ALPHA = makeNode('alpha', 0, 0)
const BETA = makeNode('beta', 200, 0)
const GAMMA = makeNode('gamma', 0, 120)
const DELTA = makeNode('delta', 200, 120)

function makeCanvas(
  nodes: CanvasNode[] = [ALPHA, BETA, GAMMA, DELTA],
  edges: CanvasEdge[] = []
): CanvasData {
  return { nodes, edges }
}

const EDGE_ALPHA_BETA: CanvasEdge = {
  id: 'e-alpha-beta',
  fromNode: 'alpha',
  toNode: 'beta',
}

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

/** The TextNode body `<g class="system-canvas-node system-canvas-node--text">`
 * for a node, located by its text content (fixtures render the id as text).
 */
function nodeBody(container: HTMLElement, id: string): SVGGElement {
  const bodies = Array.from(container.querySelectorAll('g.system-canvas-node'))
  const body = bodies.find((g) => g.textContent === id)
  if (!body) {
    throw new Error(
      `node body not found for "${id}"; rendered: ${bodies
        .map((g) => g.textContent)
        .join(', ')}`
    )
  }
  return body as SVGGElement
}

/** The MemoizedNode wrapper `<g>` — holds the opacity attribute and the highlight rect. */
function nodeWrapper(container: HTMLElement, id: string): SVGGElement {
  const wrapper = nodeBody(container, id).parentElement
  if (!wrapper || wrapper.tagName.toLowerCase() !== 'g') {
    throw new Error(`wrapper <g> not found for "${id}"`)
  }
  return wrapper as unknown as SVGGElement
}

/** The search-match highlight rect inside a node wrapper (only when highlighted). */
function highlightRect(container: HTMLElement, id: string): Element | null {
  return nodeWrapper(container, id).querySelector('rect[filter]')
}

/** Backer rect position for a node — proxy for "node did not move". */
function nodePos(container: HTMLElement, id: string): string | null {
  const rect = nodeBody(container, id).querySelector('rect')
  return rect ? `${rect.getAttribute('x')},${rect.getAttribute('y')}` : null
}

function dimmedEdgePaths(container: HTMLElement): NodeListOf<Element> {
  return container.querySelectorAll('path[stroke-opacity="0.3"]')
}

function renderCanvas(
  props: Partial<Parameters<typeof SystemCanvas>[0]> & {
    canvas: CanvasData
  }
) {
  return render(<SystemCanvas {...props} />)
}

/**
 * Open the internal Cmd+F search. The Ctrl+F hotkey only fires when the
 * event target sits inside the canvas root — dispatch on that root div
 * (an HTML element; targets inside the SVG would fail the hook's
 * HTMLElement check, and the RTL wrapper is outside the canvas root).
 */
function openSearch(container: HTMLElement): void {
  const root = container.querySelector('div.system-canvas') as HTMLElement | null
  if (!root) throw new Error('SystemCanvas root div not found')
  fireEvent.keyDown(root, { key: 'f', ctrlKey: true })
}

// ---------------------------------------------------------------------------
// unionIdSets
// ---------------------------------------------------------------------------

describe('unionIdSets', () => {
  it('returns internal unchanged (same reference) when external is undefined', () => {
    const internal = new Set(['a', 'b'])
    expect(unionIdSets(internal, undefined)).toBe(internal)
  })

  it('returns internal unchanged (same reference) when external is empty', () => {
    const internal = new Set(['a', 'b'])
    expect(unionIdSets(internal, new Set<string>())).toBe(internal)
  })

  it('returns undefined when both inputs are undefined', () => {
    expect(unionIdSets(undefined, undefined)).toBeUndefined()
  })

  it('returns a copy of external when internal is undefined', () => {
    const external = new Set(['a', 'b'])
    const merged = unionIdSets(undefined, external)
    expect(merged).not.toBe(external)
    expect(merged).toEqual(new Set(['a', 'b']))
  })

  it('returns a copy of external when internal is empty', () => {
    const external = new Set(['a'])
    const merged = unionIdSets(new Set<string>(), external)
    expect(merged).not.toBe(external)
    expect(merged).toEqual(new Set(['a']))
  })

  it('unions disjoint sets', () => {
    const merged = unionIdSets(new Set(['a']), new Set(['b']))
    expect(merged).toEqual(new Set(['a', 'b']))
  })

  it('unions overlapping sets without duplicates', () => {
    const merged = unionIdSets(
      new Set(['a', 'b']),
      new Set(['b', 'c'])
    )
    expect(merged).toEqual(new Set(['a', 'b', 'c']))
  })

  it('does not mutate its inputs', () => {
    const internal = new Set(['a'])
    const external = new Set(['b'])
    unionIdSets(internal, external)
    expect(internal).toEqual(new Set(['a']))
    expect(external).toEqual(new Set(['b']))
  })
})

// ---------------------------------------------------------------------------
// SystemCanvas external emphasis
// ---------------------------------------------------------------------------

describe('SystemCanvas emphasis (dimmedNodeIds / highlightedNodeIds)', () => {
  it('renders with no emphasis when the props are omitted', () => {
    const { container } = renderCanvas({
      canvas: makeCanvas([ALPHA, BETA, GAMMA], [EDGE_ALPHA_BETA]),
    })
    for (const id of ['alpha', 'beta', 'gamma']) {
      expect(nodeWrapper(container, id).getAttribute('opacity')).toBe('1')
      expect(highlightRect(container, id)).toBeNull()
    }
    expect(dimmedEdgePaths(container)).toHaveLength(0)
  })

  it('renders with no emphasis when both sets are empty', () => {
    const { container } = renderCanvas({
      canvas: makeCanvas([ALPHA, BETA, GAMMA], [EDGE_ALPHA_BETA]),
      dimmedNodeIds: new Set<string>(),
      highlightedNodeIds: new Set<string>(),
    })
    for (const id of ['alpha', 'beta', 'gamma']) {
      expect(nodeWrapper(container, id).getAttribute('opacity')).toBe('1')
      expect(highlightRect(container, id)).toBeNull()
    }
    expect(dimmedEdgePaths(container)).toHaveLength(0)
  })

  it('dims externally-dimmed nodes and highlights externally-highlighted nodes on mount', () => {
    const { container } = renderCanvas({
      canvas: makeCanvas([ALPHA, BETA, GAMMA], [EDGE_ALPHA_BETA]),
      dimmedNodeIds: new Set(['alpha']),
      highlightedNodeIds: new Set(['beta']),
    })
    expect(nodeWrapper(container, 'alpha').getAttribute('opacity')).toBe('0.15')
    expect(nodeWrapper(container, 'beta').getAttribute('opacity')).toBe('1')
    expect(highlightRect(container, 'beta')).not.toBeNull()
    expect(highlightRect(container, 'alpha')).toBeNull()
    expect(nodeWrapper(container, 'gamma').getAttribute('opacity')).toBe('1')
    expect(highlightRect(container, 'gamma')).toBeNull()
  })

  it('dims edges connected to dimmed nodes (faded, dotted once the draw-in completes)', async () => {
    const { container } = renderCanvas({
      canvas: makeCanvas([ALPHA, BETA, GAMMA], [EDGE_ALPHA_BETA]),
      dimmedNodeIds: new Set(['alpha']),
    })
    // The 0.3 dim opacity is on the visible edge path immediately.
    const dimmed = dimmedEdgePaths(container)
    expect(dimmed).toHaveLength(1)
    // The dotted dash pattern arrives as the stroke-dasharray attribute
    // (plain path) or as inline style once the edge draw-in animation
    // finishes and restores it (~380ms).
    await waitFor(() => {
      const el = dimmed[0] as SVGPathElement
      expect(
        el.getAttribute('stroke-dasharray') ?? el.style.strokeDasharray
      ).toBe('4 4')
    })
  })

  it('renders both visuals for a node in both sets: dim opacity with the highlight ring inside', () => {
    const { container } = renderCanvas({
      canvas: makeCanvas([ALPHA, BETA], []),
      dimmedNodeIds: new Set(['alpha']),
      highlightedNodeIds: new Set(['alpha']),
    })
    const wrapper = nodeWrapper(container, 'alpha')
    expect(wrapper.getAttribute('opacity')).toBe('0.15')
    // The highlight rect is nested inside the dimmed <g>, so it inherits
    // the dim opacity — same as built-in search for a match on a
    // hidden-category node.
    expect(wrapper.querySelector('rect[filter]')).not.toBeNull()
  })

  it('dims nodes when props are applied after mount (fade-clear window)', async () => {
    const canvas = makeCanvas([ALPHA, BETA])
    const { container, rerender } = renderCanvas({ canvas })

    // Mount fade: inline style shadows the attribute until it is cleared.
    const wrapper = nodeWrapper(container, 'alpha')
    expect(wrapper.getAttribute('opacity')).toBe('1')

    rerender(
      <SystemCanvas canvas={canvas} dimmedNodeIds={new Set(['alpha'])} />
    )

    // The presentation attribute flips immediately...
    expect(nodeWrapper(container, 'alpha').getAttribute('opacity')).toBe('0.15')

    // ...but the mount-fade inline style still governs until the
    // clear-after-fade timer (~200ms fade + 16ms headroom) fires.
    await waitFor(
      () => expect(nodeWrapper(container, 'alpha').style.opacity).toBe(''),
      { timeout: 2000 }
    )
    // With the inline style cleared, the attribute governs: visually dimmed.
    expect(nodeWrapper(container, 'alpha').getAttribute('opacity')).toBe('0.15')
  })

  it('undims when external props are removed after mount', async () => {
    const canvas = makeCanvas([ALPHA, BETA])
    const { container, rerender } = renderCanvas({
      canvas,
      dimmedNodeIds: new Set(['alpha']),
    })
    expect(nodeWrapper(container, 'alpha').getAttribute('opacity')).toBe('0.15')

    rerender(<SystemCanvas canvas={canvas} />)
    await waitFor(
      () => expect(nodeWrapper(container, 'alpha').style.opacity).toBe(''),
      { timeout: 2000 }
    )
    expect(nodeWrapper(container, 'alpha').getAttribute('opacity')).toBe('1')
  })

  it('internal Cmd+F search dims pre-existing nodes after mount', async () => {
    const { container } = renderCanvas({ canvas: makeCanvas([ALPHA, BETA]) })

    // Open search via the hotkey path — the event target (canvas root div)
    // sits inside the canvas, so `shouldHandleSearchHotkey` accepts it.
    openSearch(container)
    const input = await waitFor(() => {
      const el = container.querySelector('input')
      expect(el).not.toBeNull()
      return el as HTMLInputElement
    })
    fireEvent.change(input, { target: { value: 'beta' } })

    // beta matches (highlighted); pre-existing alpha dims via the internal
    // search set — the same path external dimming takes after mount.
    await waitFor(() =>
      expect(highlightRect(container, 'beta')).not.toBeNull()
    )
    expect(nodeWrapper(container, 'alpha').getAttribute('opacity')).toBe('0.15')
    expect(nodeWrapper(container, 'beta').getAttribute('opacity')).toBe('1')
  })

  it('internal search and external emphasis coexist; match counts and active match stay search-owned', async () => {
    const canvas = makeCanvas([ALPHA, BETA, GAMMA])
    const { container, rerender } = renderCanvas({
      canvas,
      dimmedNodeIds: new Set(['gamma']),
    })

    // Open internal search for "beta" while gamma is externally dimmed.
    openSearch(container)
    const input = await waitFor(() => {
      const el = container.querySelector('input')
      expect(el).not.toBeNull()
      return el as HTMLInputElement
    })
    fireEvent.change(input, { target: { value: 'beta' } })

    // Both sources active simultaneously: alpha dimmed by search,
    // gamma dimmed externally, beta highlighted by search.
    await waitFor(() =>
      expect(nodeWrapper(container, 'alpha').getAttribute('opacity')).toBe(
        '0.15'
      )
    )
    expect(nodeWrapper(container, 'gamma').getAttribute('opacity')).toBe('0.15')
    expect(highlightRect(container, 'beta')).not.toBeNull()
    expect(container.textContent).toContain('1/1')
    // Active match (searchIndex 0 of 1) renders the stronger 0.7 ring.
    expect(highlightRect(container, 'beta')!.getAttribute('opacity')).toBe(
      '0.7'
    )

    // Removing external props leaves the search-owned state untouched:
    // same match count, same active match, and gamma stays dimmed — now
    // by the search (query "beta" doesn't match it), not the external set.
    rerender(<SystemCanvas canvas={canvas} />)
    expect(container.textContent).toContain('1/1')
    expect(nodeWrapper(container, 'alpha').getAttribute('opacity')).toBe('0.15')
    expect(nodeWrapper(container, 'gamma').getAttribute('opacity')).toBe('0.15')
    const betaRect = highlightRect(container, 'beta')
    expect(betaRect).not.toBeNull()
    expect(betaRect!.getAttribute('opacity')).toBe('0.7')

    // Clearing the query (external props still gone) removes ALL emphasis:
    // nothing dimmed, nothing highlighted, count text gone.
    const liveInput = container.querySelector('input') as HTMLInputElement
    expect(liveInput).not.toBeNull()
    fireEvent.change(liveInput, { target: { value: '' } })
    for (const id of ['alpha', 'beta', 'gamma']) {
      expect(nodeWrapper(container, id).getAttribute('opacity')).toBe('1')
      expect(highlightRect(container, id)).toBeNull()
    }
    expect(container.textContent).not.toContain('1/1')
  })

  it('does not fire onSelectionChange when emphasis props change', () => {
    const canvas = makeCanvas([ALPHA, BETA])
    const onSelectionChange = vi.fn()
    const { rerender } = renderCanvas({
      canvas,
      onSelectionChange,
      dimmedNodeIds: new Set(['alpha']),
    })
    onSelectionChange.mockClear()
    rerender(
      <SystemCanvas
        canvas={canvas}
        onSelectionChange={onSelectionChange}
        dimmedNodeIds={new Set(['beta'])}
        highlightedNodeIds={new Set(['alpha'])}
      />
    )
    expect(onSelectionChange).not.toHaveBeenCalled()
  })

  it('a dimmed node is still clickable (render-only dimming)', () => {
    const onNodeClick = vi.fn()
    const { container } = renderCanvas({
      canvas: makeCanvas([ALPHA, BETA]),
      onNodeClick,
      dimmedNodeIds: new Set(['alpha']),
    })
    fireEvent.click(nodeBody(container, 'alpha'))
    expect(onNodeClick).toHaveBeenCalledTimes(1)
    expect(onNodeClick.mock.calls[0][0]).toMatchObject({ id: 'alpha' })
  })

  it('does not move nodes when emphasis props change', () => {
    const canvas = makeCanvas([ALPHA, BETA, GAMMA, DELTA])
    const { container, rerender } = renderCanvas({ canvas })
    const before = ['alpha', 'beta', 'gamma', 'delta'].map((id) =>
      nodePos(container, id)
    )
    rerender(
      <SystemCanvas
        canvas={canvas}
        dimmedNodeIds={new Set(['alpha', 'delta'])}
        highlightedNodeIds={new Set(['beta', 'gamma'])}
      />
    )
    const after = ['alpha', 'beta', 'gamma', 'delta'].map((id) =>
      nodePos(container, id)
    )
    expect(after).toEqual(before)
  })
})
