import { mateDefaults } from "@/core/assembly/mateDefaults"
import { useDocumentStore } from "@/store/document/documentStore"
import type { AddMateResult } from "@/store/document/mateActions"
import { useSessionStore } from "@/store/session/sessionStore"
import { anchorAt } from "./glyphs"

/**
 * A primary click with the Mate tool (PLAN 8.2), on a part or over empty space: the anchor
 * under the cursor becomes the first pick (A), then the second (B, on another part), which
 * gives the new mate its defaults. Another anchor on A's part picks A again; with both
 * picked, a third anchor replaces B. Clicks never change the selection while mating.
 */
export function pickMateAnchor(clientX: number, clientY: number): void {
  const id = anchorAt(clientX, clientY)
  if (!id) return
  const { doc } = useDocumentStore.getState()
  const { mateDraft: draft, setMateDraft } = useSessionStore.getState()
  const anchor = Object.hasOwn(doc.anchors, id) ? doc.anchors[id] : undefined
  const first =
    draft && Object.hasOwn(doc.anchors, draft.anchorA) ? doc.anchors[draft.anchorA] : undefined
  if (!anchor) return
  if (!draft || !first || first.partId === anchor.partId) {
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
export function applyMateDraft(): AddMateResult | null {
  const { mateDraft: draft, setMateDraft, select } = useSessionStore.getState()
  if (!draft?.anchorB) return null
  const result = useDocumentStore.getState().addMate({ ...draft, anchorB: draft.anchorB })
  if (result.ok) {
    setMateDraft(null)
    select([{ kind: "mate", id: result.id }])
  }
  return result
}
