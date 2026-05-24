import React, { useEffect, useRef } from 'react'
import type { CanvasTheme } from 'system-canvas'

interface SearchOverlayProps {
  open: boolean
  query: string
  onQueryChange: (q: string) => void
  theme: CanvasTheme
  hiddenCategories: Set<string>
  onToggleCategory: (cat: string) => void
  matchCount: number
  totalCount: number
  onClose: () => void
  onPanToMatch: () => void
}

/**
 * Floating search + category-filter overlay, rendered as a pill-shaped HTML
 * overlay centered at the top of the canvas container.
 *
 * Returns null when `open` is false — zero cost when inactive.
 */
export function SearchOverlay({
  open,
  query,
  onQueryChange,
  theme,
  hiddenCategories,
  onToggleCategory,
  matchCount,
  totalCount,
  onClose,
  onPanToMatch,
}: SearchOverlayProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-focus the input whenever the overlay opens
  useEffect(() => {
    if (open) {
      inputRef.current?.focus()
    }
  }, [open])

  if (!open) return null

  const bg = theme.breadcrumbs.background
  const textColor = theme.breadcrumbs.textColor
  const fontFamily = theme.node.fontFamily
  const categories = theme.categories ?? {}
  const hasCats = Object.keys(categories).length > 0

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      onPanToMatch()
    }
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1001,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        pointerEvents: 'none',
      }}
    >
      {/* Search input row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 12px',
          background: bg,
          borderRadius: 20,
          backdropFilter: 'blur(8px)',
          boxShadow: '0 2px 12px rgba(0,0,0,0.25)',
          pointerEvents: 'all',
          minWidth: 220,
        }}
      >
        <svg
          width={14}
          height={14}
          viewBox="0 0 16 16"
          fill="none"
          stroke={textColor}
          strokeWidth={1.5}
          style={{ opacity: 0.6, flexShrink: 0 }}
        >
          <circle cx={6.5} cy={6.5} r={5} />
          <line x1={10.5} y1={10.5} x2={14} y2={14} />
        </svg>

        <input
          ref={inputRef}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search nodes\u2026"
          style={{
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: textColor,
            fontFamily,
            fontSize: 13,
            width: 160,
            caretColor: textColor,
          }}
        />

        {/* Match count badge */}
        {query.length > 0 && (
          <span
            style={{
              fontSize: 11,
              fontFamily,
              color: textColor,
              opacity: 0.7,
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {matchCount} of {totalCount}
          </span>
        )}

        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: 2,
            display: 'flex',
            alignItems: 'center',
            color: textColor,
            opacity: 0.6,
            flexShrink: 0,
          }}
          title="Close search (Esc)"
        >
          <svg width={12} height={12} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <line x1={1} y1={1} x2={11} y2={11} />
            <line x1={11} y1={1} x2={1} y2={11} />
          </svg>
        </button>
      </div>

      {/* Category toggle pills */}
      {hasCats && (
        <div
          style={{
            display: 'flex',
            gap: 6,
            flexWrap: 'wrap',
            justifyContent: 'center',
            pointerEvents: 'all',
          }}
        >
          {Object.entries(categories).map(([key, def]) => {
            const isHidden = hiddenCategories.has(key)
            const accentColor = def.fill ?? def.stroke ?? textColor
            return (
              <button
                key={key}
                onClick={() => onToggleCategory(key)}
                style={{
                  padding: '3px 10px',
                  borderRadius: 12,
                  border: `1.5px solid ${accentColor}`,
                  background: isHidden ? 'transparent' : accentColor,
                  color: isHidden ? accentColor : (theme.background ?? '#fff'),
                  fontFamily,
                  fontSize: 11,
                  cursor: 'pointer',
                  opacity: isHidden ? 0.5 : 1,
                  transition: 'opacity 0.15s, background 0.15s',
                  backdropFilter: 'blur(8px)',
                  boxShadow: '0 1px 6px rgba(0,0,0,0.2)',
                }}
                title={isHidden ? `Show "${key}" nodes` : `Hide "${key}" nodes`}
              >
                {key}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
