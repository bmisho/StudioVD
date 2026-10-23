import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { AnchorKind } from "@/core/schema"

const KINDS: { kind: AnchorKind; label: string }[] = [
  { kind: "point", label: "Point" },
  { kind: "planar", label: "Planar (a face)" },
  { kind: "axial", label: "Axial (an axis)" },
]

/** What an anchor stands for in a mate: a point, a face (z its normal) or an axis (z along it). */
export function AnchorKindSelect({
  id,
  value,
  onChange,
}: {
  id: string
  value: AnchorKind
  onChange: (kind: AnchorKind) => void
}) {
  return (
    <Select
      value={value}
      onValueChange={(v) => {
        const picked = KINDS.find((k) => k.kind === v)
        if (picked) onChange(picked.kind)
      }}
    >
      <SelectTrigger id={id} size="sm" className="w-full text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {KINDS.map((k) => (
          <SelectItem key={k.kind} value={k.kind} className="text-xs">
            {k.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
