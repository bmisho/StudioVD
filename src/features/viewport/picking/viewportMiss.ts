import { isPrimaryClick, selectionChangeForClick } from "@/core/scene/pickPolicy"
import { anchorAt } from "@/features/assembly/glyphs"
import { pickMateAnchor } from "@/features/assembly/mateTool"
import type { SelectionItem, SessionStore } from "@/store/session/sessionStore"
import { gizmoState } from "../gizmos/gizmoState"
import { applySelectionChange } from "./applySelectionChange"

/**
 * `<Canvas onPointerMissed>`: R3F calls it only when NOTHING interactive was hit and the
 * pointer moved <= 2 px. It also fires for `contextmenu` and `dblclick`; the policy keeps
 * only a plain primary click (Ctrl+click on empty space keeps the selection).
 */
export function createViewportMissHandler(session: SessionStore) {
  return (event: MouseEvent) => {
    if (gizmoState.ownsClick()) return // a click on a gizmo handle is not a click on empty space
    const tool = session.getState().activeTool
    if (tool === "anchor") return // Place Anchor: off a part, nothing
    if (tool === "mate") {
      // The Mate tool picks anchors over empty space too (a glyph sticks out past its part).
      if (isPrimaryClick(event, 0)) pickMateAnchor(event.clientX, event.clientY)
      return
    }
    // A glyph can stick out past its part: a click near an anchor's origin selects it.
    const anchor = anchorAt(event.clientX, event.clientY)
    applySelectionChange(
      session,
      selectionChangeForClick<SelectionItem>({
        type: event.type,
        button: event.button,
        delta: 0,
        additive: event.ctrlKey || event.metaKey,
        target: anchor ? { kind: "anchor", id: anchor } : null,
      })
    )
  }
}
