import { useId, useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  PART_AXES,
  axisOf,
  moveAlong,
  pointAlong,
  quarterTurn,
  type PartAxis,
} from "@/core/assembly/anchorEdit"
import type { AnchorId, Frame } from "@/core/schema"
import { NumberField } from "@/features/materials/controls/NumberField"
import { startAnchorTarget } from "@/store/session/anchorTargetStore"
import { useSessionStore } from "@/store/session/sessionStore"

const small = "h-7 px-2 text-xs"
const clampStep = (typed: number) => (typed > 0 ? Math.min(typed, 1000) : null)

/**
 * Putting an anchor where it belongs (0.2.1): place it again by clicking its part (it keeps
 * its id, so its mates and cables stay on it), point it along a part axis, turn it a quarter
 * about its direction, or move it along that direction in steps. Each click is one undo entry;
 * the origin fields above take exact numbers.
 */
export function AnchorPlacementFields({
  id,
  frame,
  onChange,
}: {
  id: AnchorId
  frame: Frame
  onChange: (frame: Frame) => void
}) {
  const uid = useId()
  const [step, setStep] = useState(1)
  const testMode = useSessionStore((s) => s.testMode)
  const current = axisOf(frame)
  const move = (mm: number) => {
    const next = moveAlong(frame, mm)
    if (next) onChange(next)
  }
  return (
    <div className="flex flex-col gap-1.5">
      <Button
        variant="outline"
        size="sm"
        className={`${small} self-start aria-disabled:cursor-default aria-disabled:opacity-50`}
        aria-disabled={testMode || undefined}
        title={
          testMode
            ? "Leave test mode to place anchors"
            : "Click a face, edge, corner or hole of its part to put it there"
        }
        onClick={() => {
          if (!testMode) startAnchorTarget({ kind: "move", anchor: id })
        }}
      >
        Place again on the part…
      </Button>
      <span id={`${uid}-axes`} className="text-xs text-muted-foreground">
        Point along (part axes)
      </span>
      <div role="group" aria-labelledby={`${uid}-axes`} className="grid grid-cols-6 gap-1">
        {(Object.keys(PART_AXES) as PartAxis[]).map((axis) => (
          <Button
            key={axis}
            variant={current === axis ? "secondary" : "outline"}
            size="sm"
            className={`${small} tabular-nums`}
            aria-pressed={current === axis}
            aria-label={`Point along ${axis}`}
            onClick={() => onChange(pointAlong(frame, axis))}
          >
            {axis}
          </Button>
        ))}
      </div>
      <Label htmlFor={`${uid}-step`} className="text-xs text-muted-foreground">
        Move along its direction (mm)
      </Label>
      <div className="flex items-center gap-1">
        <NumberField
          id={`${uid}-step`}
          className="w-20"
          value={step}
          clamp={clampStep}
          onChange={setStep}
        />
        <Button variant="outline" size="sm" className={small} onClick={() => move(-step)}>
          In
        </Button>
        <Button variant="outline" size="sm" className={small} onClick={() => move(step)}>
          Out
        </Button>
        <Button
          variant="outline"
          size="sm"
          className={small}
          title="Turn it a quarter about its direction (its x goes where y was)"
          onClick={() => onChange(quarterTurn(frame))}
        >
          Turn 90°
        </Button>
      </div>
    </div>
  )
}
