/**
 * RefIndicator unit tests
 *
 * Vitest + jsdom. The drill-in corner must be a named, focusable button so
 * keyboard users, screen readers and accessibility-tree browser agents can
 * reach it — not only pointer users.
 */
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { darkTheme } from 'system-canvas'
import type { CanvasTheme, ResolvedNode } from 'system-canvas'
import { RefIndicator } from '../RefIndicator.js'

function makeNode(overrides: Partial<ResolvedNode> = {}): ResolvedNode {
  return {
    id: 'n1',
    type: 'text',
    x: 0,
    y: 0,
    width: 200,
    height: 100,
    text: 'Core API\nhandles requests',
    ref: 'core-api',
    resolvedCornerRadius: 6,
    ...overrides,
  } as unknown as ResolvedNode
}

function renderIndicator(
  node: ResolvedNode,
  onNavigate = vi.fn(),
  theme: CanvasTheme = darkTheme
) {
  const onParentClick = vi.fn()
  const utils = render(
    <svg onClick={onParentClick}>
      <RefIndicator
        node={node}
        theme={theme}
        nodeX={node.x}
        nodeY={node.y}
        nodeWidth={node.width}
        nodeHeight={node.height}
        strokeColor="#fff"
        onNavigate={onNavigate}
      />
    </svg>
  )
  return { ...utils, onNavigate, onParentClick }
}

describe('RefIndicator', () => {
  it('is a focusable button named after the node', () => {
    renderIndicator(makeNode())
    const button = screen.getByRole('button', { name: 'Open Core API' })
    expect(button.getAttribute('tabindex')).toBe('0')
  })

  it('drops markdown heading marks from the name', () => {
    renderIndicator(makeNode({ text: '## Billing' } as Partial<ResolvedNode>))
    expect(screen.getByRole('button', { name: 'Open Billing' })).toBeTruthy()
  })

  it('names group nodes by their label', () => {
    renderIndicator(makeNode({ type: 'group', label: 'Data Layer', text: undefined } as Partial<ResolvedNode>))
    expect(screen.getByRole('button', { name: 'Open Data Layer' })).toBeTruthy()
  })

  it('navigates on click without bubbling to the node', () => {
    const { onNavigate, onParentClick } = renderIndicator(makeNode())
    fireEvent.click(screen.getByRole('button'))
    expect(onNavigate).toHaveBeenCalledTimes(1)
    expect(onParentClick).not.toHaveBeenCalled()
  })

  it.each(['Enter', ' '])('navigates on %j', (key) => {
    const node = makeNode()
    const { onNavigate } = renderIndicator(node)
    fireEvent.keyDown(screen.getByRole('button'), { key })
    expect(onNavigate).toHaveBeenCalledTimes(1)
    expect(onNavigate.mock.calls[0][0]).toBe(node)
  })

  it('ignores other keys', () => {
    const { onNavigate } = renderIndicator(makeNode())
    fireEvent.keyDown(screen.getByRole('button'), { key: 'a' })
    fireEvent.keyDown(screen.getByRole('button'), { key: 'Tab' })
    expect(onNavigate).not.toHaveBeenCalled()
  })

  it('renders nothing when the theme hides the indicator', () => {
    const theme = {
      ...darkTheme,
      node: { ...darkTheme.node, refIndicator: { ...darkTheme.node.refIndicator, icon: 'none' } },
    } as CanvasTheme
    renderIndicator(makeNode(), vi.fn(), theme)
    expect(screen.queryByRole('button')).toBeNull()
  })
})
