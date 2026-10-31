import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { Connector, ConnectorId, MaterialId } from "@/core/schema"
import { NumberField } from "@/features/materials/controls/NumberField"
import type { ConnectorPatch } from "@/store/document/connectorActions"
import { useDocumentStore } from "@/store/document/documentStore"
import { NameField } from "./NameField"

const TITLES = { belt: "Belt", tube: "Tube", spring: "Spring" } as const

type Field = { key: keyof ConnectorPatch; label: string; value: number; min: number; max: number }

function fields(c: Connector): Field[] {
  if (c.kind === "belt")
    return [
      { key: "widthMm", label: "Width (mm)", value: c.widthMm, min: 0.1, max: 1000 },
      { key: "thicknessMm", label: "Thickness (mm)", value: c.thicknessMm, min: 0.1, max: 100 },
    ]
  if (c.kind === "tube")
    return [
      { key: "outerMm", label: "Outer diameter (mm)", value: c.outerMm, min: 0.1, max: 1000 },
      { key: "leadMm", label: "Straight out of each end (mm)", value: c.leadMm, min: 0, max: 1e5 },
    ]
  return [
    { key: "outerMm", label: "Outer diameter (mm)", value: c.outerMm, min: 0.1, max: 1000 },
    { key: "wireMm", label: "Wire (mm)", value: c.wireMm, min: 0.1, max: 100 },
    { key: "coils", label: "Coils", value: c.coils, min: 1, max: 500 },
  ]
}

/** A connector (PLAN 9.6): its sizes, material and Delete; drawn from its anchors. */
export function ConnectorProperties({ id }: { id: ConnectorId }) {
  const c = useDocumentStore((s) =>
    Object.hasOwn(s.doc.connectors, id) ? s.doc.connectors[id] : undefined
  )
  const materials = useDocumentStore((s) => s.doc.materials)
  const { updateConnector, deleteConnectors } = useDocumentStore.getState()
  if (!c) return null
  const number = (f: Field, value: number, onChange: (v: number) => void, label = f.label) => (
    <div key={`${f.key}-${label}`} className="grid grid-cols-[1fr_7rem] items-center gap-2 text-xs">
      <Label htmlFor={`connector-${id}-${label}`} className="font-normal text-muted-foreground">
        {label}
      </Label>
      <NumberField
        id={`connector-${id}-${label}`}
        value={Number(value.toFixed(4))}
        clamp={(v) => (Number.isFinite(v) ? Math.min(f.max, Math.max(f.min, v)) : null)}
        onChange={onChange}
      />
    </div>
  )
  return (
    <section className="flex flex-col gap-2" aria-label="Connector">
      <h3 className="text-xs font-semibold">{TITLES[c.kind]}</h3>
      <NameField
        id={`connector-name-${id}`}
        name={c.name}
        rename={(name) => updateConnector(id, { name })}
      />
      {fields(c).map((f) => number(f, f.value, (v) => updateConnector(id, { [f.key]: v })))}
      {c.kind === "belt" &&
        c.ends.map((e, i) =>
          number(
            { key: "radii", label: "", value: e.radiusMm, min: 0.1, max: 1e5 },
            e.radiusMm,
            (v) => updateConnector(id, { radii: c.ends.map((x, j) => (j === i ? v : x.radiusMm)) }),
            `Pulley ${i + 1} radius (mm)`
          )
        )}
      <div className="grid grid-cols-[1fr_7rem] items-center gap-2 text-xs">
        <Label htmlFor={`connector-material-${id}`} className="font-normal text-muted-foreground">
          Material
        </Label>
        <Select
          value={c.materialId ?? "none"}
          onValueChange={(v) =>
            updateConnector(id, { materialId: v === "none" ? null : (v as MaterialId) })
          }
        >
          <SelectTrigger id={`connector-material-${id}`} size="sm" className="h-7 w-full text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none" className="text-xs">
              Default
            </SelectItem>
            {Object.values(materials).map((m) => (
              <SelectItem key={m.id} value={m.id} className="text-xs">
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <p className="text-xs text-muted-foreground">
        Drawn between its anchors; it follows them, visual only (no collisions).
      </p>
      <div>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() => deleteConnectors([id])}
        >
          Delete
        </Button>
      </div>
    </section>
  )
}
