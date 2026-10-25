import { useMemo } from "react"
import { planSnap, type SnapPlan } from "@/core/assembly/mateSnap"
import type { SceneDocument } from "@/core/schema"
import { useDocumentStore } from "@/store/document/documentStore"
import { useSessionStore, type MateDraft } from "@/store/session/sessionStore"

type Doc = Pick<SceneDocument, "parts" | "anchors" | "mates">

/** The last plan made: the preview, the hint and the New Mate panel share it. */
let shared: { draft: MateDraft; doc: Doc; plan: SnapPlan } | null = null

function planFor(draft: MateDraft, doc: Doc): SnapPlan | null {
  if (!draft.anchorB) return null
  const s = shared
  if (
    s?.draft === draft &&
    s.doc.parts === doc.parts &&
    s.doc.anchors === doc.anchors &&
    s.doc.mates === doc.mates
  )
    return s.plan
  const plan = planSnap(doc, { ...draft, anchorB: draft.anchorB })
  shared = { draft, doc, plan }
  return plan
}

/**
 * The Mate tool's picks and, once both anchors are picked, how applying them would snap
 * (PLAN 8.2): what the preview draws, the hint says and Apply allows. Planned once per
 * change of the picks or the document, however many components ask.
 */
export function useMateDraftPlan(): { draft: MateDraft | null; plan: SnapPlan | null } {
  const draft = useSessionStore((s) => (s.activeTool === "mate" ? s.mateDraft : null))
  const parts = useDocumentStore((s) => s.doc.parts)
  const anchors = useDocumentStore((s) => s.doc.anchors)
  const mates = useDocumentStore((s) => s.doc.mates)
  const plan = useMemo(
    () => (draft ? planFor(draft, { parts, anchors, mates }) : null),
    [draft, parts, anchors, mates]
  )
  return { draft, plan }
}
