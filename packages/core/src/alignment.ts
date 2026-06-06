export interface AlignmentGuide {
  axis: 'x' | 'y'
  position: number
  span: { start: number; end: number }
  kind: 'edge' | 'center'
}

type NodeRect = { id: string; x: number; y: number; width: number; height: number }

interface Anchor {
  axis: 'x' | 'y'
  value: number
  kind: 'edge' | 'center'
  // perpendicular extent of the node (for span computation)
  perpStart: number
  perpEnd: number
}

function getAnchors(n: NodeRect): Anchor[] {
  return [
    { axis: 'x', value: n.x,                   kind: 'edge',   perpStart: n.y, perpEnd: n.y + n.height },
    { axis: 'x', value: n.x + n.width / 2,     kind: 'center', perpStart: n.y, perpEnd: n.y + n.height },
    { axis: 'x', value: n.x + n.width,         kind: 'edge',   perpStart: n.y, perpEnd: n.y + n.height },
    { axis: 'y', value: n.y,                   kind: 'edge',   perpStart: n.x, perpEnd: n.x + n.width  },
    { axis: 'y', value: n.y + n.height / 2,    kind: 'center', perpStart: n.x, perpEnd: n.x + n.width  },
    { axis: 'y', value: n.y + n.height,        kind: 'edge',   perpStart: n.x, perpEnd: n.x + n.width  },
  ]
}

export function computeAlignmentGuides(
  dragging: NodeRect[],
  others: NodeRect[],
  threshold: number,
): AlignmentGuide[] {
  if (dragging.length === 0 || others.length === 0) return []

  // key: `${axis}:${position}` -> widest span guide
  const map = new Map<string, AlignmentGuide>()

  for (const d of dragging) {
    const dAnchors = getAnchors(d)
    for (const o of others) {
      const oAnchors = getAnchors(o)
      for (const da of dAnchors) {
        for (const oa of oAnchors) {
          if (da.axis !== oa.axis || da.kind !== oa.kind) continue
          if (Math.abs(da.value - oa.value) > threshold) continue

          const position = oa.value
          const spanStart = Math.min(da.perpStart, oa.perpStart)
          const spanEnd   = Math.max(da.perpEnd,   oa.perpEnd)
          const key = `${da.axis}:${position}`

          const existing = map.get(key)
          if (!existing || (spanEnd - spanStart) > (existing.span.end - existing.span.start)) {
            map.set(key, { axis: da.axis, position, span: { start: spanStart, end: spanEnd }, kind: da.kind })
          }
        }
      }
    }
  }

  return Array.from(map.values())
}

export function alignNodes(
  nodes: NodeRect[],
  direction: 'left' | 'right' | 'top' | 'bottom' | 'centerH' | 'centerV',
): { id: string; patch: { x?: number; y?: number } }[] {
  if (nodes.length === 0) return []

  let ref: number
  switch (direction) {
    case 'left':    ref = Math.min(...nodes.map(n => n.x)); break
    case 'right':   ref = Math.max(...nodes.map(n => n.x + n.width)); break
    case 'top':     ref = Math.min(...nodes.map(n => n.y)); break
    case 'bottom':  ref = Math.max(...nodes.map(n => n.y + n.height)); break
    case 'centerH': ref = nodes.reduce((s, n) => s + (n.x + n.width / 2), 0) / nodes.length; break
    case 'centerV': ref = nodes.reduce((s, n) => s + (n.y + n.height / 2), 0) / nodes.length; break
  }

  const result: { id: string; patch: { x?: number; y?: number } }[] = []

  for (const n of nodes) {
    let newX: number | undefined
    let newY: number | undefined

    switch (direction) {
      case 'left':    newX = ref; break
      case 'right':   newX = ref - n.width; break
      case 'top':     newY = ref; break
      case 'bottom':  newY = ref - n.height; break
      case 'centerH': newX = ref - n.width / 2; break
      case 'centerV': newY = ref - n.height / 2; break
    }

    const patch: { x?: number; y?: number } = {}
    if (newX !== undefined && newX !== n.x) patch.x = newX
    if (newY !== undefined && newY !== n.y) patch.y = newY

    if (Object.keys(patch).length > 0) result.push({ id: n.id, patch })
  }

  return result
}

export function gridNodes(
  nodes: NodeRect[],
  gap = 20,
): { id: string; patch: { x: number; y: number } }[] {
  if (nodes.length < 2) return []

  const cols = Math.ceil(Math.sqrt(nodes.length))
  const originX = Math.min(...nodes.map(n => n.x))
  const originY = Math.min(...nodes.map(n => n.y))
  const maxW = Math.max(...nodes.map(n => n.width))
  const maxH = Math.max(...nodes.map(n => n.height))

  // Sort reading-order: top->bottom, left->right by current position
  const sorted = [...nodes].sort((a, b) => a.y !== b.y ? a.y - b.y : a.x - b.x)

  return sorted.flatMap((n, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    const newX = originX + col * (maxW + gap)
    const newY = originY + row * (maxH + gap)
    return (newX === n.x && newY === n.y)
      ? []
      : [{ id: n.id, patch: { x: newX, y: newY } }]
  })
}

export function distributeNodes(
  nodes: NodeRect[],
  axis: 'horizontal' | 'vertical',
): { id: string; patch: { x?: number; y?: number } }[] {
  if (nodes.length < 3) return []

  const isH = axis === 'horizontal'
  const sorted = [...nodes].sort((a, b) => (isH ? a.x - b.x : a.y - b.y))

  const first = sorted[0]
  const last  = sorted[sorted.length - 1]

  const outerStart = isH ? first.x : first.y
  const outerEnd   = isH ? last.x + last.width : last.y + last.height
  const sumInnerSizes = sorted.slice(1, -1).reduce((s, n) => s + (isH ? n.width : n.height), 0)
  const totalOuterSize = isH ? first.width + last.width : first.height + last.height
  const spacing = (outerEnd - outerStart - totalOuterSize - sumInnerSizes) / (sorted.length - 1)

  const result: { id: string; patch: { x?: number; y?: number } }[] = []
  let cursor = outerStart + (isH ? first.width : first.height) + spacing

  for (let i = 1; i < sorted.length - 1; i++) {
    const n = sorted[i]
    const newVal = cursor
    const oldVal = isH ? n.x : n.y
    if (newVal !== oldVal) {
      result.push({ id: n.id, patch: isH ? { x: newVal } : { y: newVal } })
    }
    cursor += (isH ? n.width : n.height) + spacing
  }

  return result
}
