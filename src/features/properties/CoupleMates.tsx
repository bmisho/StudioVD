import { useId, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { couplingKinds, suggestRatio, type CouplingKind } from "@/core/physics/couplingRatio"
import type { MateId } from "@/core/schema"
import { useDocumentStore } from "@/store/document/documentStore"
import { useSessionStore } from "@/store/session/sessionStore"
import { COUPLING_TEXT, ratioClamp } from "./couplingText"

const fmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 })

/**
 * With two mates selected (PLAN 10.5): couple them so they move together in test mode, as
 * a gear pair (two hinges) or a hinge driving a slide (rack and pinion, lead screw). The
 * ratio starts from the parts (gear teeth, screw lead) and can be typed over.
 */
export function CoupleMates({ mates }: { mates: readonly [MateId, MateId] }) {
  const id = useId()
  // Each mate on its own (a selector building a pair would be a new object every read).
  const x = useDocumentStore((s) =>
    Object.hasOwn(s.doc.mates, mates[0]) ? s.doc.mates[mates[0]] : undefined
  )
  const y = useDocumentStore((s) =>
    Object.hasOwn(s.doc.mates, mates[1]) ? s.doc.mates[mates[1]] : undefined
  )
  // A hinge driving a slide: the hinge is A.
  const pair =
    !x || !y
      ? null
      : y.type === "revolute" && x.type === "prismatic"
        ? ([y, x] as const)
        : ([x, y] as const)
  const kinds = pair ? couplingKinds(pair[0].type, pair[1].type) : []
  const [kind, setKind] = useState<CouplingKind | null>(null)
  const chosen = kind && kinds.includes(kind) ? kind : kinds[0]
  const suggested = useDocumentStore((s) =>
    pair && chosen ? suggestRatio(s.doc, chosen, pair[0], pair[1]) : 1
  )
  const [typed, setTyped] = useState("")
  if (!pair) return null
  if (!chosen)
    return (
      <p className="text-xs text-muted-foreground">
        Couple two hinges (gears), or a hinge and a slider (rack and pinion, lead screw).
      </p>
    )
  const ratio = typed === "" ? suggested : ratioClamp(Number(typed))
  const couple = () => {
    if (ratio === null) return
    const made = useDocumentStore.getState().addCoupling(chosen, pair[0].id, pair[1].id, ratio)
    if (made) useSessionStore.getState().select([{ kind: "mate", id: pair[0].id }])
  }
  return (
    <section aria-label="Couple mates" className="flex flex-col gap-1.5 text-xs">
      <h3 className="font-semibold">Couple these mates</h3>
      <div className="flex gap-1" role="radiogroup" aria-label="Coupling">
        {kinds.map((k) => (
          <Button
            key={k}
            role="radio"
            aria-checked={k === chosen}
            variant={k === chosen ? "secondary" : "outline"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => {
              setKind(k)
              setTyped("")
            }}
          >
            {COUPLING_TEXT[k].label}
          </Button>
        ))}
      </div>
      <Label htmlFor={id} className="text-xs">
        Ratio ({COUPLING_TEXT[chosen].unit})
      </Label>
      <Input
        id={id}
        inputMode="decimal"
        className="h-7 text-xs tabular-nums"
        placeholder={fmt.format(suggested)}
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
      />
      <p className="text-muted-foreground">
        {COUPLING_TEXT[chosen].hint}. From the parts: {fmt.format(suggested)}.
      </p>
      <Button
        size="sm"
        className="h-7 self-start text-xs"
        disabled={ratio === null}
        onClick={couple}
      >
        Couple
      </Button>
    </section>
  )
}
