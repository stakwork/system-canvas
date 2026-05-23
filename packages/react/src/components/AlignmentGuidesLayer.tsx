import React from 'react'
import type { AlignmentGuide } from 'system-canvas'

export function AlignmentGuidesLayer({ guides }: { guides: AlignmentGuide[] }) {
  if (guides.length === 0) return null
  return (
    <>
      {guides.map((g, i) => (
        <line
          key={i}
          x1={g.axis === 'x' ? g.position : g.span.start}
          y1={g.axis === 'y' ? g.position : g.span.start}
          x2={g.axis === 'x' ? g.position : g.span.end}
          y2={g.axis === 'y' ? g.position : g.span.end}
          stroke="#38BDF8"
          strokeWidth={1}
          strokeDasharray="4 3"
          pointerEvents="none"
        />
      ))}
    </>
  )
}
