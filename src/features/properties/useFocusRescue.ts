import { useEffect, useLayoutEffect, useRef, type RefObject } from "react"
import type { SelectionItem } from "@/store/session/sessionStore"
import { useSessionStore } from "@/store/session/sessionStore"

/**
 * Keeps keyboard focus in the inspector when a selection change takes away the control that
 * held it (a list row that selects an anchor, Delete on the selected item): without this,
 * focus falls to <body> and a keyboard user starts again from the top of the window. Focus
 * lands on `panel` itself (tabIndex -1); a more precise target can take it on the next frame.
 */
export function useFocusRescue(panel: RefObject<HTMLElement | null>, selection: SelectionItem[]) {
  const hadFocus = useRef(false)
  // Store listeners run when the selection is set, before React removes anything: the only
  // moment that still knows whether focus was in the panel.
  useEffect(
    () =>
      useSessionStore.subscribe((s, prev) => {
        if (s.selection === prev.selection) return
        const el = panel.current
        hadFocus.current ||= !!el && el.contains(document.activeElement)
      }),
    [panel]
  )
  useLayoutEffect(() => {
    if (!hadFocus.current) return
    hadFocus.current = false
    const el = panel.current
    const active = document.activeElement
    if (el && (!active || active === document.body || !active.isConnected)) el.focus()
  }, [panel, selection])
}
