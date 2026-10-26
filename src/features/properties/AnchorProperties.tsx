import { useId } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { anchorLabel } from "@/core/assembly/anchorNames"
import type { AnchorId, AnchorSource, PartId } from "@/core/schema"
import { useDocumentStore } from "@/store/document/documentStore"
import { useSessionStore } from "@/store/session/sessionStore"
import { AnchorKindSelect } from "./AnchorKindSelect"
import { AnchorOriginFields } from "./AnchorOriginFields"
import { NameField } from "./NameField"
import { PropertyField } from "./PropertyField"
import { FOCUSABLE_HEADING, anchorHeadingId, focusAnchorList } from "./inspectorFocus"

const unit = new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 })
const SOURCE: Record<AnchorSource["kind"], string> = {
  face: "Snapped to a face of the part",
  vertex: "Snapped to a corner of the part",
  manual: "Placed by hand",
  component: "Part of a library component",
}

/**
 * Anchor inspector (PLAN 7.4): name, kind, interface tag, origin, direction (flip) and what it
 * was snapped to; Delete removes it with the mates on it and shows its part again, as does the
 * part's name (back to its anchor list).
 */
export function AnchorProperties({ id }: { id: AnchorId }) {
  const kindId = useId()
  const anchor = useDocumentStore((s) =>
    Object.hasOwn(s.doc.anchors, id) ? s.doc.anchors[id] : undefined
  )
  const partName = useDocumentStore((s) => (anchor ? s.doc.parts[anchor.partId]?.name : undefined))
  const update = useDocumentStore((s) => s.updateAnchor)
  const flip = useDocumentStore((s) => s.flipAnchor)
  const remove = useDocumentStore((s) => s.deleteAnchors)
  const select = useSessionStore((s) => s.select)
  if (!anchor) return null
  const showPart = (partId: PartId) => {
    select([{ kind: "part", id: partId }])
    focusAnchorList(partId)
  }

  return (
    <div className="flex flex-col gap-1.5">
      <h3
        id={anchorHeadingId(id)}
        tabIndex={-1}
        className={`text-xs font-semibold ${FOCUSABLE_HEADING}`}
      >
        Anchor
      </h3>
      <p className="flex min-w-0 items-baseline gap-1 text-xs text-muted-foreground">
        On
        <Button
          variant="link"
          size="sm"
          className="h-auto min-w-0 shrink p-0 text-xs"
          title={`Show ${partName ?? "the part"}`}
          onClick={() => showPart(anchor.partId)}
        >
          <span className="truncate">{partName ?? "a part"}</span>
        </Button>
      </p>
      <NameField
        id={`anchor-name-${id}`}
        name={anchor.name ?? ""}
        placeholder={anchorLabel({ kind: anchor.kind })}
        rename={(name) => update(id, { name })}
      />
      <Label htmlFor={kindId} className="mt-1 text-xs text-muted-foreground">
        Kind
      </Label>
      <AnchorKindSelect id={kindId} value={anchor.kind} onChange={(kind) => update(id, { kind })} />
      <NameField
        id={`anchor-interface-${id}`}
        label="Interface tag"
        maxLength={64}
        placeholder="e.g. shaft-8mm"
        name={anchor.interface ?? ""}
        rename={(tag) => update(id, { interface: tag })}
      />
      <div className="mt-1">
        <AnchorOriginFields frame={anchor.frame} onChange={(frame) => update(id, { frame })} />
      </div>
      <PropertyField
        label="Direction (z)"
        value={anchor.frame.z.map((v) => unit.format(v)).join(", ")}
      />
      <p className="text-xs text-muted-foreground">{SOURCE[anchor.source.kind]}</p>
      <div className="mt-1 flex flex-wrap gap-1.5">
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          title="Reverse the direction (z); x stays"
          onClick={() => flip(id)}
        >
          Flip direction
        </Button>
        <Button
          variant="outline"
          size="sm"
          // sky-50 keeps red text above 4.5:1 on hover (accent would not).
          className="h-7 text-xs text-destructive hover:bg-accent-subtle hover:text-destructive"
          onClick={() => {
            const partId = anchor.partId
            remove([id])
            // The button goes with the anchor: show its part, focus on its remaining anchors.
            showPart(partId)
          }}
        >
          Delete anchor
        </Button>
      </div>
    </div>
  )
}
