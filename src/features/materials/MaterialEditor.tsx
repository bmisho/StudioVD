import { builtinByKey } from "@/core/materials/presets"
import type { Material, MaterialId, PartId } from "@/core/schema"
import { NameField } from "@/features/properties/NameField"
import { useDocumentStore } from "@/store/document/documentStore"
import { TextureMapField } from "./controls/TextureMapField"
import { MaterialActionsRow } from "./MaterialActionsRow"
import { MaterialValues } from "./MaterialValues"

const kgM3 = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 })

/** Where the material came from, and where its density comes from (CLAUDE.md §12). */
function Provenance({ material }: { material: Material }) {
  if (material.builtinKey === undefined) return null
  const builtin = builtinByKey(material.builtinKey)
  if (!builtin)
    return <p className="text-xs text-muted-foreground">Based on a preset this version lacks.</p>
  const density =
    material.densityKgM3 === builtin.densityKgM3
      ? `Density: ${builtin.density.source} (${builtin.density.confidence} confidence).`
      : `Density changed from the preset's ${kgM3.format(builtin.densityKgM3)} kg/m³.`
  return (
    <p className="text-xs text-muted-foreground">
      Based on {builtin.name}. {density}
    </p>
  )
}

/**
 * Editor for one document material (PLAN 6.3): every part using it changes with it. `partIds`
 * are the parts it is shown for (they get the copy on "Make unique"). Renders nothing once
 * the material is gone (undo, delete).
 */
export function MaterialEditor({
  materialId,
  partIds,
}: {
  materialId: MaterialId
  partIds: readonly PartId[]
}) {
  const material = useDocumentStore((s) =>
    Object.hasOwn(s.doc.materials, materialId) ? s.doc.materials[materialId] : undefined
  )
  const updateMaterial = useDocumentStore((s) => s.updateMaterial)
  if (!material) return null

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1.5">
        <NameField
          id={`material-name-${materialId}`}
          name={material.name}
          rename={(name) => updateMaterial(materialId, { name })}
        />
      </div>
      <MaterialValues material={material} />
      <div className="flex flex-col gap-2">
        <h5 className="text-xs font-semibold">Images</h5>
        <p className="text-xs text-muted-foreground">
          Projected along the part&apos;s three axes, so no UV mapping is needed.
        </p>
        <TextureMapField materialId={materialId} kind="baseColor" label="Colour image" />
        <TextureMapField materialId={materialId} kind="roughness" label="Roughness image" />
      </div>
      <Provenance material={material} />
      <MaterialActionsRow materialId={materialId} partIds={partIds} />
    </div>
  )
}
