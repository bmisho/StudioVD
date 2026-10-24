import { useId } from "react"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { MATE_TYPES } from "@/core/assembly/mateNames"
import type { MateType } from "@/core/schema"
import { degToRad, radToDeg } from "@/core/units"
import { NumberField } from "@/features/materials/controls/NumberField"

export interface MateOptionValues {
  type: MateType
  flip: boolean
  angleOffsetRad: number
}

const clampDeg = (typed: number) =>
  Number.isFinite(typed) ? Math.max(-360, Math.min(360, typed)) : null

/**
 * A mate's type, direction and angle (PLAN 8.1), for the Mate tool's new mate and the mate
 * inspector. Direction: B's anchor z along A's (aligned) or against it (opposed, face to
 * face). Angle: B's twist about A's z, in degrees (radians in the document).
 */
export function MateOptions({
  value,
  onChange,
}: {
  value: MateOptionValues
  onChange: (patch: Partial<MateOptionValues>) => void
}) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`${id}-type`} className="text-xs text-muted-foreground">
        Type
      </Label>
      <Select
        value={value.type}
        onValueChange={(v) => {
          const picked = MATE_TYPES.find((t) => t.type === v)
          if (picked) onChange({ type: picked.type })
        }}
      >
        <SelectTrigger id={`${id}-type`} size="sm" className="w-full text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {MATE_TYPES.map((t) => (
            <SelectItem key={t.type} value={t.type} className="text-xs">
              {t.label}: {t.hint.toLowerCase()}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Label htmlFor={`${id}-dir`} className="mt-1 text-xs text-muted-foreground">
        Direction
      </Label>
      <Select
        value={value.flip ? "opposed" : "aligned"}
        onValueChange={(v) => onChange({ flip: v === "opposed" })}
      >
        <SelectTrigger id={`${id}-dir`} size="sm" className="w-full text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="opposed" className="text-xs">
            Opposed (face to face)
          </SelectItem>
          <SelectItem value="aligned" className="text-xs">
            Aligned (same way)
          </SelectItem>
        </SelectContent>
      </Select>
      <Label htmlFor={`${id}-angle`} className="mt-1 text-xs text-muted-foreground">
        Angle (°, about the axis)
      </Label>
      <NumberField
        id={`${id}-angle`}
        value={Number(radToDeg(value.angleOffsetRad).toFixed(6))}
        clamp={clampDeg}
        onChange={(deg) => onChange({ angleOffsetRad: degToRad(deg) })}
      />
    </div>
  )
}
