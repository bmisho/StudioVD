import { useId, useRef } from "react"
import { Label } from "@/components/ui/label"
import { withLimit, type MateLimitRange } from "@/core/assembly/mateLimits"
import type { Mate } from "@/core/schema"
import { degToRad, radToDeg } from "@/core/units"
import { NumberField } from "@/features/materials/controls/NumberField"
import { PropertyToggle } from "./PropertyToggle"

/**
 * How far a revolute mate may turn (degrees; radians in the document) or a prismatic one
 * slide (mm), from where it was snapped (PLAN 8.1); test mode keeps to them (Phase 10).
 * Other types have no limits. A min past the max moves the max along, from the limits as they
 * were when the field took focus: values typed on the way move the other end only meanwhile.
 */
export function MateLimits({
  mate,
  onChange,
}: {
  mate: Mate
  onChange: (limits: { min: number; max: number } | null) => void
}) {
  const id = useId()
  const atFocus = useRef<MateLimitRange | null>(null)
  if (mate.type !== "revolute" && mate.type !== "prismatic") return null
  const turns = mate.type === "revolute"
  const [toUi, fromUi] = turns ? [radToDeg, degToRad] : [(v: number) => v, (v: number) => v]
  const bound = turns ? 360 : 1e6
  const clamp = (v: number) => (Number.isFinite(v) ? Math.max(-bound, Math.min(bound, v)) : null)
  const limits = mate.limits
  const unit = turns ? "°" : "mm"
  return (
    <div className="flex flex-col gap-1.5">
      <PropertyToggle
        label="Limits"
        hint={turns ? "How far it may turn either way" : "How far it may slide either way"}
        checked={!!limits}
        onChange={(on) =>
          onChange(on ? { min: fromUi(turns ? -90 : -10), max: fromUi(turns ? 90 : 10) } : null)
        }
      />
      {limits && (
        <div
          role="group"
          aria-labelledby={`${id}-label`}
          className="grid grid-cols-2 gap-1.5"
          onFocus={() => (atFocus.current = limits)}
        >
          <Label id={`${id}-label`} className="sr-only">
            Limits ({unit})
          </Label>
          {(["min", "max"] as const).map((end) => (
            <NumberField
              key={end}
              id={`${id}-${end}`}
              aria-label={`${end === "min" ? "Minimum" : "Maximum"} (${unit})`}
              value={Number(toUi(limits[end]).toFixed(6))}
              clamp={clamp}
              onChange={(v) => onChange(withLimit(atFocus.current ?? limits, end, fromUi(v)))}
            />
          ))}
        </div>
      )}
    </div>
  )
}
