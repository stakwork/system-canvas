import React, { useEffect, useRef } from 'react'
import type { CollaboratorInfo, ResolvedNode, ViewportState } from 'system-canvas'
import {
  canvasToScreen,
  canvasRectToScreenRect,
} from 'system-canvas'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CollaboratorsOverlayProps {
  collaborators: CollaboratorInfo[]
  viewport: ViewportState
  nodeMap: Map<string, ResolvedNode>
  flashNodeIds: Map<string, number>
}

// ---------------------------------------------------------------------------
// Keyframe style injection (once per document)
// ---------------------------------------------------------------------------

const STYLE_ID = 'system-canvas-collab-keyframes'

function ensureKeyframes(): void {
  if (typeof document === 'undefined') return
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
@keyframes sc-collab-flash {
  0%   { background: rgba(255,255,255,0.15); transform: translate(0,0); }
  20%  { background: rgba(255,255,255,0.18); transform: translate(-3px,0); }
  40%  { background: rgba(255,255,255,0.15); transform: translate(3px,0); }
  60%  { background: rgba(255,255,255,0.12); transform: translate(-2px,0); }
  80%  { background: rgba(255,255,255,0.08); transform: translate(2px,0); }
  100% { background: rgba(255,255,255,0); transform: translate(0,0); }
}
`
  document.head.appendChild(style)
}

// ---------------------------------------------------------------------------
// CollaboratorsOverlay
// ---------------------------------------------------------------------------

export function CollaboratorsOverlay({
  collaborators,
  viewport,
  nodeMap,
  flashNodeIds,
}: CollaboratorsOverlayProps): React.ReactElement | null {
  // Inject keyframes on first render (client-side only)
  const keyframesInjected = useRef(false)
  if (!keyframesInjected.current) {
    ensureKeyframes()
    keyframesInjected.current = true
  }

  if (collaborators.length === 0 && flashNodeIds.size === 0) return null

  // Group halos by nodeId so we can apply a per-index outset
  const halosByNode = new Map<string, CollaboratorInfo[]>()
  for (const collab of collaborators) {
    if (collab.selectedNodeId) {
      const arr = halosByNode.get(collab.selectedNodeId) ?? []
      arr.push(collab)
      halosByNode.set(collab.selectedNodeId, arr)
    }
  }

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
        zIndex: 30,
      }}
    >
      {/* Halo layer */}
      {Array.from(halosByNode.entries()).map(([nodeId, collabList]) => {
        const node = nodeMap.get(nodeId)
        if (!node) return null
        const screenRect = canvasRectToScreenRect(
          { x: node.x, y: node.y, width: node.width, height: node.height },
          viewport
        )
        return collabList.map((collab, idx) => {
          const outset = 3 + idx * 2
          return (
            <div key={`halo-${nodeId}-${collab.id}`}>
              {/* Border ring */}
              <div
                style={{
                  position: 'absolute',
                  left: screenRect.x - outset,
                  top: screenRect.y - outset,
                  width: screenRect.width + outset * 2,
                  height: screenRect.height + outset * 2,
                  border: `2px solid ${collab.color}`,
                  borderRadius: 6 + outset,
                  opacity: 0.55,
                  boxSizing: 'border-box',
                }}
              />
              {/* Name label anchored to top-left of halo */}
              <div
                style={{
                  position: 'absolute',
                  left: screenRect.x - outset,
                  top: screenRect.y - outset - 18,
                  fontSize: 11,
                  lineHeight: '16px',
                  padding: '0 5px',
                  borderRadius: 3,
                  background: collab.color,
                  color: '#fff',
                  whiteSpace: 'nowrap',
                  fontFamily: 'sans-serif',
                  fontWeight: 500,
                }}
              >
                {collab.name}
              </div>
            </div>
          )
        })
      })}

      {/* Cursor layer */}
      {collaborators.map((collab) => {
        if (!collab.cursor) return null
        const screen = canvasToScreen(collab.cursor.x, collab.cursor.y, viewport)
        // Clip guard: skip cursors well outside visible area
        return (
          <div
            key={`cursor-${collab.id}`}
            style={{
              position: 'absolute',
              left: screen.x,
              top: screen.y,
              transform: 'translate(0, 0)',
              userSelect: 'none',
            }}
          >
            {/* SVG arrow cursor */}
            <svg
              width="16"
              height="20"
              viewBox="0 0 16 20"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M1 1L1 15L5 11L8 18L10 17L7 10L13 10L1 1Z"
                fill={collab.color}
                stroke="#fff"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            </svg>
            {/* Name pill with avatar */}
            <div
              style={{
                position: 'absolute',
                top: 18,
                left: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                background: collab.color,
                borderRadius: 8,
                padding: '1px 4px 1px 2px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                whiteSpace: 'nowrap',
                fontFamily: 'sans-serif',
              }}
            >
              {/* Avatar circle */}
              <div
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  overflow: 'hidden',
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: collab.image ? 'transparent' : collab.color,
                }}
              >
                {collab.image ? (
                  <img
                    src={collab.image}
                    width={16}
                    height={16}
                    style={{ objectFit: 'cover', borderRadius: '50%' }}
                  />
                ) : (
                  <div
                    style={{
                      width: 16,
                      height: 16,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: collab.color,
                      color: '#fff',
                      fontSize: 9,
                      fontWeight: 700,
                    }}
                  >
                    {collab.name ? collab.name[0].toUpperCase() : '?'}
                  </div>
                )}
              </div>
              {/* Name text */}
              <span
                style={{
                  fontSize: 11,
                  lineHeight: '16px',
                  color: '#fff',
                  fontWeight: 500,
                }}
              >
                {collab.name}
              </span>
            </div>
          </div>
        )
      })}

      {/* Conflict flash layer */}
      {Array.from(flashNodeIds.keys()).map((nodeId) => {
        const node = nodeMap.get(nodeId)
        if (!node) return null
        const screenRect = canvasRectToScreenRect(
          { x: node.x, y: node.y, width: node.width, height: node.height },
          viewport
        )
        return (
          <div
            key={`flash-${nodeId}`}
            style={{
              position: 'absolute',
              left: screenRect.x,
              top: screenRect.y,
              width: screenRect.width,
              height: screenRect.height,
              borderRadius: 6,
              animation: 'sc-collab-flash 600ms ease-out forwards',
              pointerEvents: 'none',
            }}
          />
        )
      })}
    </div>
  )
}
