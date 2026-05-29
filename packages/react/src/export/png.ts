import type { BoundingBox, ResolvedNode } from 'system-canvas'
import domtoimage from 'dom-to-image-more'
import { computeExportBounds } from './utils.js'

/**
 * Deep-clones the SVG element, sets viewBox / width / height from the given
 * bounds, and strips all descendant elements marked with data-no-export="true".
 * The returned clone is NOT attached to the DOM.
 */
export function cloneForExport(svgEl: SVGSVGElement, bounds: BoundingBox): SVGSVGElement {
  const clone = svgEl.cloneNode(true) as SVGSVGElement

  // Set viewBox so the export crops to the content area.
  clone.setAttribute('viewBox', `${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`)

  // Set explicit pixel dimensions scaled by devicePixelRatio for crisp output.
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
  clone.setAttribute('width', String(bounds.width * dpr))
  clone.setAttribute('height', String(bounds.height * dpr))

  // Strip all UI-only elements in one pass.
  const noExportEls = clone.querySelectorAll('[data-no-export="true"]')
  noExportEls.forEach((el) => el.parentNode?.removeChild(el))

  return clone
}

/**
 * Rasterises the full canvas to a PNG file and triggers a browser download.
 */
export async function exportAsPNG(
  svgEl: SVGSVGElement,
  nodes: ResolvedNode[],
  options?: { filename?: string; padding?: number },
): Promise<void> {
  const bounds = computeExportBounds(nodes, options?.padding)
  const clone = cloneForExport(svgEl, bounds)

  // Temporarily attach off-screen so dom-to-image-more can measure it.
  clone.style.position = 'fixed'
  clone.style.left = '-9999px'
  clone.style.top = '0'
  document.body.appendChild(clone)

  try {
    const blob = await domtoimage.toBlob(clone, {
      width: bounds.width,
      height: bounds.height,
    })

    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = options?.filename ?? 'canvas.png'
    a.click()
    URL.revokeObjectURL(url)
  } finally {
    document.body.removeChild(clone)
  }
}

/**
 * Rasterises the canvas (or a subset of nodes) and writes the result to the
 * system clipboard as a PNG image.
 */
export async function copyAsImage(svgEl: SVGSVGElement, nodes: ResolvedNode[]): Promise<void> {
  const bounds = computeExportBounds(nodes)
  const clone = cloneForExport(svgEl, bounds)

  clone.style.position = 'fixed'
  clone.style.left = '-9999px'
  clone.style.top = '0'
  document.body.appendChild(clone)

  try {
    const blob = await domtoimage.toBlob(clone, {
      width: bounds.width,
      height: bounds.height,
    })

    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': blob }),
    ])
  } finally {
    document.body.removeChild(clone)
  }
}
