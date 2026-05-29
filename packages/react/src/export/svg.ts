import type { ResolvedNode } from 'system-canvas'
import { computeExportBounds } from './utils.js'
import { cloneForExport } from './png.js'

export interface ExportAsSVGOptions {
  filename?: string
  padding?: number
}

export function exportAsSVG(
  svgEl: SVGSVGElement,
  nodes: ResolvedNode[],
  options?: ExportAsSVGOptions,
): void {
  const bounds = computeExportBounds(nodes, options?.padding)
  const clone = cloneForExport(svgEl, bounds)

 
  clone.setAttribute('width', String(bounds.width))
  clone.setAttribute('height', String(bounds.height))

  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')

  const svgString =
    '<?xml version="1.0" encoding="utf-8"?>\n' +
    new XMLSerializer().serializeToString(clone)

  const blob = new Blob([svgString], { type: 'image/svg+xml' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = options?.filename ?? 'canvas.svg'
  a.click()
  URL.revokeObjectURL(url)
}
