import { useMemo } from "react"
import { planSnap, type SnapPlan } from "@/core/assembly/mateSnap"
import { useDocumentStore } from "@/store/document/documentStore"
import { useSessionStore, type MateDraft } from "@/store/session/sessionStore"

/**
 * The Mate tool's picks and, once both anchors are picked, how applying them would snap
 * (PLAN 8.2): what the preview draws, the hint says and Apply allows.
 */
export function useMateDraftPlan(): { draft: MateDraft | null; plan: SnapPlan | null } {
  const draft = useSessionStore((s) => (s.activeTool === "mate" ? s.mateDraft : null))
  const parts = useDocumentStore((s) => s.doc.parts)
  const anchors = useDocumentStore((s) => s.doc.anchors)
  const mates = useDocumentStore((s) => s.doc.mates)
  const plan = useMemo(
    () =>
      draft?.anchorB
        ? planSnap({ parts, anchors, mates }, { ...draft, anchorB: draft.anchorB })
        : null,
    [draft, parts, anchors, mates]
  )
  return { draft, plan }
}
