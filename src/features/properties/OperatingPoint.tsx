import { useShallow } from "zustand/react/shallow"
import type { BlockDef, NodeId } from "@/core/schema"
import { quantity } from "@/core/sim/format"
import { portText } from "@/features/simulation/readouts"
import { useSimulationStore } from "@/store/session/simulationStore"
import { PropertyField } from "./PropertyField"

/** A block's operating point from the last solve (PLAN 12.9): every port, and its power. */
export function OperatingPoint({ id, def }: { id: NodeId; def: BlockDef }) {
  const rows = useSimulationStore(
    useShallow((s) => def.ports.map((p) => portText(s.result, id, p) ?? "—"))
  )
  const power = useSimulationStore((s) => s.result?.power[id])
  const solved = useSimulationStore((s) => s.result !== null)
  if (!solved) return null
  return (
    <section aria-label="Operating point" className="flex flex-col gap-1">
      <h3 className="text-xs font-medium text-muted-foreground">Operating point</h3>
      {def.ports.map((p, i) => (
        <PropertyField key={p.key} label={p.name} value={rows[i] ?? "—"} />
      ))}
      {power !== undefined && <PropertyField label="Power taken" value={quantity(power, "W")} />}
    </section>
  )
}
