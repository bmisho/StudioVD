import type { SelectionChange } from "@/core/scene/pickPolicy"
import type { SelectionItem, SessionStore } from "@/store/session/sessionStore"

/** Applies a viewport click decision to the session selection (same actions as the tree). */
export function applySelectionChange(
  session: SessionStore,
  change: SelectionChange<SelectionItem>
): void {
  const s = session.getState()
  switch (change.type) {
    case "replace":
      s.select([change.item])
      return
    case "toggle":
      s.toggleSelected(change.item)
      return
    case "clear":
      if (s.selection.length > 0) s.clearSelection()
      return
    case "none":
      return
  }
}
