import { useEffect, useRef } from 'react'
import type { CanvasNode, CanvasEdge, ViewportState } from 'system-canvas'
import { generateNodeId, generateEdgeId, screenToCanvas } from 'system-canvas'

interface ClipboardSnapshot {
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  viewportAtCopy: ViewportState
}

// Module-level clipboard — survives re-renders and component unmounts,
// so paste works even after the originating canvas navigates away.
let clipboardSnapshot: ClipboardSnapshot | null = null

interface UseMultiSelectClipboardOptions {
  selectedIdsRef: React.RefObject<Set<string>>
  nodesRef: React.RefObject<CanvasNode[]>
  edgesRef: React.RefObject<CanvasEdge[]>
  viewport: React.RefObject<ViewportState>
  canvasContainerRef: React.RefObject<HTMLElement | null>
  onNodeAdd: (node: CanvasNode, canvasRef: string | undefined) => void
  onEdgeAdd: (edge: CanvasEdge, canvasRef: string | undefined) => void
  canvasRef: string | undefined
  /** Returns the cursor position in SVG-relative screen coords, or null. */
  getCursorScreenPos?: () => { x: number; y: number } | null
  onBeginBatch?: () => void
  onEndBatch?: () => void
}

export function useMultiSelectClipboard(options: UseMultiSelectClipboardOptions): void {
  const {
    selectedIdsRef,
    nodesRef,
    edgesRef,
    viewport,
    onNodeAdd,
    onEdgeAdd,
    canvasRef,
    getCursorScreenPos,
    onBeginBatch,
    onEndBatch,
  } = options

  const getCursorScreenPosRef = useRef(getCursorScreenPos)
  getCursorScreenPosRef.current = getCursorScreenPos

  // Keep latest callbacks in refs so the document handler never goes stale
  const onNodeAddRef = useRef(onNodeAdd)
  onNodeAddRef.current = onNodeAdd
  const onEdgeAddRef = useRef(onEdgeAdd)
  onEdgeAddRef.current = onEdgeAdd
  const canvasRefRef = useRef(canvasRef)
  canvasRefRef.current = canvasRef
  const onBeginBatchRef = useRef(onBeginBatch)
  onBeginBatchRef.current = onBeginBatch
  const onEndBatchRef = useRef(onEndBatch)
  onEndBatchRef.current = onEndBatch

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Guard: skip when a text editor has focus
      const active = document.activeElement
      if (
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        (active instanceof HTMLElement && active.isContentEditable)
      ) {
        return
      }

      const isMod = e.metaKey || e.ctrlKey

      // -----------------------------------------------------------------------
      // Cmd+C — copy
      // -----------------------------------------------------------------------
      if (isMod && e.key === 'c') {
        // Never clobber a real text selection. The canvas's own SVG text is
        // `user-select: none`, so any non-collapsed selection lives in
        // consuming DOM (e.g. a chat sidebar overlaid on the canvas). Bail so
        // the browser's native copy wins — otherwise `preventDefault()` below
        // would swallow the copy and the user's selected text never reaches
        // the clipboard whenever canvas nodes happen to be selected.
        const textSelection = window.getSelection()
        if (textSelection && !textSelection.isCollapsed && textSelection.toString().length > 0) {
          return
        }

        const selectedIds = selectedIdsRef.current
        if (!selectedIds || selectedIds.size === 0) return

        const nodes = nodesRef.current ?? []
        const edges = edgesRef.current ?? []
        const vp = viewport.current ?? { x: 0, y: 0, zoom: 1 }

        const copiedNodes = nodes.filter(n => selectedIds.has(n.id))
        if (copiedNodes.length === 0) return

        const copiedEdges = edges.filter(
          edge => selectedIds.has(edge.fromNode) && selectedIds.has(edge.toNode)
        )

        clipboardSnapshot = {
          nodes: copiedNodes,
          edges: copiedEdges,
          viewportAtCopy: { ...vp },
        }

        e.preventDefault()
        return
      }

      // -----------------------------------------------------------------------
      // Cmd+V — paste
      // -----------------------------------------------------------------------
      if (isMod && e.key === 'v') {
        if (!clipboardSnapshot) return

        const { nodes: srcNodes, edges: srcEdges } = clipboardSnapshot
        if (srcNodes.length === 0) return

        // Build old-id → new-id mapping
        const oldToNew = new Map<string, string>()
        for (const n of srcNodes) {
          oldToNew.set(n.id, generateNodeId())
        }

        // Compute bounding-box center of original nodes
        let minX = Infinity
        let minY = Infinity
        let maxX = -Infinity
        let maxY = -Infinity
        for (const n of srcNodes) {
          minX = Math.min(minX, n.x)
          minY = Math.min(minY, n.y)
          maxX = Math.max(maxX, n.x + (n.width ?? 0))
          maxY = Math.max(maxY, n.y + (n.height ?? 0))
        }
        const clusterCx = (minX + maxX) / 2
        const clusterCy = (minY + maxY) / 2

        // Paste at the cursor position when available, otherwise fall back
        // to the viewport origin with a small offset.
        const vp = viewport.current ?? { x: 0, y: 0, zoom: 1 }
        const cursorScreen = getCursorScreenPosRef.current?.()
        let targetCanvas: { x: number; y: number }
        if (cursorScreen) {
          targetCanvas = screenToCanvas(cursorScreen.x, cursorScreen.y, vp)
        } else {
          targetCanvas = screenToCanvas(0, 0, vp)
          targetCanvas = { x: targetCanvas.x + 40, y: targetCanvas.y + 40 }
        }
        const dx = targetCanvas.x - clusterCx
        const dy = targetCanvas.y - clusterCy

        const clonedNodes: CanvasNode[] = srcNodes.map(n => ({
          ...structuredClone(n),
          id: oldToNew.get(n.id)!,
          x: n.x + dx,
          y: n.y + dy,
        }))

        const clonedEdges: CanvasEdge[] = srcEdges
          .filter(
            edge => oldToNew.has(edge.fromNode) && oldToNew.has(edge.toNode)
          )
          .map(edge => ({
            ...structuredClone(edge),
            id: generateEdgeId(),
            fromNode: oldToNew.get(edge.fromNode)!,
            toNode: oldToNew.get(edge.toNode)!,
          }))

        const ref = canvasRefRef.current
        onBeginBatchRef.current?.()
        for (const node of clonedNodes) {
          onNodeAddRef.current(node, ref)
        }
        for (const edge of clonedEdges) {
          onEdgeAddRef.current(edge, ref)
        }
        onEndBatchRef.current?.()

        e.preventDefault()
        return
      }
    }

    document.addEventListener('keydown', handler)
    return () => {
      document.removeEventListener('keydown', handler)
    }
  }, [selectedIdsRef, nodesRef, edgesRef, viewport])
}
