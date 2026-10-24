import { useMemo } from "react"
import { anchorLabel } from "@/core/assembly/anchorNames"
import { tagsFit } from "@/core/assembly/interfaceTags"
import { REFUSAL_TEXT, mateTypeLabel } from "@/core/assembly/mateNames"
import type { AnchorId } from "@/core/schema"
import { useDocumentStore } from "@/store/document/documentStore"
import { useSessionStore } from "@/store/session/sessionStore"
import { useMateDraftPlan } from "./useMateDraftPlan"

/**
 * What the Mate tool is doing, over the top of the 3D view (PLAN 8.2): which pick it waits
 * for, what fits the first one, what applying would do, and how to step back.
 */
export function MateToolHint() {
  const mating = useSessionStore((s) => s.activeTool === "mate")
  const { draft, plan } = useMateDraftPlan()
  const anchors = useDocumentStore((s) => s.doc.anchors)
  const parts = useDocumentStore((s) => s.doc.parts)
  const named = (id: AnchorId | null | undefined) => {
    const a = id && Object.hasOwn(anchors, id) ? anchors[id] : undefined
    const part = a && Object.hasOwn(parts, a.partId) ? parts[a.partId] : undefined
    return a ? `${anchorLabel(a)} on ${part?.name ?? "a part"}` : ""
  }
  const fits = useMemo(() => {
    const first =
      draft && Object.hasOwn(anchors, draft.anchorA) ? anchors[draft.anchorA] : undefined
    if (!first?.interface || draft?.anchorB) return 0
    return Object.values(anchors).filter(
      (a) => a.partId !== first.partId && tagsFit(first.interface, a.interface)
    ).length
  }, [anchors, draft])
  if (!mating) return null

  let step = "Click an anchor (Place Anchor adds them)"
  if (draft && !draft.anchorB)
    step = `${named(draft.anchorA)} · Click an anchor on another part${fits ? ` (${fits} fit, in green)` : ""}`
  if (draft?.anchorB)
    step = `${mateTypeLabel(draft.type)}: ${named(draft.anchorA)} → ${named(draft.anchorB)}`
  let note = draft?.anchorB ? "Apply in the Properties panel" : null
  if (plan && !plan.ok) note = REFUSAL_TEXT[plan.reason]
  else if (plan?.ok && plan.moved === "none")
    note = "Already joined through other mates: nothing moves"
  return (
    <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-center px-2">
      <p
        role="status"
        className="max-w-full rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground shadow-sm"
      >
        <span className="font-medium">Mate</span>
        {/* Each step is a change worth announcing (unlike Place Anchor's live snap). */}
        <span>
          {" · "}
          {step}
          {note && ` · ${note}`}
        </span>
        <span className="text-muted-foreground"> · Esc to go back</span>
      </p>
    </div>
  )
}
