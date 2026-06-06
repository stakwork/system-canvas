import { describe, it, expect } from 'vitest'
import { snapToGrid, alignNodes, distributeNodes, computeAlignmentGuides, gridNodes } from 'system-canvas'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rect(id: string, x: number, y: number, width: number, height: number) {
  return { id, x, y, width, height }
}

// ---------------------------------------------------------------------------
// snapToGrid
// ---------------------------------------------------------------------------

describe('snapToGrid', () => {
  it('rounds to nearest multiple', () => {
    expect(snapToGrid(13, 10)).toBe(10)
    expect(snapToGrid(15, 10)).toBe(20)
    expect(snapToGrid(16, 10)).toBe(20)
    expect(snapToGrid(0, 10)).toBe(0)
    expect(snapToGrid(100, 10)).toBe(100)
  })

  it('returns value unchanged when size <= 0', () => {
    expect(snapToGrid(13, 0)).toBe(13)
    expect(snapToGrid(13, -5)).toBe(13)
  })

  it('works with fractional sizes', () => {
    expect(snapToGrid(7.4, 5)).toBe(5)
    expect(snapToGrid(7.6, 5)).toBe(10)
  })
})

// ---------------------------------------------------------------------------
// alignNodes
// ---------------------------------------------------------------------------

describe('alignNodes', () => {
  const nodes = [
    rect('a', 10, 20, 100, 50),
    rect('b', 40, 60, 80,  40),
    rect('c', 5,  30, 120, 60),
  ]

  it('aligns left: all nodes move to min-x; leftmost unchanged', () => {
    const result = alignNodes(nodes, 'left')
    const minX = 5 // node c
    // node c is already at 5 — should have no patch
    expect(result.find(r => r.id === 'c')).toBeUndefined()
    // node a moves to 5
    expect(result.find(r => r.id === 'a')?.patch).toEqual({ x: 5 })
    // node b moves to 5
    expect(result.find(r => r.id === 'b')?.patch).toEqual({ x: 5 })
    result.forEach(r => expect(r.patch.x).toBe(minX))
  })

  it('aligns right: all right edges align to max right-edge', () => {
    // max right = max(10+100, 40+80, 5+120) = max(110, 120, 125) = 125
    const result = alignNodes(nodes, 'right')
    expect(result.find(r => r.id === 'a')?.patch).toEqual({ x: 125 - 100 }) // 25
    expect(result.find(r => r.id === 'b')?.patch).toEqual({ x: 125 - 80 })  // 45
    expect(result.find(r => r.id === 'c')).toBeUndefined() // already at 125
  })

  it('aligns top: all nodes move to min-y', () => {
    // min y = 20 (node a)
    const result = alignNodes(nodes, 'top')
    expect(result.find(r => r.id === 'a')).toBeUndefined()
    expect(result.find(r => r.id === 'b')?.patch).toEqual({ y: 20 })
    expect(result.find(r => r.id === 'c')?.patch).toEqual({ y: 20 })
  })

  it('aligns bottom: all bottom edges align to max bottom-edge', () => {
    // max bottom = max(20+50, 60+40, 30+60) = max(70, 100, 90) = 100
    const result = alignNodes(nodes, 'bottom')
    expect(result.find(r => r.id === 'a')?.patch).toEqual({ y: 100 - 50 }) // 50
    expect(result.find(r => r.id === 'b')).toBeUndefined() // already at 100
    expect(result.find(r => r.id === 'c')?.patch).toEqual({ y: 100 - 60 }) // 40
  })

  it('aligns centerH: all nodes center-x aligns to mean center-x', () => {
    // centerX: 10+50=60, 40+40=80, 5+60=65 → mean = (60+80+65)/3 = 68.333...
    const mean = (60 + 80 + 65) / 3
    const result = alignNodes(nodes, 'centerH')
    const aExpected = mean - 100 / 2
    const bExpected = mean - 80 / 2
    const cExpected = mean - 120 / 2
    expect(result.find(r => r.id === 'a')?.patch.x).toBeCloseTo(aExpected)
    expect(result.find(r => r.id === 'b')?.patch.x).toBeCloseTo(bExpected)
    expect(result.find(r => r.id === 'c')?.patch.x).toBeCloseTo(cExpected)
  })

  it('aligns centerV: all nodes center-y aligns to mean center-y', () => {
    // centerY: 20+25=45, 60+20=80, 30+30=60 → mean = (45+80+60)/3 = 61.666...
    const mean = (45 + 80 + 60) / 3
    const result = alignNodes(nodes, 'centerV')
    expect(result.find(r => r.id === 'a')?.patch.y).toBeCloseTo(mean - 50 / 2)
    expect(result.find(r => r.id === 'b')?.patch.y).toBeCloseTo(mean - 40 / 2)
    expect(result.find(r => r.id === 'c')?.patch.y).toBeCloseTo(mean - 60 / 2)
  })

  it('returns empty patch for nodes already at reference position', () => {
    // Single node — reference IS the node's own position, so no change
    const single = [rect('x', 10, 20, 100, 50)]
    expect(alignNodes(single, 'left')).toEqual([])
    expect(alignNodes(single, 'top')).toEqual([])
  })

  it('returns empty array for empty input', () => {
    expect(alignNodes([], 'left')).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// distributeNodes
// ---------------------------------------------------------------------------

describe('distributeNodes', () => {
  it('distributes horizontally: inner nodes evenly spaced; outermost unchanged', () => {
    // nodes at x: 0(w=10), 100(w=10), 200(w=10) — already even, no patches
    const nodes = [
      rect('a', 0,   0, 10, 10),
      rect('b', 100, 0, 10, 10),
      rect('c', 200, 0, 10, 10),
    ]
    const result = distributeNodes(nodes, 'horizontal')
    // b is already perfectly centered → no patch
    expect(result).toEqual([])
  })

  it('distributes horizontally: moves inner node to correct position', () => {
    // a at x=0(w=10), b at x=50(w=10), c at x=200(w=10)
    // outerEnd=210, outerStart=0, totalOuter=10+10=20, sumInner=10
    // spacing = (210 - 0 - 20 - 10) / 2 = 180/2 = 90
    // b should be at 0 + 10 + 90 = 100
    const nodes = [
      rect('a', 0,   0, 10, 10),
      rect('b', 50,  0, 10, 10),
      rect('c', 200, 0, 10, 10),
    ]
    const result = distributeNodes(nodes, 'horizontal')
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ id: 'b', patch: { x: 100 } })
  })

  it('distributes vertically: inner nodes evenly spaced', () => {
    // a at y=0(h=10), b at y=50(h=10), c at y=200(h=10)
    // spacing = (210 - 0 - 20 - 10) / 2 = 90
    // b should be at 0 + 10 + 90 = 100
    const nodes = [
      rect('a', 0, 0,   10, 10),
      rect('b', 0, 50,  10, 10),
      rect('c', 0, 200, 10, 10),
    ]
    const result = distributeNodes(nodes, 'vertical')
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ id: 'b', patch: { y: 100 } })
  })

  it('returns [] for less than 3 nodes', () => {
    expect(distributeNodes([], 'horizontal')).toEqual([])
    expect(distributeNodes([rect('a', 0, 0, 10, 10)], 'horizontal')).toEqual([])
    expect(distributeNodes([rect('a', 0, 0, 10, 10), rect('b', 100, 0, 10, 10)], 'horizontal')).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// computeAlignmentGuides
// ---------------------------------------------------------------------------

describe('computeAlignmentGuides', () => {
  it('returns [] when dragging is empty', () => {
    const others = [rect('a', 0, 0, 100, 50)]
    expect(computeAlignmentGuides([], others, 4)).toEqual([])
  })

  it('returns [] when others is empty', () => {
    const dragging = [rect('a', 0, 0, 100, 50)]
    expect(computeAlignmentGuides(dragging, [], 4)).toEqual([])
  })

  it('emits a guide when left edges are within threshold', () => {
    // dragging node left edge at x=2, other node left edge at x=0 — diff=2, threshold=4
    const dragging = [rect('d', 2, 10, 100, 50)]
    const others   = [rect('o', 0, 80, 120, 60)]
    const guides = computeAlignmentGuides(dragging, others, 4)
    const xGuide = guides.find(g => g.axis === 'x' && g.kind === 'edge')
    expect(xGuide).toBeDefined()
    expect(xGuide?.position).toBe(0) // reference (non-dragged) anchor
  })

  it('emits nothing when outside threshold', () => {
    // dragging left edge at x=10, other at x=0 — diff=10 > threshold=4
    const dragging = [rect('d', 10, 0, 100, 50)]
    const others   = [rect('o', 0,  0, 100, 50)]
    const guides = computeAlignmentGuides(dragging, others, 4)
    expect(guides.filter(g => g.axis === 'x' && g.kind === 'edge' && g.position === 0)).toHaveLength(0)
  })

  it('de-duplicates guides with the same axis + position, keeping widest span', () => {
    // Two dragging nodes both align with others' left edge at x=0
    const dragging = [
      rect('d1', 1, 0,  50, 30),
      rect('d2', 2, 40, 60, 20),
    ]
    const others = [rect('o', 0, 100, 80, 40)]
    const guides = computeAlignmentGuides(dragging, others, 4)
    const xEdgeGuides = guides.filter(g => g.axis === 'x' && g.kind === 'edge' && g.position === 0)
    // Should be de-duped to a single guide
    expect(xEdgeGuides).toHaveLength(1)
    // Span should cover all nodes' perpendicular extents
    expect(xEdgeGuides[0].span.start).toBeLessThanOrEqual(0)
    expect(xEdgeGuides[0].span.end).toBeGreaterThanOrEqual(140)
  })

  it('emits a center guide when center-x values align within threshold', () => {
    // dragging centerX = 2 + 50/2 = 27, other centerX = 0 + 60/2 = 30, diff=3 <= 4
    const dragging = [rect('d', 2,  0, 50, 40)]
    const others   = [rect('o', 0, 60, 60, 40)]
    const guides = computeAlignmentGuides(dragging, others, 4)
    const centerGuide = guides.find(g => g.axis === 'x' && g.kind === 'center')
    expect(centerGuide).toBeDefined()
    expect(centerGuide?.position).toBe(30) // other's centerX
  })
})

// ---------------------------------------------------------------------------
// gridNodes
// ---------------------------------------------------------------------------

describe('gridNodes', () => {
  it('returns [] for empty input', () => {
    expect(gridNodes([])).toEqual([])
  })

  it('returns [] for single node', () => {
    expect(gridNodes([rect('a', 0, 0, 100, 50)])).toEqual([])
  })

  it('2-node input returns patches placing nodes in a 2x1 grid anchored to bounding-box top-left', () => {
    // Nodes at different positions; origin = (10, 20)
    const nodes = [
      rect('a', 10, 20, 100, 50),
      rect('b', 200, 300, 100, 50),
    ]
    const result = gridNodes(nodes, 20)
    // cols = ceil(sqrt(2)) = 2 => 2x1 grid
    // sorted by y then x: a(y=20) before b(y=300)
    // a -> col=0,row=0 => x=10, y=20 (already in place => no patch)
    // b -> col=1,row=0 => x=10 + 1*(100+20)=130, y=20
    const byId = Object.fromEntries(result.map(r => [r.id, r.patch]))
    expect(byId['a']).toBeUndefined()
    expect(byId['b']).toEqual({ x: 130, y: 20 })
  })

  it('4-node input forms a 2x2 grid with 20px gap', () => {
    const nodes = [
      rect('a', 0,   0,   100, 80),
      rect('b', 200, 0,   100, 80),
      rect('c', 0,   200, 100, 80),
      rect('d', 200, 200, 100, 80),
    ]
    const result = gridNodes(nodes, 20)
    // cols = ceil(sqrt(4)) = 2
    // sorted reading order: a(0,0), b(200,0), c(0,200), d(200,200)
    // originX=0, originY=0, maxW=100, maxH=80
    // a -> col=0,row=0 => (0,0) no change
    // b -> col=1,row=0 => (120,0)
    // c -> col=0,row=1 => (0,100)
    // d -> col=1,row=1 => (120,100)
    const byId = Object.fromEntries(result.map(r => [r.id, r.patch]))
    expect(byId['a']).toBeUndefined() // already in place
    expect(byId['b']).toEqual({ x: 120, y: 0 })
    expect(byId['c']).toEqual({ x: 0, y: 100 })
    expect(byId['d']).toEqual({ x: 120, y: 100 })
  })

  it('sorts nodes in reading order (top-to-bottom, left-to-right) before placement', () => {
    // Nodes provided in reverse reading order
    const nodes = [
      rect('d', 200, 200, 100, 80),
      rect('c', 0,   200, 100, 80),
      rect('b', 200, 0,   100, 80),
      rect('a', 0,   0,   100, 80),
    ]
    const result = gridNodes(nodes, 20)
    // After sort: a,b,c,d — same as previous test
    const byId = Object.fromEntries(result.map(r => [r.id, r.patch]))
    expect(byId['b']).toEqual({ x: 120, y: 0 })
    expect(byId['c']).toEqual({ x: 0, y: 100 })
    expect(byId['d']).toEqual({ x: 120, y: 100 })
  })

  it('omits patch for nodes already in correct grid position', () => {
    // Two nodes already in the correct 2x1 grid with gap=20
    const nodes = [
      rect('a', 0,   0, 100, 50),
      rect('b', 120, 0, 100, 50),
    ]
    const result = gridNodes(nodes, 20)
    // a -> (0,0) no change; b -> (120,0) no change
    expect(result).toHaveLength(0)
  })

  it('handles non-square count (6 nodes) with 3 cols x 2 rows', () => {
    // cols = ceil(sqrt(6)) = 3
    const nodes = [
      rect('a', 0, 0,   80, 60),
      rect('b', 0, 10,  80, 60),
      rect('c', 0, 20,  80, 60),
      rect('d', 0, 30,  80, 60),
      rect('e', 0, 40,  80, 60),
      rect('f', 0, 50,  80, 60),
    ]
    const result = gridNodes(nodes, 20)
    // originX=0, originY=0, maxW=80, maxH=60, gap=20 => cellW=100, cellH=80
    // sorted by y: a(y=0),b(y=10),c(y=20),d(y=30),e(y=40),f(y=50)
    // a -> col=0,row=0 => (0,0)
    // b -> col=1,row=0 => (100,0)
    // c -> col=2,row=0 => (200,0)
    // d -> col=0,row=1 => (0,80)
    // e -> col=1,row=1 => (100,80)
    // f -> col=2,row=1 => (200,80)
    const byId = Object.fromEntries(result.map(r => [r.id, r.patch]))
    expect(byId['a']).toBeUndefined() // already at (0,0)
    expect(byId['b']).toEqual({ x: 100, y: 0 })
    expect(byId['c']).toEqual({ x: 200, y: 0 })
    expect(byId['d']).toEqual({ x: 0, y: 80 })
    expect(byId['e']).toEqual({ x: 100, y: 80 })
    expect(byId['f']).toEqual({ x: 200, y: 80 })
  })

  it('anchors the grid to the bounding-box top-left (non-zero origin)', () => {
    const nodes = [
      rect('a', 500, 300, 60, 40),
      rect('b', 700, 400, 60, 40),
      rect('c', 900, 500, 60, 40),
    ]
    const result = gridNodes(nodes, 10)
    // cols = ceil(sqrt(3)) = 2, originX=500, originY=300, maxW=60, maxH=40
    // sorted: a(y=300), b(y=400), c(y=500)
    // a -> col=0,row=0 => (500,300)  no change
    // b -> col=1,row=0 => (500+70,300) = (570,300)
    // c -> col=0,row=1 => (500, 300+50) = (500,350)
    const byId = Object.fromEntries(result.map(r => [r.id, r.patch]))
    expect(byId['a']).toBeUndefined()
    expect(byId['b']).toEqual({ x: 570, y: 300 })
    expect(byId['c']).toEqual({ x: 500, y: 350 })
  })
})
