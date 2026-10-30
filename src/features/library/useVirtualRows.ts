import { useEffect, useState, type RefObject } from "react"

/**
 * The rows a scroll container shows (PLAN 9.4 "virtualized cards"): fixed-height rows, plus
 * `overscan` either side, so a catalogue of thousands renders a screenful.
 */
export function useVirtualRows(
  scroller: RefObject<HTMLElement | null>,
  count: number,
  rowHeight: number,
  overscan = 6
): { first: number; last: number } {
  const [view, setView] = useState({ top: 0, height: 600 })
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const update = () => setView({ top: el.scrollTop, height: el.clientHeight || 600 })
    update()
    el.addEventListener("scroll", update, { passive: true })
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update)
    resize?.observe(el)
    return () => {
      el.removeEventListener("scroll", update)
      resize?.disconnect()
    }
  }, [scroller])
  const first = Math.max(0, Math.floor(view.top / rowHeight) - overscan)
  const last = Math.min(count, Math.ceil((view.top + view.height) / rowHeight) + overscan)
  return { first, last }
}
