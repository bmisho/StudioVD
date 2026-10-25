import { useEffect, useLayoutEffect, useRef, type RefObject } from "react"
import { useSessionStore, type SessionState } from "@/store/session/sessionStore"

/** The Mate tool's second pick shows the new mate's options instead of the selection. */
export const showsNewMate = (s: SessionState) => s.activeTool === "mate" && !!s.mateDraft?.anchorB

/**
 * Keeps keyboard focus in the inspector when a change of what it shows (the selection, or the
 * New Mate panel coming or going) takes away the control that held it: a list row that
 * selects an anchor, Delete on the selected item, Cancel on the New Mate panel. Without this,
 * focus falls to <body> and a keyboard user starts again from the top of the window. Focus
 * lands on `panel` itself (tabIndex -1); a more precise target can take it on the next frame.
 */
export function useFocusRescue(panel: RefObject<HTMLElement | null>) {
  const selection = useSessionStore((s) => s.selection)
  const newMate = useSessionStore(showsNewMate)
  const hadFocus = useRef(false)
  // Store listeners run when the state is set, before React removes anything: the only
  // moment that still knows whether focus was in the panel. Only changes that re-run the
  // layout effect below count, so a flag set here is always used or cleared there.
  useEffect(
    () =>
      useSessionStore.subscribe((s, prev) => {
        if (s.selection === prev.selection && showsNewMate(s) === showsNewMate(prev)) return
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
  }, [panel, selection, newMate])
}
