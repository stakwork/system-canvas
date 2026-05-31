import React, { useEffect, useRef, useState } from 'react'
import type { CanvasTheme, NodeMenuOption } from 'system-canvas'
import { NodeIcon } from './NodeIcon.js'

export interface AddNodeButtonRenderProps {
  options: NodeMenuOption[]
  addNode: (option: NodeMenuOption, position?: { x: number; y: number }) => void
  theme: CanvasTheme
}

interface AddNodeButtonProps extends AddNodeButtonRenderProps {}

/**
 * Default floating "+" button. Click opens a popover with category options
 * first, then a divider, then base JSON Canvas types.
 */
export function AddNodeButton({ options, addNode, theme }: AddNodeButtonProps) {
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

  const categoryOptions = options.filter((o) => o.kind === 'category')
  const typeOptions = options.filter((o) => o.kind === 'type')

  return (
    <div
      ref={rootRef}
      className="system-canvas-add-node"
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
            minWidth: 200,
            maxHeight: 360,
            overflowY: 'auto',
            padding: 6,
            background: theme.breadcrumbs.background,
            color: theme.breadcrumbs.textColor,
            borderRadius: 10,
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
            backdropFilter: 'blur(10px)',
            zIndex: 1,
          }}
        >
          {categoryOptions.length > 0 && (
            <>
              <SectionLabel theme={theme}>Categories</SectionLabel>
              {categoryOptions.map((opt) => (
                <MenuRow
                  key={`cat-${opt.value}`}
                  theme={theme}
                  option={opt}
                  onClick={() => {
                    addNode(opt)
                    setOpen(false)
                  }}
                />
              ))}
              <Divider theme={theme} />
            </>
          )}
          <SectionLabel theme={theme}>Basic</SectionLabel>
          {typeOptions.map((opt) => (
            <MenuRow
              key={`type-${opt.value}`}
              theme={theme}
              option={opt}
              onClick={() => {
                addNode(opt)
                setOpen(false)
              }}
            />
          ))}
        </div>
      )}

      <button
        type="button"
        aria-label={open ? 'Close add node menu' : 'Add node'}
        onClick={() => setOpen((v) => !v)}
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          border: `1px solid ${theme.breadcrumbs.separatorColor}`,
          background: theme.breadcrumbs.background,
          color: theme.breadcrumbs.activeColor,
          cursor: 'pointer',
          fontSize: 24,
          lineHeight: 1,
          padding: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backdropFilter: 'blur(8px)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
          transform: open ? 'rotate(45deg)' : 'rotate(0deg)',
          transition: 'transform 0.15s ease',
        }}
      >
        +
      </button>
    </div>
  )
}

function SectionLabel({
  theme,
  children,
}: {
  theme: CanvasTheme
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        padding: '4px 8px',
        fontSize: theme.breadcrumbs.fontSize - 2,
        color: theme.breadcrumbs.textColor,
        opacity: 0.6,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}
    >
      {children}
    </div>
  )
}

function Divider({ theme }: { theme: CanvasTheme }) {
  return (
    <div
      style={{
        height: 1,
        margin: '4px 0',
        background: theme.breadcrumbs.separatorColor,
        opacity: 0.4,
      }}
    />
  )
}

function MenuRow({
  theme,
  option,
  onClick,
}: {
  theme: CanvasTheme
  option: NodeMenuOption
  onClick: () => void
}) {
  const [hover, setHover] = useState(false)
  const swatchSize = 18

  return (
    <div
      role="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 8px',
        borderRadius: 6,
        cursor: 'pointer',
        background: hover ? 'rgba(255,255,255,0.06)' : 'transparent',
        color: theme.breadcrumbs.activeColor,
      }}
    >
      {option.kind === 'category' ? (
        <span
          style={{
            width: swatchSize,
            height: swatchSize,
            borderRadius: 4,
            background: option.fill ?? 'transparent',
            border: `1px solid ${option.stroke ?? theme.breadcrumbs.separatorColor}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {option.icon && (
            <svg
              width={12}
              height={12}
              viewBox="0 0 14 14"
              style={{ overflow: 'visible' }}
            >
              <g transform="translate(-1, -1)">
                <NodeIcon
                  icon={option.icon}
                  x={0}
                  y={0}
                  size={14}
                  color={option.stroke ?? theme.breadcrumbs.activeColor}
                  opacity={0.9}
                  customIcons={theme.icons}
                />
              </g>
            </svg>
          )}
        </span>
      ) : (
        <span
          style={{
            width: swatchSize,
            height: swatchSize,
            borderRadius: 4,
            border: `1px dashed ${theme.breadcrumbs.separatorColor}`,
            flexShrink: 0,
          }}
        />
      )}
      <span style={{ textTransform: 'capitalize' }}>{option.label}</span>
      <span
        style={{
          marginLeft: 'auto',
          fontSize: theme.breadcrumbs.fontSize - 2,
          opacity: 0.5,
        }}
      >
        {option.nodeType}
      </span>
    </div>
  )
}
