import { useMemo } from "react"
import { anchorOnPart } from "@/core/assembly/anchorNames"
import { MAX_GLYPHS } from "@/core/assembly/glyphPlan"
import { LOOP_TEXT, REFUSAL_TEXT, mateTypeLabel } from "@/core/assembly/mateNames"
import { suggestedAnchors } from "@/core/assembly/suggestions"
import { partShown } from "@/core/scene/partShown"
import type { AnchorId, PartId } from "@/core/schema"
import { useDocumentStore } from "@/store/document/documentStore"
import { useSessionStore } from "@/store/session/sessionStore"
import { useMateDraftPlan } from "./useMateDraftPlan"

/**
 * What the Mate tool is doing, over the top of the 3D view (PLAN 8.2): which pick it waits
 * for, what fits the first one (as the glyphs show it: on parts the view draws, within the
 * glyph budget), what applying would do, and how to step back.
 */
export function MateToolHint() {
  const mating = useSessionStore((s) => s.activeTool === "mate")
  const isolated = useSessionStore((s) => s.isolated)
  const { draft, plan } = useMateDraftPlan()
  const anchors = useDocumentStore((s) => s.doc.anchors)
  const parts = useDocumentStore((s) => s.doc.parts)
  const fits = useMemo(() => {
    if (!draft || draft.anchorB) return 0
    const shown = isolated ? new Set<string>(isolated) : null
    const drawn = (id: PartId) => {
      const part = Object.hasOwn(parts, id) ? parts[id] : undefined
      return !!part && partShown(part, shown)
    }
    return suggestedAnchors(anchors, draft.anchorA, drawn).length
  }, [anchors, parts, draft, isolated])
  if (!mating) return null

  const named = (id: AnchorId) => anchorOnPart({ parts, anchors }, id)
  // The first pick and as many suggestions as the budget holds get glyphs (glyphPlan).
  const drawn = Math.min(fits, MAX_GLYPHS - 1)
  const fitText =
    fits === 0
      ? ""
      : drawn < fits
        ? ` (${fits} fit; ${drawn} drawn larger, in green)`
        : ` (${fits} fit: larger, in green)`
  let step = "Click an anchor (Place Anchor adds them)"
  if (draft && !draft.anchorB)
    step = `${named(draft.anchorA)} · Click an anchor on another part${fitText}`
  if (draft?.anchorB)
    step = `${mateTypeLabel(draft.type)}: ${named(draft.anchorA)} → ${named(draft.anchorB)} · Apply in the Properties panel (Ctrl+Enter)`
  // The New Mate panel's own status says this: shown here, announced once (there).
  let outcome: string | null = null
  if (plan && !plan.ok) outcome = REFUSAL_TEXT[plan.reason]
  else if (plan?.ok && plan.moved === "none") outcome = LOOP_TEXT
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
        </span>
        {outcome && <span aria-hidden> · {outcome}</span>}
        <span className="text-muted-foreground"> · Esc to go back</span>
      </p>
    </div>
  )
}
