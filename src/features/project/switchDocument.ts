import type { SceneDocument } from "@/core/schema"
import type { ProjectDeps } from "./projectDeps"

/**
 * Replaces the open document (New, Open, Restore). History is cleared after the swap (the
 * order `history.clear` expects), session state that pointed into the old document goes,
 * and so does geometry nothing in the new one uses. `saved`: the file holds exactly `doc`.
 */
export function switchDocument(deps: ProjectDeps, doc: SceneDocument, saved: boolean): void {
  deps.tracker.expect(saved ? doc : null)
  deps.document.getState().replaceDocument(doc)
  deps.history.clear()
  deps.session.getState().resetForDocument()
  deps.retainAssets(new Set(Object.keys(doc.assets)))
  deps.fitAll()
}
