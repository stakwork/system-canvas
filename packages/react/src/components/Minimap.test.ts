import { describe, it, expect } from 'vitest'
import { unionBounds, shouldUseDensityMode, bucketNodes } from './Minimap.js'
import type { ResolvedNode } from 'system-canvas'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBounds(
  minX: number,
  minY: number,
  maxX: number,
  maxY: number
) {
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY }
}

function makeNode(
  id: string,
  x: number,
  y: number,
  width = 100,
  height = 60
): ResolvedNode {
  return {
    id,
    type: 'text',
    x,
    y,
    width,
    height,
    text: id,
    resolvedFill: '#333',
    resolvedStroke: '#fff',
    resolvedCornerRadius: 4,
    resolvedWidth: width,
    resolvedHeight: height,
  } as unknown as ResolvedNode
}

// ---------------------------------------------------------------------------
// unionBounds
// ---------------------------------------------------------------------------

describe('unionBounds', () => {
  it('returns node bounds unchanged when viewport is fully inside them', () => {
    const nb = makeBounds(0, 0, 1000, 800)
    const vp = { x: 100, y: 100, width: 400, height: 300 }
    const result = unionBounds(nb, vp)
    expect(result.minX).toBe(0)
    expect(result.minY).toBe(0)
    expect(result.maxX).toBe(1000)
    expect(result.maxY).toBe(800)
    expect(result.width).toBe(1000)
    expect(result.height).toBe(800)
  })

  it('expands bounds when viewport is fully outside node bounds', () => {
    const nb = makeBounds(0, 0, 500, 400)
    // viewport positioned far to the right and below
    const vp = { x: 700, y: 600, width: 300, height: 200 }
    const result = unionBounds(nb, vp)
    expect(result.minX).toBe(0)
    expect(result.minY).toBe(0)
    expect(result.maxX).toBe(1000)
    expect(result.maxY).toBe(800)
    expect(result.width).toBe(1000)
    expect(result.height).toBe(800)
  })

  it('expands bounds on the negative side when viewport is to the left/above', () => {
    const nb = makeBounds(200, 200, 800, 600)
    const vp = { x: -300, y: -200, width: 400, height: 300 }
    const result = unionBounds(nb, vp)
    expect(result.minX).toBe(-300)
    expect(result.minY).toBe(-200)
    expect(result.maxX).toBe(800)
    expect(result.maxY).toBe(600)
    expect(result.width).toBe(1100)
    expect(result.height).toBe(800)
  })

  it('handles partial overlap — only the protruding side expands', () => {
    const nb = makeBounds(0, 0, 1000, 800)
    // viewport starts inside but extends past the right edge
    const vp = { x: 800, y: 0, width: 400, height: 600 }
    const result = unionBounds(nb, vp)
    expect(result.minX).toBe(0)
    expect(result.minY).toBe(0)
    expect(result.maxX).toBe(1200)
    expect(result.maxY).toBe(800)
  })

  it('produces correct width/height from the merged extents', () => {
    const nb = makeBounds(10, 20, 110, 120)
    const vp = { x: 5, y: 15, width: 200, height: 150 }
    const result = unionBounds(nb, vp)
    expect(result.width).toBe(result.maxX - result.minX)
    expect(result.height).toBe(result.maxY - result.minY)
  })
})

// ---------------------------------------------------------------------------
// shouldUseDensityMode
// ---------------------------------------------------------------------------

