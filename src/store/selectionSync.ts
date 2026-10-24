import { pruneSelection } from "@/core/scene/selection"
import type { DocumentStore } from "./document/documentStore"
import type { SessionStore } from "./session/sessionStore"

/**
 * Keeps the session selection (and the Mate tool's picks) consistent with the document:
 * whenever the document changes (undo, redo, delete, open), items whose entity no longer
 * exists are dropped. Otherwise a stale id would keep Delete enabled, blank the inspector
 * and become a dangling parentId.
 * The View › Isolate set is pruned the same way; with none of its parts left, isolation ends
 * (an empty view with Isolate still checked would look broken). Returns the unsubscribe.
 */
export function connectSelectionPruning(document: DocumentStore, session: SessionStore) {
  return document.subscribe((state, previous) => {
    if (state.doc === previous.doc) return
    const { selection, select, mateDraft, setMateDraft } = session.getState()
    const pruned = pruneSelection(state.doc, selection)
    if (pruned !== selection) select(pruned)
    // The Mate tool's picks go too when an undo takes their anchors away.
    const has = (id: string | null) => id === null || Object.hasOwn(state.doc.anchors, id)
    if (mateDraft && !(has(mateDraft.anchorA) && has(mateDraft.anchorB))) setMateDraft(null)
    const { isolated } = session.getState()
    if (!isolated) return
    const kept = isolated.filter((id) => Object.hasOwn(state.doc.parts, id))
    if (kept.length !== isolated.length) session.setState({ isolated: kept.length ? kept : null })
  })
}
