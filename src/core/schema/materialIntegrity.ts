import type { SceneDocument } from "./document"
import type { MapKind, Material, TextureMap } from "./material"

const has = (record: object, id: unknown): boolean =>
  typeof id === "string" && Object.hasOwn(record, id)

/** The textures a material uses, by map (for integrity and save-time GC). */
export const materialMaps = (material: Material): [MapKind, TextureMap][] =>
  Object.entries(material.maps ?? {}) as [MapKind, TextureMap][]

/**
 * Material references (PLAN 6.1): every map's texture exists; every slot override names an
 * existing material and a slot the part's geometry has. Problem paths use list indexes, never
 * the free-text slot names.
 */
export function checkMaterialRefs(
  doc: SceneDocument,
  report: (path: string, message: string) => void
): void {
  for (const [key, material] of Object.entries(doc.materials))
    for (const [kind, map] of materialMaps(material))
      if (!has(doc.textures, map.textureId))
        report(`materials.${key}.maps.${kind}.textureId`, "refers to something that is missing")

  for (const [key, part] of Object.entries(doc.parts)) {
    if (!part.materialSlots) continue
    const asset = has(doc.assets, part.assetId) ? doc.assets[part.assetId] : undefined
    const slots = new Set(asset?.slots)
    part.materialSlots.forEach((override, i) => {
      if (!has(doc.materials, override.materialId))
        report(`parts.${key}.materialSlots.${i}.materialId`, "refers to something that is missing")
      if (asset && !slots.has(override.slot))
        report(`parts.${key}.materialSlots.${i}.slot`, "is not a slot of the part's geometry")
    })
  }
}
