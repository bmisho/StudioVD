import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { parseSi } from "@/core/sim/siText"

/** A number typed with SI prefixes, kept as the number it parses to. */
export function NumberText({
  label,
  value,
  onChange,
}: {
  label: string
  value: unknown
  onChange: (v: number | undefined) => void
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <Label className="text-xs text-muted-foreground">
        {label}
        <Input
          defaultValue={typeof value === "number" ? String(value) : ""}
          onChange={(e) => {
            const v = parseSi(e.target.value)
            onChange(Number.isFinite(v) ? v : undefined)
          }}
          className="mt-0.5 h-7 text-xs tabular-nums"
        />
      </Label>
    </div>
  )
}
