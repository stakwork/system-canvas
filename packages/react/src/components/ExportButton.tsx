import React, { useEffect, useRef, useState } from 'react'
import type { CanvasTheme } from 'system-canvas'

export interface ExportButtonRenderProps {
  onExportJSON: () => void
  onExportPNG?: () => Promise<void>
  onExportSVG?: () => void
  theme: CanvasTheme
}

interface ExportButtonProps extends ExportButtonRenderProps {}

/**
 * Floating export button. Click opens a dropdown with export actions.
 * Sits to the left of the AddNodeButton FAB.
 */
export function ExportButton({
  onExportJSON,
  onExportPNG,
  onExportSVG,
  theme,
}: ExportButtonProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current) return
      if (!rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onDocClick)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDocClick)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const rows: Array<{ label: string; onClick: () => void | Promise<void> }> = []

  rows.push({
    label: 'Export JSON',
    onClick: () => {
      onExportJSON()
      setOpen(false)
    },
  })

  if (onExportPNG) {
    rows.push({
      label: 'Export PNG',
      onClick: async () => {
        await onExportPNG()
        setOpen(false)
      },
    })
  }

  if (onExportSVG) {
    rows.push({
      label: 'Export SVG',
      onClick: () => {
        onExportSVG()
        setOpen(false)
      },
    })
  }

  return (
    <div
      ref={rootRef}
      className="system-canvas-export-button"
      style={{
        position: 'relative',
        fontFamily: theme.breadcrumbs.fontFamily,
        fontSize: theme.breadcrumbs.fontSize,
        userSelect: 'none',
      }}
    >
      {open && (
        <div
          style={{
            position: 'absolute',
            bottom: 52,
            right: 0,
            minWidth: 160,
            padding: 6,
            background: theme.breadcrumbs.background,
            color: theme.breadcrumbs.textColor,
            borderRadius: 10,
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
            backdropFilter: 'blur(10px)',
          }}
        >
          {rows.map((row) => (
            <button
              key={row.label}
              type="button"
              onClick={() => void row.onClick()}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '7px 10px',
                borderRadius: 6,
                border: 'none',
                background: 'transparent',
                color: theme.breadcrumbs.textColor,
                cursor: 'pointer',
                fontSize: 'inherit',
                fontFamily: 'inherit',
              }}
              onMouseEnter={(e) => {
                ;(e.currentTarget as HTMLButtonElement).style.background =
                  `${theme.breadcrumbs.activeColor}22`
              }}
              onMouseLeave={(e) => {
                ;(e.currentTarget as HTMLButtonElement).style.background = 'transparent'
              }}
            >
              {row.label}
            </button>
          ))}
        </div>
      )}

      <button
        type="button"
        aria-label={open ? 'Close export menu' : 'Export canvas'}
        onClick={() => setOpen((v) => !v)}
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          border: `1px solid ${theme.breadcrumbs.separatorColor}`,
          background: theme.breadcrumbs.background,
          color: theme.breadcrumbs.activeColor,
          cursor: 'pointer',
          fontSize: 20,
          lineHeight: 1,
          padding: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backdropFilter: 'blur(10px)',
        }}
      >
        {/* Up-arrow icon */}
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="10" y1="15" x2="10" y2="5" />
          <polyline points="5,10 10,5 15,10" />
        </svg>
      </button>
    </div>
  )
}
