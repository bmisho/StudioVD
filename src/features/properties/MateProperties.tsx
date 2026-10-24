import { useState } from "react"
import { Button } from "@/components/ui/button"
import { anchorLabel } from "@/core/assembly/anchorNames"
import type { SnapRefusal } from "@/core/assembly/mateSnap"
import type { AnchorId, MateId } from "@/core/schema"
import { useDocumentStore } from "@/store/document/documentStore"
import { useSessionStore } from "@/store/session/sessionStore"
import { MateLimits } from "./MateLimits"
import { MateOptions } from "./MateOptions"
import { MateStatus } from "./MateStatus"
import { PropertyToggle } from "./PropertyToggle"

/**
 * Mate inspector (PLAN 8.5): its two anchors (each selects it), type, direction and angle
 * (a change snaps the free side again, one undo entry each), limits, contacts, suppressed,
 * what the assembly graph says about it, Snap again, Delete.
 */
export function MateProperties({ id }: { id: MateId }) {
  const mate = useDocumentStore((s) =>
    Object.hasOwn(s.doc.mates, id) ? s.doc.mates[id] : undefined
  )
  const anchors = useDocumentStore((s) => s.doc.anchors)
  const parts = useDocumentStore((s) => s.doc.parts)
  const update = useDocumentStore((s) => s.updateMate)
  const resnap = useDocumentStore((s) => s.resnapMate)
  const remove = useDocumentStore((s) => s.deleteMates)
  const select = useSessionStore((s) => s.select)
  const [refusal, setRefusal] = useState<SnapRefusal | null>(null)
  if (!mate) return null
  const end = (anchorId: AnchorId) => {
    const a = Object.hasOwn(anchors, anchorId) ? anchors[anchorId] : undefined
    const part = a && Object.hasOwn(parts, a.partId) ? parts[a.partId] : undefined
    return { label: a ? `${anchorLabel(a)} on ${part?.name ?? "a part"}` : "?", partId: a?.partId }
  }
  const [a, b] = [end(mate.anchorA), end(mate.anchorB)]
  const link = (anchorId: AnchorId, label: string) => (
    <Button
      variant="link"
      size="sm"
      className="h-auto min-w-0 shrink justify-start p-0 text-xs"
      title={`Show ${label}`}
      onClick={() => select([{ kind: "anchor", id: anchorId }])}
    >
      <span className="truncate">{label}</span>
    </Button>
  )

  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="text-xs font-semibold">Mate</h3>
      <div className="flex min-w-0 flex-col items-start text-xs">
        {link(mate.anchorA, a.label)}
        <span aria-hidden>→</span>
        {link(mate.anchorB, b.label)}
      </div>
      <div className="mt-1">
        <MateOptions value={mate} onChange={(patch) => setRefusal(update(id, patch))} />
      </div>
      <MateLimits mate={mate} onChange={(limits) => update(id, { limits })} />
      <PropertyToggle
        label="Contacts between its parts"
        hint="Off: its two parts pass through each other in test mode (usual at a joint)"
        checked={mate.contactsEnabled}
        onChange={(contactsEnabled) => update(id, { contactsEnabled })}
      />
      <PropertyToggle
        label="Suppressed"
        hint="A suppressed mate holds nothing; turning it back on snaps it again"
        checked={mate.suppressed}
        onChange={(suppressed) => setRefusal(update(id, { suppressed }))}
      />
      <MateStatus
        mate={mate}
        partId={a.partId}
        refusal={refusal}
        onResnap={() => setRefusal(resnap(id))}
      />
      <Button
        variant="outline"
        size="sm"
        // sky-50 keeps red text above 4.5:1 on hover (accent would not).
        className="mt-1 h-7 self-start text-xs text-destructive hover:bg-accent-subtle hover:text-destructive"
        onClick={() => remove([id])}
      >
        Delete mate
      </Button>
    </div>
  )
}
