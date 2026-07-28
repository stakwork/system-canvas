import { useEffect, useRef, type RefObject } from 'react'

/**
 * Should Cmd/Ctrl+F open the canvas search overlay for this keystroke?
 *
 * The listener is on `window` so the overlay works in read-only mode (where
 * the canvas root is not tab-focusable), which means it also sees keystrokes
 * belonging to the host app. Consumers embed the canvas next to their own UI
 * — a chat panel, a sidebar — and hijacking Cmd+F there both opens the wrong
 * search and suppresses the browser's native find.
 *
 * Handle the key when the canvas owns focus, or when nothing does; leave it
 * alone when focus sits in a text field or elsewhere in the host app.
 */
export function shouldHandleSearchHotkey(
  target: EventTarget | null,
  container: HTMLElement | null,
): boolean {
  const el = target instanceof HTMLElement ? target : null

  if (
    el?.tagName === 'INPUT' ||
    el?.tagName === 'TEXTAREA' ||
    el?.isContentEditable
  ) {
    return false
  }

  // No container to compare against, or a target we can't place: assume the
  // canvas is the whole page (demo, standalone build) and keep the old behaviour.
  if (!container || !el) return true

  // Keydowns land on <body> when nothing is focused.
  if (el === document.body || el === document.documentElement) return true

  return container.contains(el)
}

/**
 * Cmd+F / Ctrl+F toggles the canvas search overlay, in both editable and
 * read-only modes.
 */
export function useSearchHotkey(
  containerRef: RefObject<HTMLElement | null>,
  onToggle: () => void,
): void {
  // Kept in a ref so a caller passing an inline closure doesn't re-subscribe
  // the window listener on every render.
  const toggleRef = useRef(onToggle)
  toggleRef.current = onToggle

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!((e.metaKey || e.ctrlKey) && e.key === 'f')) return
      if (!shouldHandleSearchHotkey(e.target, containerRef.current)) return
      e.preventDefault()
      toggleRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [containerRef])
}
