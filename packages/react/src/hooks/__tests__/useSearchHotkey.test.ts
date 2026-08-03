import { renderHook } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  shouldHandleSearchHotkey,
  useSearchHotkey,
} from '../useSearchHotkey.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCanvas(): HTMLElement {
  const container = document.createElement('div')
  container.className = 'system-canvas'
  document.body.appendChild(container)
  return container
}

function appendTo(parent: HTMLElement, tag: string): HTMLElement {
  const el = document.createElement(tag)
  parent.appendChild(el)
  return el
}

/** Viewport renders an <svg>, NodeRenderer a <g> — canvas clicks are SVG. */
function appendSvgTo(parent: Element, tag: string): SVGElement {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag)
  parent.appendChild(el)
  return el
}

function click(target: EventTarget): void {
  target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
}

function pressCmdF(target: EventTarget): boolean {
  const e = new KeyboardEvent('keydown', {
    key: 'f',
    metaKey: true,
    bubbles: true,
    cancelable: true,
  })
  target.dispatchEvent(e)
  return e.defaultPrevented
}

afterEach(() => {
  document.body.innerHTML = ''
})

// ---------------------------------------------------------------------------
// shouldHandleSearchHotkey
// ---------------------------------------------------------------------------

describe('shouldHandleSearchHotkey', () => {
  let container: HTMLElement

  beforeEach(() => {
    container = makeCanvas()
  })

  it('handles the key when the target is inside the canvas', () => {
    const node = appendTo(container, 'div')
    expect(shouldHandleSearchHotkey(node, container, false)).toBe(true)
  })

  it('defers to canvasActive when nothing is focused', () => {
    // Most host-app chrome is not focusable, so a click on it leaves the
    // keystroke on <body> — indistinguishable from "never clicked anything".
    expect(shouldHandleSearchHotkey(document.body, container, true)).toBe(true)
    expect(shouldHandleSearchHotkey(document.body, container, false)).toBe(false)
  })

  it('ignores the key while typing in a textarea outside the canvas', () => {
    const chat = appendTo(document.body, 'div')
    const textarea = appendTo(chat, 'textarea')
    expect(shouldHandleSearchHotkey(textarea, container, true)).toBe(false)
  })

  it('ignores the key while typing in an input, even inside the canvas', () => {
    // The canvas' own search overlay is an input — Cmd+F there belongs to the
    // browser, not to another toggle.
    const input = appendTo(container, 'input')
    expect(shouldHandleSearchHotkey(input, container, true)).toBe(false)
  })

  it('ignores the key in a contentEditable region', () => {
    const editable = appendTo(document.body, 'div')
    Object.defineProperty(editable, 'isContentEditable', { value: true })
    expect(shouldHandleSearchHotkey(editable, container, true)).toBe(false)
  })

  it('ignores the key when a focusable element elsewhere has focus', () => {
    const sidebarButton = appendTo(appendTo(document.body, 'aside'), 'button')
    expect(shouldHandleSearchHotkey(sidebarButton, container, false)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// useSearchHotkey
// ---------------------------------------------------------------------------

describe('useSearchHotkey', () => {
  let container: HTMLElement
  let chatPanel: HTMLElement

  beforeEach(() => {
    container = makeCanvas()
    chatPanel = appendTo(document.body, 'div')
  })

  function mount(onToggle: () => void) {
    return renderHook(() => useSearchHotkey({ current: container }, onToggle))
  }

  it('does nothing before the canvas has been clicked', () => {
    const onToggle = vi.fn()
    mount(onToggle)

    const prevented = pressCmdF(document.body)

    expect(onToggle).not.toHaveBeenCalled()
    // The host app keeps native find.
    expect(prevented).toBe(false)
  })

  it('toggles after the canvas is clicked', () => {
    const onToggle = vi.fn()
    mount(onToggle)

    click(appendTo(container, 'div'))
    const prevented = pressCmdF(document.body)

    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(prevented).toBe(true)
  })

  it('stops toggling once a non-focusable part of the host app is clicked', () => {
    // The reported case: clicking anywhere in the chat panel — not just its
    // textarea — must hand Cmd+F back to the browser.
    const onToggle = vi.fn()
    mount(onToggle)

    click(appendTo(container, 'div'))
    click(appendTo(chatPanel, 'div'))
    const prevented = pressCmdF(document.body)

    expect(onToggle).not.toHaveBeenCalled()
    expect(prevented).toBe(false)
  })

  it('does not toggle from a chat textarea even when the canvas was clicked last', () => {
    const onToggle = vi.fn()
    mount(onToggle)

    click(appendTo(container, 'div'))
    const textarea = appendTo(chatPanel, 'textarea')
    const prevented = pressCmdF(textarea)

    expect(onToggle).not.toHaveBeenCalled()
    expect(prevented).toBe(false)
  })

  it('toggles when focus is inside the canvas regardless of click history', () => {
    const onToggle = vi.fn()
    mount(onToggle)

    click(appendTo(chatPanel, 'div'))
    const node = appendTo(container, 'div')
    const prevented = pressCmdF(node)

    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(prevented).toBe(true)
  })

  it('ignores other keys and unmodified f', () => {
    const onToggle = vi.fn()
    mount(onToggle)
    click(appendTo(container, 'div'))

    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'f', bubbles: true, cancelable: true }),
    )
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'g',
        metaKey: true,
        bubbles: true,
        cancelable: true,
      }),
    )

    expect(onToggle).not.toHaveBeenCalled()
  })

  it('stops listening after unmount', () => {
    const onToggle = vi.fn()
    const { unmount } = mount(onToggle)
    click(appendTo(container, 'div'))
    unmount()

    pressCmdF(document.body)
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('calls the latest callback without re-subscribing', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = renderHook(
      ({ cb }) => useSearchHotkey({ current: container }, cb),
      { initialProps: { cb: first } },
    )

    rerender({ cb: second })
    click(appendTo(container, 'div'))
    pressCmdF(document.body)

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('toggles after a node is clicked', () => {
    const onToggle = vi.fn()
    mount(onToggle)

    const svg = appendSvgTo(container, 'svg')
    click(appendSvgTo(svg, 'g'))
    const prevented = pressCmdF(document.body)

    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(prevented).toBe(true)
  })

  it('toggles after the empty canvas surface is clicked', () => {
    const onToggle = vi.fn()
    mount(onToggle)

    click(appendSvgTo(container, 'svg'))
    const prevented = pressCmdF(document.body)

    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(prevented).toBe(true)
  })

  it('still hands Cmd+F back after a canvas click then a host-app click', () => {
    const onToggle = vi.fn()
    mount(onToggle)

    click(appendSvgTo(container, 'svg'))
    click(appendTo(chatPanel, 'div'))
    const prevented = pressCmdF(document.body)

    expect(onToggle).not.toHaveBeenCalled()
    expect(prevented).toBe(false)
  })
})
