import { Button } from "@/components/ui/button"
import { anchorLabel } from "@/core/assembly/anchorNames"
import { REFUSAL_TEXT } from "@/core/assembly/mateNames"
import type { AnchorId } from "@/core/schema"
import { applyMateDraft } from "@/features/assembly/mateTool"
import { useMateDraftPlan } from "@/features/assembly/useMateDraftPlan"
import { useDocumentStore } from "@/store/document/documentStore"
import { useSessionStore } from "@/store/session/sessionStore"
import { MateOptions } from "./MateOptions"

/**
 * The Mate tool's new mate, once both anchors are picked (PLAN 8.2): type, direction and
 * angle, previewed live in the 3D view; Apply adds it (one undo entry) and selects it,
 * Cancel drops the picks. Says what will move, or why it cannot.
 */
export function NewMateProperties() {
  const { draft, plan } = useMateDraftPlan()
  const setDraft = useSessionStore((s) => s.setMateDraft)
  const anchors = useDocumentStore((s) => s.doc.anchors)
  const parts = useDocumentStore((s) => s.doc.parts)
  if (!draft?.anchorB) return null
  const named = (id: AnchorId) => {
    const a = Object.hasOwn(anchors, id) ? anchors[id] : undefined
    const part = a && Object.hasOwn(parts, a.partId) ? parts[a.partId] : undefined
    return a ? `${anchorLabel(a)} on ${part?.name ?? "a part"}` : "?"
  }
  const moving = plan?.ok ? [...plan.poses.keys()].map((id) => parts[id]?.name ?? "?") : []
  let note: string
  if (!plan) note = ""
  else if (!plan.ok) note = REFUSAL_TEXT[plan.reason]
  else if (plan.moved === "none")
    note = "Its parts are already joined through other mates: nothing moves."
  else
    note = `Moves ${moving.slice(0, 3).join(", ")}${moving.length > 3 ? ` and ${moving.length - 3} more` : ""}.`
  const refused = !plan?.ok

  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="text-xs font-semibold">New Mate</h3>
      <p className="text-xs">{named(draft.anchorA)}</p>
      <p className="text-xs">→ {named(draft.anchorB)}</p>
      <div className="mt-1">
        <MateOptions value={draft} onChange={(patch) => setDraft({ ...draft, ...patch })} />
      </div>
      <p
        role="status"
        className={refused ? "text-xs text-destructive" : "text-xs text-muted-foreground"}
      >
        {note}
      </p>
      <div className="mt-1 flex gap-1.5">
        <Button
          size="sm"
          className="h-7 text-xs aria-disabled:cursor-default aria-disabled:opacity-50"
          aria-disabled={refused || undefined}
          onClick={() => {
            if (!refused) applyMateDraft()
          }}
        >
          Apply
        </Button>
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setDraft(null)}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
