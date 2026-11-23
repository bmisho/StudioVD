import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { Cable } from "@/core/connectors/cableMesh"
import { WIRE_COLOURS, WIRE_GAUGES } from "@/core/connectors/wireSpecs"
import { cn } from "@/lib/utils"
import { useDocumentStore } from "@/store/document/documentStore"

/**
 * A cable's wire colour (swatches: each colour's PVC material, made once and reused) and a
 * hook-up wire gauge that sets its diameter (PLAN 16.3; sizes in `wireSpecs.ts`, sourced).
 */
export function CableLook({ cable: c }: { cable: Cable }) {
  const material = useDocumentStore((s) =>
    c.materialId && Object.hasOwn(s.doc.materials, c.materialId)
      ? s.doc.materials[c.materialId]
      : undefined
  )
  const gauge = WIRE_GAUGES.find((g) => Math.abs(g.outerMm - c.outerMm) < 0.005)
  return (
    <>
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground" id={`cable-${c.id}-colours`}>
          Wire colour
        </span>
        <div
          className="flex flex-wrap gap-1"
          role="group"
          aria-labelledby={`cable-${c.id}-colours`}
        >
          {WIRE_COLOURS.map((w) => {
            const current = material?.color === w.color && material.name.startsWith("Wire (")
            return (
              <button
                key={w.key}
                type="button"
                aria-label={w.name}
                aria-pressed={current}
                title={w.name}
                className={cn(
                  "size-6 rounded-sm border border-input focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  current && "ring-2 ring-ring"
                )}
                // The swatch shows the wire's colour itself (data, not a theme colour).
                style={{ backgroundColor: w.color }}
                onClick={() => useDocumentStore.getState().setCableColour(c.id, w.key)}
              />
            )
          })}
        </div>
      </div>
      <div className="grid grid-cols-[1fr_7rem] items-center gap-2 text-xs">
        <Label htmlFor={`cable-${c.id}-gauge`} className="font-normal text-muted-foreground">
          Hook-up wire size
        </Label>
        <Select
          value={gauge ? String(gauge.awg) : "custom"}
          onValueChange={(v) => {
            const g = WIRE_GAUGES.find((x) => String(x.awg) === v)
            if (g) useDocumentStore.getState().updateConnector(c.id, { outerMm: g.outerMm })
          }}
        >
          <SelectTrigger id={`cable-${c.id}-gauge`} size="sm" className="h-7 w-full text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="custom" className="text-xs" disabled>
              Custom
            </SelectItem>
            {WIRE_GAUGES.map((g) => (
              <SelectItem key={g.awg} value={String(g.awg)} className="text-xs">
                {g.awg} AWG (Ø{g.outerMm} mm)
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </>
  )
}
