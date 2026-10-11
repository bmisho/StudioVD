import { useId } from "react"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import type { PartId } from "@/core/schema"
import { useDocumentStore } from "@/store/document/documentStore"
import { NameField } from "./NameField"
import { PropertyField } from "./PropertyField"

const mm = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 })
const whole = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 })
const triple = (v: readonly number[]) => v.map((x) => mm.format(x)).join(", ")

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  const id = useId()
  return (
    <div className="flex items-center justify-between gap-2" title={hint}>
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Switch id={id} size="sm" checked={checked} onCheckedChange={onChange} />
    </div>
  )
}

/** Part inspector (PLAN 4.7): name, visibility, grounding, placement and geometry facts. */
export function PartProperties({ id }: { id: PartId }) {
  const part = useDocumentStore((s) => s.doc.parts[id])
  const asset = useDocumentStore((s) => (part ? s.doc.assets[part.assetId] : undefined))
  const renamePart = useDocumentStore((s) => s.renamePart)
  const setVisible = useDocumentStore((s) => s.setPartsVisible)
  const setGrounded = useDocumentStore((s) => s.setPartsGrounded)
  if (!part) return null
  const size = asset ? asset.bboxMm.max.map((v, i) => v - (asset.bboxMm.min[i] ?? 0)) : null

  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="text-xs font-semibold">Part</h3>
      <NameField id={`part-name-${id}`} name={part.name} rename={(n) => renamePart(id, n)} />
      <div className="mt-2 flex flex-col gap-2">
        <Toggle
          label="Visible"
          hint="Hidden parts are not drawn, picked or simulated."
          checked={part.visible}
          onChange={(v) => setVisible([id], v)}
        />
        <Toggle
          label="Grounded"
          hint="Grounded parts stay fixed in test mode. The gizmo still moves them."
          checked={part.grounded}
          onChange={(v) => setGrounded([id], v)}
        />
      </div>
      <h4 className="mt-3 text-xs font-semibold">Placement</h4>
      <PropertyField label="Position (mm)" value={triple(part.pose.positionMm)} />
      {asset && size && (
        <>
          <h4 className="mt-3 text-xs font-semibold">Geometry</h4>
          <PropertyField label="Size (mm)" value={triple(size)} />
          <PropertyField label="Triangles" value={whole.format(asset.triangleCount)} />
          <PropertyField
            label="Volume (mm³)"
            value={
              asset.volumeMm3 !== undefined ? whole.format(asset.volumeMm3) : "n/a (open mesh)"
            }
          />
          <PropertyField label="Watertight" value={asset.watertight ? "Yes" : "No"} />
        </>
      )}
    </div>
  )
}
