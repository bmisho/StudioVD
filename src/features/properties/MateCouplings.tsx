import { Button } from "@/components/ui/button"
import { mateTypeLabel } from "@/core/assembly/mateNames"
import { couplingKinds, otherMate } from "@/core/physics/couplingRatio"
import type { Coupling, MateId } from "@/core/schema"
import { NumberField } from "@/features/materials/controls/NumberField"
import { useDocumentStore } from "@/store/document/documentStore"
import { useSessionStore } from "@/store/session/sessionStore"
import { COUPLING_TEXT, ratioClamp } from "./couplingText"

function Row({ coupling: c, mateId }: { coupling: Coupling; mateId: MateId }) {
  const other = useDocumentStore((s) => s.doc.mates[otherMate(c, mateId) as MateId])
  const fits = useDocumentStore((s) => {
    const [a, b] = [s.doc.mates[c.mateA], s.doc.mates[c.mateB]]
    return !!a && !!b && couplingKinds(a.type, b.type).includes(c.kind)
  })
  const { setCouplingRatio, deleteCouplings } = useDocumentStore.getState()
  const text = COUPLING_TEXT[c.kind]
  return (
    <li className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="link"
          size="sm"
          className="h-auto min-w-0 justify-start p-0 text-xs"
          onClick={() =>
            other && useSessionStore.getState().select([{ kind: "mate", id: other.id }])
          }
        >
          <span className="truncate">
            {text.label} with the {other ? mateTypeLabel(other.type).toLowerCase() : "?"} mate
          </span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-1.5 text-xs"
          onClick={() => deleteCouplings([c.id])}
        >
          Remove
        </Button>
      </div>
      <div className="flex items-center gap-1">
        <NumberField
          id={`coupling-${c.id}`}
          aria-label={`Ratio, ${text.unit}`}
          value={c.ratio}
          clamp={ratioClamp}
          onChange={(r) => setCouplingRatio(c.id, r)}
          className="h-7 w-24"
        />
        <span className="text-muted-foreground">{text.unit}</span>
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2 text-xs"
          title="The other way round"
          onClick={() => setCouplingRatio(c.id, -c.ratio)}
        >
          Reverse
        </Button>
      </div>
      {!fits && (
        <p className="text-xs text-warning">Its mates' types no longer fit: it does nothing now.</p>
      )}
    </li>
  )
}

/** A mate's couplings (PLAN 10.5): ratio, reverse, remove. */
export function MateCouplings({ id }: { id: MateId }) {
  const couplings = useDocumentStore((s) => s.doc.couplings)
  const mine = Object.values(couplings).filter((c) => c.mateA === id || c.mateB === id)
  if (mine.length === 0) return null
  return (
    <section aria-label="Couplings" className="flex flex-col gap-1.5 text-xs">
      <h4 className="font-semibold">Coupled</h4>
      <ul className="flex flex-col gap-2">
        {mine.map((c) => (
          <Row key={c.id} coupling={c} mateId={id} />
        ))}
      </ul>
    </section>
  )
}
