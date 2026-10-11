import { selectionChangeForClick } from "@/core/scene/pickPolicy"
import type { SelectionItem, SessionStore } from "@/store/session/sessionStore"
import { applySelectionChange } from "./applySelectionChange"

/**
 * `<Canvas onPointerMissed>`: R3F calls it only when NOTHING interactive was hit and the
 * pointer moved <= 2 px. It also fires for `contextmenu` and `dblclick`; the policy keeps
 * only a plain primary click (Ctrl+click on empty space keeps the selection).
 */
export function createViewportMissHandler(session: SessionStore) {
  return (event: MouseEvent) =>
    applySelectionChange(
      session,
      selectionChangeForClick<SelectionItem>({
        type: event.type,
        button: event.button,
        delta: 0,
        additive: event.ctrlKey || event.metaKey,
        target: null,
      })
    )
}
