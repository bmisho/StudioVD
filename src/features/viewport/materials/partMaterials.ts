import type { Material as ThreeMaterial } from "three"
import type { AssetSlot } from "@/core/geometry/slots"
import { slotLooks } from "@/core/materials/slotLooks"
import type { Part, SceneDocument } from "@/core/schema"
import { materialCache, type LookVariant } from "./materialCache"

const UNLOADED = [{ name: null, color: null }] as const

/**
 * The three.js material of each slot of a part: an array when its loaded asset has several
 * slots (the geometry has a draw group per slot), else one material for the whole geometry.
 * `slots` is null while the asset is not loaded (the bounding box stands in).
 */
export function partMaterials(
  part: Pick<Part, "materialId" | "materialSlots">,
  slots: readonly AssetSlot[] | null,
  variant: LookVariant,
  doc: Pick<SceneDocument, "materials" | "textures">
): ThreeMaterial | ThreeMaterial[] {
  const looks = slotLooks(part, slots ?? UNLOADED, doc.materials)
  const list = looks.map((look) => materialCache.get(look, variant, doc))
  return list.length === 1 && list[0] ? list[0] : list
}
