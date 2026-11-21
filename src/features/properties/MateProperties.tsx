import { useState } from "react"
import { Button } from "@/components/ui/button"
import { anchorOnPart } from "@/core/assembly/anchorNames"
import type { SnapRefusal } from "@/core/assembly/mateSnap"
import type { AnchorId, MateId, SceneDocument } from "@/core/schema"
import { useDocumentStore } from "@/store/document/documentStore"
import { useSessionStore } from "@/store/session/sessionStore"
import { FOCUSABLE_HEADING, mateHeadingId, rescueFocusTo } from "./inspectorFocus"
import { MateLimits } from "./MateLimits"
import { BindingsSection } from "./BindingsSection"
import { MateCouplings } from "./MateCouplings"
import { MateOptions } from "./MateOptions"
import { MateReading } from "./MateReading"
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
  // Strings and ids: re-rendered when a name changes, not on every part or anchor edit.
  const labelA = useDocumentStore((s) => (mate ? anchorOnPart(s.doc, mate.anchorA) : ""))
  const labelB = useDocumentStore((s) => (mate ? anchorOnPart(s.doc, mate.anchorB) : ""))
  const partA = useDocumentStore((s) =>
    mate && Object.hasOwn(s.doc.anchors, mate.anchorA)
      ? s.doc.anchors[mate.anchorA]?.partId
      : undefined
  )
  const update = useDocumentStore((s) => s.updateMate)
  const resnap = useDocumentStore((s) => s.resnapMate)
  const remove = useDocumentStore((s) => s.deleteMates)
  const select = useSessionStore((s) => s.select)
  // Why the last change could not snap, shown while the document is the one it left (an
  // undo or any other edit makes it stale).
  const [refusal, setRefusal] = useState<{ reason: SnapRefusal; doc: SceneDocument } | null>(null)
  const shown = useDocumentStore((s) => (refusal?.doc === s.doc ? refusal.reason : null))
  const report = (reason: SnapRefusal | null) =>
    setRefusal(reason && { reason, doc: useDocumentStore.getState().doc })
  if (!mate) return null
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
      <h3
        id={mateHeadingId(id)}
        tabIndex={-1}
        className={`text-xs font-semibold ${FOCUSABLE_HEADING}`}
      >
        Mate
      </h3>
      <div className="flex min-w-0 flex-col items-start text-xs">
        {link(mate.anchorA, labelA)}
        <span aria-hidden>→</span>
        {link(mate.anchorB, labelB)}
      </div>
      <div className="mt-1">
        <MateOptions value={mate} onChange={(patch) => report(update(id, patch))} />
      </div>
      <MateLimits mate={mate} onChange={(limits) => update(id, { limits })} />
      <MateReading mate={mate} />
      <MateCouplings id={id} />
      <BindingsSection entity={id} preset={{ from: { kind: "mateCoordinate", mate: id } }} />
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
        onChange={(suppressed) => report(update(id, { suppressed }))}
      />
      <MateStatus
        mate={mate}
        partId={partA}
        refusal={shown}
        onResnap={() => {
          report(resnap(id))
          rescueFocusTo(mateHeadingId(id)) // the button goes once the mate holds
        }}
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
