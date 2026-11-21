import { useId } from "react"
import { Label } from "@/components/ui/label"
import { NumberField } from "@/features/materials/controls/NumberField"
import { useDocumentStore } from "@/store/document/documentStore"

const AXES = ["X", "Y", "Z"] as const

/** The solver's settings in the project (PLAN 12.6): gravity, m/s² along the world axes. */
export function SimulationSettings() {
  const id = useId()
  const gravity = useDocumentStore((s) => s.doc.simulation.gravity)
  const setGravity = useDocumentStore((s) => s.setGravity)
  return (
    <section aria-label="Simulation" className="flex flex-col gap-1.5">
      <h3 className="text-xs font-semibold">Simulation</h3>
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">
        Gravity in m/s² (Y is up; Earth is 9.81 down). It loads joints through the schematic.
      </p>
      <div className="grid grid-cols-3 gap-1">
        {AXES.map((axis, i) => (
          <div key={axis} className="flex flex-col gap-0.5">
            <Label htmlFor={`${id}-${axis}`} className="text-xs text-muted-foreground">
              {axis}
            </Label>
            <NumberField
              id={`${id}-${axis}`}
              value={gravity[i] ?? 0}
              clamp={(v) => (Number.isFinite(v) && Math.abs(v) <= 1000 ? v : null)}
              onChange={(v) =>
                setGravity(gravity.map((g, j) => (j === i ? v : g)) as [number, number, number])
              }
              aria-describedby={`${id}-hint`}
            />
          </div>
        ))}
      </div>
    </section>
  )
}
