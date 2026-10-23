import { useId } from "react"
import { Label } from "@/components/ui/label"
import { MAX_COORDINATE_MM, type Frame } from "@/core/schema"
import { NumberField } from "@/features/materials/controls/NumberField"

const AXES = ["X", "Y", "Z"] as const

const clamp = (typed: number) =>
  Number.isFinite(typed) ? Math.min(MAX_COORDINATE_MM, Math.max(-MAX_COORDINATE_MM, typed)) : null

/**
 * An anchor's origin in the part's own millimetres (PLAN 7.4 numeric offset): each typed edit
 * is one undo entry, live while typing, Escape reverts it.
 */
export function AnchorOriginFields({
  frame,
  onChange,
}: {
  frame: Frame
  onChange: (frame: Frame) => void
}) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1">
      <Label id={`${id}-label`} className="text-xs text-muted-foreground">
        Origin (mm, part coordinates)
      </Label>
      <div role="group" aria-labelledby={`${id}-label`} className="grid grid-cols-3 gap-1.5">
        {AXES.map((axis, i) => (
          <NumberField
            key={axis}
            id={`${id}-${axis}`}
            aria-label={`Origin ${axis} (mm)`}
            value={frame.originMm[i] ?? 0}
            clamp={clamp}
            onChange={(v) => {
              const originMm = [...frame.originMm] as Frame["originMm"]
              originMm[i] = v
              onChange({ ...frame, originMm })
            }}
          />
        ))}
      </div>
    </div>
  )
}
