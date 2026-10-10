import { pruneSelection } from "@/core/scene/selection"
import type { DocumentStore } from "./document/documentStore"
import type { SessionStore } from "./session/sessionStore"

/**
 * Keeps the session selection consistent with the document: whenever the document changes
 * (undo, redo, delete, open), items whose entity no longer exists are dropped. Otherwise a
 * stale id would keep Delete enabled, blank the inspector and become a dangling parentId.
 * Returns the unsubscribe function.
 */
export function connectSelectionPruning(document: DocumentStore, session: SessionStore) {
  return document.subscribe((state, previous) => {
    if (state.doc === previous.doc) return
    const { selection, select } = session.getState()
    const pruned = pruneSelection(state.doc, selection)
    if (pruned !== selection) select(pruned)
  })
}
