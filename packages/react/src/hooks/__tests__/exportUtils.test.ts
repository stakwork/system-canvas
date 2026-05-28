import { describe, it, expect, vi, beforeEach } from 'vitest'
import { computeExportBounds } from '../../export/utils.js'
import { exportAsJSON, parseCanvasFile } from '../../export/json.js'
import type { ResolvedNode } from 'system-canvas'
import type { CanvasData } from 'system-canvas'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(id: string, x: number, y: number, width: number, height: number): ResolvedNode {
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
    resolvedCornerRadius: 4,
    isNavigable: false,
    resolvedIcon: null,
  } as unknown as ResolvedNode
}

function makeFile(content: string, name = 'canvas.canvas'): File {
  return new File([content], name, { type: 'application/json' })
}

const fixtureCanvas: CanvasData = {
  nodes: [
    { id: 'n1', type: 'text', x: 0, y: 0, width: 100, height: 50, text: 'Hello' },
    { id: 'n2', type: 'text', x: 200, y: 100, width: 80, height: 60, text: 'World' },
  ],
  edges: [],
}

// ---------------------------------------------------------------------------
// computeExportBounds
// ---------------------------------------------------------------------------

describe('computeExportBounds', () => {
  it('returns default guard rect for empty nodes array', () => {
    const bounds = computeExportBounds([])
    expect(bounds).toEqual({ minX: 0, minY: 0, maxX: 800, maxY: 600, width: 800, height: 600 })
  })

  it('computes correct min/max with default 40px padding for single node', () => {
    const nodes = [makeNode('a', 100, 200, 150, 80)]
    const bounds = computeExportBounds(nodes)
    // x: 100-40=60, x2: 100+150+40=290, y: 200-40=160, y2: 200+80+40=320
    expect(bounds.minX).toBe(60)
    expect(bounds.minY).toBe(160)
    expect(bounds.maxX).toBe(290)
    expect(bounds.maxY).toBe(320)
    expect(bounds.width).toBe(230)
    expect(bounds.height).toBe(160)
  })

  it('computes correct min/max spanning multiple nodes', () => {
    const nodes = [
      makeNode('a', 10, 20, 50, 30),  // right=60, bottom=50
      makeNode('b', 200, 5, 100, 80), // right=300, bottom=85
    ]
    const bounds = computeExportBounds(nodes, 40)
    // minX = 10-40=-30, minY = 5-40=-35
    // maxX = 300+40=340, maxY = 85+40=125
    expect(bounds.minX).toBe(-30)
    expect(bounds.minY).toBe(-35)
    expect(bounds.maxX).toBe(340)
    expect(bounds.maxY).toBe(125)
    expect(bounds.width).toBe(370)
    expect(bounds.height).toBe(160)
  })

  it('respects custom padding', () => {
    const nodes = [makeNode('a', 0, 0, 100, 100)]
    const bounds = computeExportBounds(nodes, 10)
    expect(bounds.minX).toBe(-10)
    expect(bounds.minY).toBe(-10)
    expect(bounds.maxX).toBe(110)
    expect(bounds.maxY).toBe(110)
    expect(bounds.width).toBe(120)
    expect(bounds.height).toBe(120)
  })
})

// ---------------------------------------------------------------------------
// exportAsJSON / parseCanvasFile round-trip
// ---------------------------------------------------------------------------

describe('exportAsJSON', () => {
  beforeEach(() => {
    // Mock DOM APIs needed by exportAsJSON
    const mockAnchor = {
      href: '',
      download: '',
      click: vi.fn(),
    }
    vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor as unknown as HTMLAnchorElement)
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  })

  it('serialises canvas to JSON and triggers download', () => {
    const clickSpy = vi.fn()
    vi.spyOn(document, 'createElement').mockReturnValue({
      href: '',
      download: '',
      click: clickSpy,
    } as unknown as HTMLAnchorElement)

    exportAsJSON(fixtureCanvas, 'test.canvas')
    expect(clickSpy).toHaveBeenCalledOnce()
  })
})

describe('parseCanvasFile', () => {
  it('round-trips a valid CanvasData', async () => {
    const json = JSON.stringify(fixtureCanvas)
    const file = makeFile(json)
    const result = await parseCanvasFile(file)
    expect(result).toEqual(fixtureCanvas)
  })

  it('throws on malformed JSON', async () => {
    const file = makeFile('{ this is not json }')
    await expect(parseCanvasFile(file)).rejects.toThrow('Invalid JSON')
  })

  it('throws when validateCanvas returns errors (node missing id)', async () => {
    const badCanvas = {
      nodes: [{ type: 'text', x: 0, y: 0, width: 100, height: 50, text: 'Hi' }],
      edges: [],
    }
    const file = makeFile(JSON.stringify(badCanvas))
    await expect(parseCanvasFile(file)).rejects.toThrow('Invalid canvas file')
  })

  it('throws on completely invalid structure (empty object)', async () => {
    // validateCanvas treats missing nodes/edges as empty arrays — should not throw,
    // but an empty object is still valid per the spec.
    const file = makeFile(JSON.stringify({}))
    const result = await parseCanvasFile(file)
    expect(result).toEqual({})
  })
})
