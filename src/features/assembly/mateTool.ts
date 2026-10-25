import { mateDefaults } from "@/core/assembly/mateDefaults"
import type { AnchorId } from "@/core/schema"
import { useDocumentStore, type DocumentStore } from "@/store/document/documentStore"
import type { AddMateResult } from "@/store/document/mateActions"
import { useSessionStore, type SessionStore } from "@/store/session/sessionStore"
import { anchorAt } from "./glyphs"

/**
 * A primary click with the Mate tool (PLAN 8.2), on a part or over empty space: the anchor
 * under the cursor becomes the first pick (A), then the second (B, on another part), which
 * gives the new mate its defaults. Once A is picked, an anchor on another part wins over A's
 * own where both are drawn (a pin already in its hole). Another anchor on A's part picks A
 * again; with both picked, a third anchor replaces B, and A or B themselves change nothing
 * (the options set for them stay). Clicks never change the selection while mating.
 */
export function pickMateAnchor(clientX: number, clientY: number): void {
  const { doc } = useDocumentStore.getState()
  const { mateDraft: draft, setMateDraft } = useSessionStore.getState()
  const partOf = (id: AnchorId) =>
    Object.hasOwn(doc.anchors, id) ? doc.anchors[id]?.partId : undefined
  const firstPart = draft ? partOf(draft.anchorA) : undefined
  const id =
    (firstPart && anchorAt(clientX, clientY, (a) => partOf(a) !== firstPart)) ??
    anchorAt(clientX, clientY)
  const part = id && partOf(id)
  if (!id || !part) return
  if (draft?.anchorB && (id === draft.anchorA || id === draft.anchorB)) return
  if (!draft || !firstPart || firstPart === part) {
    setMateDraft({ anchorA: id, anchorB: null, type: "revolute", flip: false, angleOffsetRad: 0 })
    return
  }
  const defaults = mateDefaults(doc, draft.anchorA, id)
  if (defaults) setMateDraft({ ...draft, anchorB: id, ...defaults })
}

/**
 * Adds the mate the tool has set up (one undo entry, the free side snapped onto it) and
 * selects it; the tool stays on for the next one. Null when nothing is set up yet.
 */
export function applyMateDraft(
  document: DocumentStore = useDocumentStore,
  session: SessionStore = useSessionStore
): AddMateResult | null {
  const { mateDraft: draft, setMateDraft, select } = session.getState()
  if (!draft?.anchorB) return null
  const result = document.getState().addMate({ ...draft, anchorB: draft.anchorB })
  if (result.ok) {
    setMateDraft(null)
    select([{ kind: "mate", id: result.id }])
  }
  return result
}
