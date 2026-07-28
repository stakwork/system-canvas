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
    expect(shouldHandleSearchHotkey(node, container)).toBe(true)
  })

  it('handles the key when nothing is focused', () => {
    expect(shouldHandleSearchHotkey(document.body, container)).toBe(true)
  })

  it('ignores the key while typing in a textarea outside the canvas', () => {
    // The reported bug: a chat panel rendered next to the canvas.
    const chat = appendTo(document.body, 'div')
    const textarea = appendTo(chat, 'textarea')
    expect(shouldHandleSearchHotkey(textarea, container)).toBe(false)
  })

  it('ignores the key while typing in an input, even inside the canvas', () => {
    // The canvas' own search overlay is an input — Cmd+F there is the
    // browser's to handle, not another toggle.
    const input = appendTo(container, 'input')
    expect(shouldHandleSearchHotkey(input, container)).toBe(false)
  })

  it('ignores the key in a contentEditable region', () => {
    const editable = appendTo(document.body, 'div')
    Object.defineProperty(editable, 'isContentEditable', { value: true })
    expect(shouldHandleSearchHotkey(editable, container)).toBe(false)
  })

  it('ignores the key when focus is elsewhere in the host app', () => {
    const sidebarButton = appendTo(appendTo(document.body, 'aside'), 'button')
    expect(shouldHandleSearchHotkey(sidebarButton, container)).toBe(false)
  })

  it('falls back to handling the key when there is no container yet', () => {
    const anywhere = appendTo(document.body, 'div')
    expect(shouldHandleSearchHotkey(anywhere, null)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// useSearchHotkey
// ---------------------------------------------------------------------------

describe('useSearchHotkey', () => {
  let container: HTMLElement

  beforeEach(() => {
    container = makeCanvas()
  })

  it('toggles and preventDefaults for a keystroke inside the canvas', () => {
    const onToggle = vi.fn()
    renderHook(() => useSearchHotkey({ current: container }, onToggle))

    const node = appendTo(container, 'div')
    const prevented = pressCmdF(node)

    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(prevented).toBe(true)
  })

  it('does not toggle or preventDefault from a chat textarea', () => {
    const onToggle = vi.fn()
    renderHook(() => useSearchHotkey({ current: container }, onToggle))

    const textarea = appendTo(appendTo(document.body, 'div'), 'textarea')
    const prevented = pressCmdF(textarea)

    expect(onToggle).not.toHaveBeenCalled()
    // Native find must stay available to the host app.
    expect(prevented).toBe(false)
  })

  it('ignores other keys and unmodified f', () => {
    const onToggle = vi.fn()
    renderHook(() => useSearchHotkey({ current: container }, onToggle))

    const node = appendTo(container, 'div')
    node.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'f', bubbles: true, cancelable: true }),
    )
    node.dispatchEvent(
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
    const { unmount } = renderHook(() =>
      useSearchHotkey({ current: container }, onToggle),
    )
    unmount()

    pressCmdF(appendTo(container, 'div'))
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
    pressCmdF(appendTo(container, 'div'))

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })
})
