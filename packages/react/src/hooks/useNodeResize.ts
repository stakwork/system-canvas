import { useCallback, useRef, useState } from 'react'
import type { ResolvedNode, ViewportState, NodeUpdate } from 'system-canvas'
import { snapToGrid } from 'system-canvas'

export type ResizeCorner = 'nw' | 'ne' | 'sw' | 'se'

export interface ResizeOverride {
  x: number
  y: number
  width: number
  height: number
}

interface UseNodeResizeOptions {
  viewport: React.RefObject<ViewportState>
  onCommit: (id: string, patch: NodeUpdate) => void
  /** Minimum node width/height in canvas-space. */
  minSize?: number
  /**
   * When > 0, resize dimensions are snapped to the nearest multiple of this
   * value (in canvas units) live during resize. Defaults to 0 (off).
   */
  snapGridSize?: number
}

interface UseNodeResizeResult {
  resizeOverrides: Map<string, ResizeOverride>
  onHandlePointerDown: (
    node: ResolvedNode,
    corner: ResizeCorner,
    event: React.PointerEvent
  ) => void
  isResizing: boolean
}

interface ResizeState {
  nodeId: string
  corner: ResizeCorner
  startClientX: number
  startClientY: number
  startX: number
  startY: number
  startW: number
  startH: number
  pointerId: number
  captureTarget: Element
}

const DEFAULT_MIN_SIZE = 40

export function useNodeResize(options: UseNodeResizeOptions): UseNodeResizeResult {
  const { viewport, onCommit, minSize = DEFAULT_MIN_SIZE, snapGridSize = 0 } = options

  const [resizeOverrides, setResizeOverrides] = useState<Map<string, ResizeOverride>>(
    () => new Map()
  )
  const [isResizing, setIsResizing] = useState(false)

  const stateRef = useRef<ResizeState | null>(null)
  const overridesRef = useRef(resizeOverrides)
  overridesRef.current = resizeOverrides

  const onPointerMove = useCallback(
    (event: PointerEvent) => {
      const st = stateRef.current
      if (!st || event.pointerId !== st.pointerId) return

      const zoom = viewport.current?.zoom ?? 1
      const dx = (event.clientX - st.startClientX) / zoom
      const dy = (event.clientY - st.startClientY) / zoom

      let { startX: nx, startY: ny, startW: nw, startH: nh } = st

      switch (st.corner) {
        case 'se':
          nw = st.startW + dx
          nh = st.startH + dy
          break
        case 'sw':
          nw = st.startW - dx
          nh = st.startH + dy
          nx = st.startX + dx
          break
        case 'ne':
          nw = st.startW + dx
          nh = st.startH - dy
          ny = st.startY + dy
          break
        case 'nw':
          nw = st.startW - dx
          nh = st.startH - dy
          nx = st.startX + dx
          ny = st.startY + dy
          break
      }

      // Clamp to minimum. When clamping a west/north edge, pin the opposite
      // edge so the node doesn't drift.
      if (nw < minSize) {
        if (st.corner === 'sw' || st.corner === 'nw') {
          nx = st.startX + (st.startW - minSize)
        }
        nw = minSize
      }
      if (nh < minSize) {
        if (st.corner === 'ne' || st.corner === 'nw') {
          ny = st.startY + (st.startH - minSize)
        }
        nh = minSize
      }

      // Snap dimensions (and re-pin west/north edges so the fixed edge stays put).
      if (snapGridSize > 0) {
        nw = Math.max(minSize, snapToGrid(nw, snapGridSize))
        nh = Math.max(minSize, snapToGrid(nh, snapGridSize))
        if (st.corner === 'sw' || st.corner === 'nw') nx = st.startX + st.startW - nw
        if (st.corner === 'ne' || st.corner === 'nw') ny = st.startY + st.startH - nh
      }

      const next = new Map(overridesRef.current)
      next.set(st.nodeId, { x: nx, y: ny, width: nw, height: nh })
      setResizeOverrides(next)
      if (!isResizing) setIsResizing(true)
    },
    [viewport, isResizing]
  )

  const onPointerUpRef = useRef<((e: PointerEvent) => void) | null>(null)
  const onPointerCancelRef = useRef<((e: PointerEvent) => void) | null>(null)

  const finish = useCallback(
    (commit: boolean) => {
      const st = stateRef.current
      if (!st) return

      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUpRef.current!)
      window.removeEventListener('pointercancel', onPointerCancelRef.current!)

      try {
        ;(st.captureTarget as any).releasePointerCapture?.(st.pointerId)
      } catch {
        // ignore
      }

      if (commit) {
        const o = overridesRef.current.get(st.nodeId)
        if (o) {
          onCommit(st.nodeId, {
            x: Math.round(o.x),
            y: Math.round(o.y),
            width: Math.round(o.width),
            height: Math.round(o.height),
          })
        }
      }

      stateRef.current = null
      setIsResizing(false)
      setResizeOverrides(new Map())
    },
    [onPointerMove, onCommit]
  )

  const onPointerUp = useCallback(
    (event: PointerEvent) => {
      const st = stateRef.current
      if (!st || event.pointerId !== st.pointerId) return
      finish(true)
    },
    [finish]
  )
  onPointerUpRef.current = onPointerUp

  const onPointerCancel = useCallback(
    (event: PointerEvent) => {
      const st = stateRef.current
      if (!st || event.pointerId !== st.pointerId) return
      finish(false)
    },
    [finish]
  )
  onPointerCancelRef.current = onPointerCancel

  const onHandlePointerDown = useCallback(
    (node: ResolvedNode, corner: ResizeCorner, event: React.PointerEvent) => {
      if (event.button !== 0) return
      if (stateRef.current) return
      event.stopPropagation()
      event.preventDefault()

      stateRef.current = {
        nodeId: node.id,
        corner,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startX: node.x,
        startY: node.y,
        startW: node.width,
        startH: node.height,
        pointerId: event.pointerId,
        captureTarget: event.currentTarget,
      }

      try {
        ;(event.currentTarget as any).setPointerCapture?.(event.pointerId)
      } catch {
        // ignore
      }

      window.addEventListener('pointermove', onPointerMove)
      window.addEventListener('pointerup', onPointerUp)
      window.addEventListener('pointercancel', onPointerCancel)
    },
    [onPointerMove, onPointerUp, onPointerCancel]
  )

  return { resizeOverrides, onHandlePointerDown, isResizing }
}
