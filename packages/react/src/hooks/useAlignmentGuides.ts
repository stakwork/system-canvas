import { useMemo } from 'react'
import { computeAlignmentGuides } from 'system-canvas'
import type { AlignmentGuide, ResolvedNode } from 'system-canvas'

export function useAlignmentGuides(options: {
  dragOverrides: Map<string, { x: number; y: number }>
  nodesRef: React.RefObject<ResolvedNode[]>
  isDragging: boolean
  threshold: number
}): AlignmentGuide[] {
  const { dragOverrides, nodesRef, isDragging, threshold } = options
  return useMemo(() => {
    if (!isDragging || dragOverrides.size === 0) return []
    const all = nodesRef.current ?? []
    const dragging: { id: string; x: number; y: number; width: number; height: number }[] = []
    const others: { id: string; x: number; y: number; width: number; height: number }[] = []
    for (const n of all) {
      const override = dragOverrides.get(n.id)
      if (override) dragging.push({ ...n, ...override })
      else others.push(n)
    }
    return computeAlignmentGuides(dragging, others, threshold)
  // dragOverrides map reference changes every pointermove frame — that's the signal to recompute
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragOverrides, isDragging, nodesRef, threshold])
}
