import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { anchorOnPart } from "@/core/assembly/anchorNames"
import { ADD_REFUSAL_TEXT, LOOP_TEXT, REFUSAL_TEXT } from "@/core/assembly/mateNames"
import { COLLECTION_CAPS, type PartId } from "@/core/schema"
import { applyMateDraft } from "@/features/assembly/mateTool"
import { useMateDraftPlan } from "@/features/assembly/useMateDraftPlan"
import { useDocumentStore } from "@/store/document/documentStore"
import type { AddMateResult } from "@/store/document/mateActions"
import { useSessionStore, type MateDraft } from "@/store/session/sessionStore"
import { MateOptions } from "./MateOptions"

type AddRefusal = Extract<AddMateResult, { ok: false }>["reason"]

/**
 * The Mate tool's new mate, once both anchors are picked (PLAN 8.2): type, direction and
 * angle, previewed live in the 3D view; Apply adds it (one undo entry) and selects it,
 * Cancel drops the picks. Says what will move, or why it cannot (a full project included).
 */
export function NewMateProperties() {
  const { draft, plan } = useMateDraftPlan()
  const setDraft = useSessionStore((s) => s.setMateDraft)
  const anchors = useDocumentStore((s) => s.doc.anchors)
  const parts = useDocumentStore((s) => s.doc.parts)
  const mates = useDocumentStore((s) => s.doc.mates)
  const full = useMemo(() => Object.keys(mates).length >= COLLECTION_CAPS.mates, [mates])
  // Why Apply failed, for as long as the picks are the ones it was given.
  const [failed, setFailed] = useState<{ reason: AddRefusal; draft: MateDraft } | null>(null)
  if (!draft?.anchorB) return null
  const nameOf = (id: PartId) => (Object.hasOwn(parts, id) ? parts[id]?.name : undefined) ?? "?"
  const moving = plan?.ok ? [...plan.poses.keys()].map(nameOf) : []
  const failure = failed?.draft === draft ? failed.reason : full ? "full" : null
  let note: string
  if (failure === "full" || failure === "invalid") note = ADD_REFUSAL_TEXT[failure]
  else if (failure) note = REFUSAL_TEXT[failure]
  else if (!plan) note = ""
  else if (!plan.ok) note = REFUSAL_TEXT[plan.reason]
  else if (plan.moved === "none") note = LOOP_TEXT
  else
    note = `Moves ${moving.slice(0, 3).join(", ")}${moving.length > 3 ? ` and ${moving.length - 3} more` : ""}.`
  const refused = !plan?.ok || failure !== null

  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="text-xs font-semibold">New Mate</h3>
      <p className="text-xs">{anchorOnPart({ parts, anchors }, draft.anchorA)}</p>
      <p className="text-xs">→ {anchorOnPart({ parts, anchors }, draft.anchorB)}</p>
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
            if (refused) return
            const result = applyMateDraft()
            if (result && !result.ok) setFailed({ reason: result.reason, draft })
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
