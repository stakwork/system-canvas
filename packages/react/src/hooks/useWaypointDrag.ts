import { useCallback, useRef, useState } from 'react'
import type { ViewportState } from 'system-canvas'
import { screenToCanvas } from 'system-canvas'

interface UseWaypointDragOptions {
  viewport: React.RefObject<ViewportState>
  onCommit: (edgeId: string, waypoints: { x: number; y: number }[]) => void
}

interface UseWaypointDragResult {
  /** Live position overrides during drag — Map<waypointIndex, {x,y}> */
  overrides: Map<number, { x: number; y: number }>
  onHandlePointerDown: (
    edgeId: string,
    waypoints: { x: number; y: number }[],
    index: number,
    event: React.PointerEvent
  ) => void
  onHandleDoubleClick: (
    edgeId: string,
    waypoints: { x: number; y: number }[],
    index: number
  ) => void
  onGhostClick: (
    edgeId: string,
    waypoints: { x: number; y: number }[],
    insertAfterIndex: number,
    pos: { x: number; y: number }
  ) => void
}

interface DragState {
  edgeId: string
  waypoints: { x: number; y: number }[]
  index: number
  pointerId: number
  startClientX: number
  startClientY: number
  startCanvasX: number
  startCanvasY: number
}

/**
 * Pointer-capture drag hook for waypoint handles on edges.
 * Follows the same pattern as useNodeDrag / useNodeResize.
 */
export function useWaypointDrag(
  options: UseWaypointDragOptions
): UseWaypointDragResult {
  const { viewport, onCommit } = options

  const [overrides, setOverrides] = useState<Map<number, { x: number; y: number }>>(
    () => new Map()
  )

  const stateRef = useRef<DragState | null>(null)

  const onPointerMoveRef = useRef<((e: PointerEvent) => void) | null>(null)
  const onPointerUpRef = useRef<((e: PointerEvent) => void) | null>(null)

  const cleanup = useCallback(() => {
    if (onPointerMoveRef.current) {
      window.removeEventListener('pointermove', onPointerMoveRef.current)
      onPointerMoveRef.current = null
    }
    if (onPointerUpRef.current) {
      window.removeEventListener('pointerup', onPointerUpRef.current)
      onPointerUpRef.current = null
    }
  }, [])

  const onHandlePointerDown = useCallback(
    (
      edgeId: string,
      waypoints: { x: number; y: number }[],
      index: number,
      event: React.PointerEvent
    ) => {
      event.stopPropagation()
      event.preventDefault()

      const vp = viewport.current ?? { x: 0, y: 0, zoom: 1 }
      const svgEl = (event.currentTarget as Element).closest('svg')
      const rect = svgEl?.getBoundingClientRect()
      const canvasPos = rect
        ? screenToCanvas(event.clientX - rect.left, event.clientY - rect.top, vp)
        : { x: waypoints[index].x, y: waypoints[index].y }

      stateRef.current = {
        edgeId,
        waypoints: [...waypoints],
        index,
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startCanvasX: canvasPos.x,
        startCanvasY: canvasPos.y,
      }

      try {
        ;(event.currentTarget as Element).setPointerCapture(event.pointerId)
      } catch {
        // ignore
      }

      const onPointerMove = (e: PointerEvent) => {
        const st = stateRef.current
        if (!st || e.pointerId !== st.pointerId) return

        const currentVp = viewport.current ?? { x: 0, y: 0, zoom: 1 }
        const dxScreen = e.clientX - st.startClientX
        const dyScreen = e.clientY - st.startClientY
        const zoom = currentVp.zoom
        const dx = dxScreen / zoom
        const dy = dyScreen / zoom

        const newX = st.startCanvasX + dx
        const newY = st.startCanvasY + dy

        setOverrides((prev) => {
          const next = new Map(prev)
          next.set(st.index, { x: newX, y: newY })
          return next
        })
      }

      const onPointerUp = (e: PointerEvent) => {
        const st = stateRef.current
        if (!st || e.pointerId !== st.pointerId) return

        cleanup()

        const currentVp = viewport.current ?? { x: 0, y: 0, zoom: 1 }
        const dxScreen = e.clientX - st.startClientX
        const dyScreen = e.clientY - st.startClientY
        const zoom = currentVp.zoom
        const dx = dxScreen / zoom
        const dy = dyScreen / zoom

        const newX = st.startCanvasX + dx
        const newY = st.startCanvasY + dy

        const merged = st.waypoints.map((wp, i) =>
          i === st.index ? { x: newX, y: newY } : wp
        )

        stateRef.current = null
        setOverrides(new Map())
        onCommit(st.edgeId, merged)
      }

      onPointerMoveRef.current = onPointerMove
      onPointerUpRef.current = onPointerUp
      window.addEventListener('pointermove', onPointerMove)
      window.addEventListener('pointerup', onPointerUp)
    },
    [viewport, onCommit, cleanup]
  )

  const onHandleDoubleClick = useCallback(
    (
      edgeId: string,
      waypoints: { x: number; y: number }[],
      index: number
    ) => {
      const filtered = waypoints.filter((_, i) => i !== index)
      onCommit(edgeId, filtered)
    },
    [onCommit]
  )

  const onGhostClick = useCallback(
    (
      edgeId: string,
      waypoints: { x: number; y: number }[],
      insertAfterIndex: number,
      pos: { x: number; y: number }
    ) => {
      const insertAt = insertAfterIndex + 1
      const next = [
        ...waypoints.slice(0, insertAt),
        { x: pos.x, y: pos.y },
        ...waypoints.slice(insertAt),
      ]
      onCommit(edgeId, next)
    },
    [onCommit]
  )

  return { overrides, onHandlePointerDown, onHandleDoubleClick, onGhostClick }
}