describe('shouldUseDensityMode', () => {
  it('returns false when node count is below threshold regardless of pixel size', () => {
    expect(shouldUseDensityMode(299, 100, 0.001)).toBe(false)
  })

  it('returns false when avg pixel size is >= 3 even with many nodes', () => {
    expect(shouldUseDensityMode(500, 100, 0.03)).toBe(false) // 100*0.03 = 3 — not < 3
    expect(shouldUseDensityMode(500, 100, 0.04)).toBe(false) // 100*0.04 = 4 > 3
  })

  it('returns true when both conditions are met', () => {
    // 500 nodes, avg width 100, scale 0.02 → 100*0.02 = 2 < 3
    expect(shouldUseDensityMode(500, 100, 0.02)).toBe(true)
  })

  it('is false at exactly 300 nodes with pixel size just meeting threshold', () => {
    // 300 >= 300 but 100*0.03 = 3 which is NOT < 3
    expect(shouldUseDensityMode(300, 100, 0.03)).toBe(false)
  })

  it('is true at exactly 300 nodes with pixel size just below threshold', () => {
    // 300 >= 300 and 100*0.029 = 2.9 < 3
    expect(shouldUseDensityMode(300, 100, 0.029)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// bucketNodes
// ---------------------------------------------------------------------------

describe('bucketNodes', () => {
  it('returns an 8x8 grid', () => {
    const grid = bucketNodes([], makeBounds(0, 0, 800, 800))
    expect(grid.length).toBe(8)
    expect(grid[0].length).toBe(8)
  })

  it('increments the correct cell for a node at center of bounds', () => {
    // Node centered at (400, 400) inside bounds (0,0)→(800,800)
    // normalised: (0.5, 0.5) → cell (4, 4) (floor(0.5*8))
    const bounds = makeBounds(0, 0, 800, 800)
    const node = makeNode('n1', 350, 370, 100, 60) // center = (400, 400)
    const grid = bucketNodes([node], bounds)
    expect(grid[4][4]).toBe(1)
    // All other cells should be 0
    const total = grid.flat().reduce((a, b) => a + b, 0)
    expect(total).toBe(1)
  })

  it('places a node in cell (0,0) when its center is at the top-left corner', () => {
    const bounds = makeBounds(0, 0, 800, 800)
    const node = makeNode('n1', 0, 0, 0, 0) // center exactly at (0,0)
    const grid = bucketNodes([node], bounds)
    expect(grid[0][0]).toBe(1)
  })

  it('clamps a node whose center is exactly on the right/bottom edge to the last cell', () => {
    const bounds = makeBounds(0, 0, 800, 800)
    // Center at (800, 800) — exactly on the edge; floor(1.0*8)=8 must be clamped to 7
    const node = makeNode('n1', 800, 800, 0, 0)
    const grid = bucketNodes([node], bounds)
    expect(grid[7][7]).toBe(1)
  })

  it('aggregates multiple nodes in the same cell', () => {
    const bounds = makeBounds(0, 0, 800, 800)
    // All three nodes have centers in cell (0,0) — upper-left 100×100 region
    const nodes = [
      makeNode('a', 0, 0, 100, 100),   // center (50,50)
      makeNode('b', 10, 10, 80, 80),   // center (50,50)
      makeNode('c', 5, 5, 90, 90),     // center (50,50)
    ]
    const grid = bucketNodes(nodes, bounds)
    expect(grid[0][0]).toBe(3)
  })

  it('distributes nodes evenly across all 64 cells when perfectly arranged', () => {
    const bounds = makeBounds(0, 0, 800, 800)
    // One node centered in each of the 64 cells (100×100 each)
    const nodes: ResolvedNode[] = []
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        // Cell center world coords
        const wx = col * 100 + 50
        const wy = row * 100 + 50
        nodes.push(makeNode(`n_${row}_${col}`, wx, wy, 0, 0))
      }
    }
    const grid = bucketNodes(nodes, bounds)
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        expect(grid[row][col]).toBe(1)
      }
    }
  })

  it('handles nodes outside bounds by clamping them to grid edges', () => {
    const bounds = makeBounds(0, 0, 800, 800)
    const nodeLeft = makeNode('left', -500, 400, 0, 0)  // center (-500, 400) → col 0
    const nodeRight = makeNode('right', 1500, 400, 0, 0) // center (1500,400) → col 7
    const grid = bucketNodes([nodeLeft, nodeRight], bounds)
    expect(grid[4][0]).toBe(1) // row=4 (400/800*8=4), col=0 (clamped)
    expect(grid[4][7]).toBe(1) // row=4, col=7 (clamped)
  })
})
