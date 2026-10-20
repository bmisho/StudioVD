import { useId } from "react"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  DENSITY_FIELD,
  GLASS_FIELDS,
  SURFACE_FIELDS,
  type MaterialField,
} from "@/core/materials/materialFields"
import type { Material } from "@/core/schema"
import { useDocumentStore } from "@/store/document/documentStore"
import type { MaterialPatch } from "@/store/document/materialActions"
import { ColorField } from "./controls/ColorField"
import { MaterialSlider } from "./controls/MaterialSlider"

const GLASS_HINT = "Clear and refracting (transmission). Glass ignores opacity."

function GlassToggle({
  checked,
  onChange,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  const id = useId()
  return (
    <div className="flex items-center justify-between gap-2" title={GLASS_HINT}>
      <Label htmlFor={id} className="text-xs">
        Glass
      </Label>
      <Switch
        id={id}
        size="sm"
        checked={checked}
        onCheckedChange={onChange}
        aria-describedby={`${id}-hint`}
      />
      {/* The tooltip is mouse-only; screen readers get the same hint here. */}
      <span id={`${id}-hint`} className="sr-only">
        {GLASS_HINT}
      </span>
    </div>
  )
}

/**
 * A material's values (PLAN 6.3): colour, surface sliders, glass, glow colour and density.
 * Each control's edit is one undo entry; all parts using the material change with it.
 */
export function MaterialValues({ material }: { material: Material }) {
  const updateMaterial = useDocumentStore((s) => s.updateMaterial)
  const update = (patch: MaterialPatch) => updateMaterial(material.id, patch)
  const slider = (field: MaterialField) => (
    <MaterialSlider
      key={field.key}
      field={field}
      value={material[field.key]}
      onChange={(v) => {
        const patch: MaterialPatch = {}
        patch[field.key] = v
        update(patch)
      }}
    />
  )
  const glass = material.transmission > 0

  return (
    <div className="flex flex-col gap-1.5">
      <ColorField label="Colour" value={material.color} onChange={(color) => update({ color })} />
      {SURFACE_FIELDS.map(slider)}
      <GlassToggle
        checked={glass}
        // Glass is see-through by transmission alone, so opacity goes back to 1 (PLAN 6.5).
        onChange={(on) => update(on ? { transmission: 1, opacity: 1 } : { transmission: 0 })}
      />
      {/* Only the switch turns glass off: live edits stop at 0.01, or the fields would unmount
          under the caret (typing "0.5" starts with 0). */}
      {glass && GLASS_FIELDS.map((f) => slider(f.key === "transmission" ? { ...f, min: 0.01 } : f))}
      <ColorField
        label="Glow colour"
        value={material.emissive}
        onChange={(emissive) => update({ emissive })}
      />
      <MaterialSlider
        field={DENSITY_FIELD}
        slider={false}
        value={material.densityKgM3}
        onChange={(densityKgM3) => update({ densityKgM3 })}
      />
    </div>
  )
}
