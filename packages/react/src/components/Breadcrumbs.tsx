import React, { useEffect, useRef, useState } from 'react'
import type { BreadcrumbEntry, BreadcrumbTheme } from 'system-canvas'

interface BreadcrumbsProps {
  breadcrumbs: BreadcrumbEntry[]
  theme: BreadcrumbTheme
  onNavigate: (index: number) => void
}

export function Breadcrumbs({
  breadcrumbs,
  theme,
  onNavigate,
}: BreadcrumbsProps) {
  const prevLenRef = useRef(breadcrumbs.length)
  const [animateIndex, setAnimateIndex] = useState<number | null>(null)

  useEffect(() => {
    const prev = prevLenRef.current
    prevLenRef.current = breadcrumbs.length
    if (breadcrumbs.length > prev) {
      setAnimateIndex(breadcrumbs.length - 1)
      const t = window.setTimeout(() => setAnimateIndex(null), 250)
      return () => clearTimeout(t)
    }
  }, [breadcrumbs.length])

  if (breadcrumbs.length <= 1) return null

  return (
    <div
      className="system-canvas-breadcrumbs"
      style={{
        position: 'absolute',
        top: 12,
        left: 12,
        zIndex: 10,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '6px 12px',
        background: theme.background,
        borderRadius: 8,
        fontFamily: theme.fontFamily,
        fontSize: theme.fontSize,
        userSelect: 'none',
        backdropFilter: 'blur(8px)',
      }}
    >
      <style>{`
        @keyframes system-canvas-crumb-in {
          from { opacity: 0; transform: translateX(-6px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
      {breadcrumbs.map((crumb, index) => {
        const isLast = index === breadcrumbs.length - 1
        const shouldAnimate = index === animateIndex

        return (
          <React.Fragment key={index}>
            {index > 0 && (
              <span
                style={{
                  color: theme.separatorColor,
                  margin: '0 2px',
                  ...(shouldAnimate ? {
                    animation: 'system-canvas-crumb-in 250ms cubic-bezier(0.22, 1, 0.36, 1)',
                  } : undefined),
                }}
              >
                /
              </span>
            )}
            <BreadcrumbItem
              label={crumb.label}
              isLast={isLast}
              theme={theme}
              onClick={isLast ? undefined : () => onNavigate(index)}
              animate={shouldAnimate}
            />
          </React.Fragment>
        )
      })}
    </div>
  )
}

function BreadcrumbItem({
  label,
  isLast,
  theme,
  onClick,
  animate,
}: {
  label: string
  isLast: boolean
  theme: BreadcrumbTheme
  onClick?: () => void
  animate: boolean
}) {
  const [hovered, setHovered] = useState(false)
  const [pressed, setPressed] = useState(false)

  return (
    <span
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setPressed(false) }}
      onMouseDown={() => { if (!isLast) setPressed(true) }}
      onMouseUp={() => setPressed(false)}
      style={{
        color: isLast
          ? theme.activeColor
          : hovered
            ? theme.activeColor
            : theme.textColor,
        cursor: isLast ? 'default' : 'pointer',
        fontWeight: isLast ? 600 : 400,
        opacity: pressed ? 0.7 : 1,
        transition: 'color 150ms ease, opacity 80ms ease',
        borderBottom: !isLast && hovered
          ? `1px solid ${theme.activeColor}`
          : '1px solid transparent',
        paddingBottom: 1,
        ...(animate ? {
          animation: 'system-canvas-crumb-in 250ms cubic-bezier(0.22, 1, 0.36, 1)',
        } : undefined),
      }}
    >
      {label}
    </span>
  )
}
