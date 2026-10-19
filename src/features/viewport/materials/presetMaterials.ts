import { FrontSide, MeshPhysicalMaterial } from "three"
import { builtinByKey, materialFromBuiltin } from "@/core/materials/presets"
import type { MaterialId } from "@/core/schema"
import { applyPhysical } from "./applyPhysical"

/** Never a minted id (those are UUIDs): preset previews are not document materials. */
const PREVIEW_ID = "preset-preview" as MaterialId

const presets = new Map<string, MeshPhysicalMaterial>()

/**
 * A built-in preset as a three.js material, for its preview sphere (PLAN 6.3). One per preset
 * for the app's lifetime: their values never change. Null for a key this build lacks.
 */
export function presetMaterial(key: string): MeshPhysicalMaterial | null {
  const known = presets.get(key)
  if (known) return known
  const builtin = builtinByKey(key)
  if (!builtin) return null
  const material = new MeshPhysicalMaterial({ side: FrontSide })
  applyPhysical(material, materialFromBuiltin(builtin, PREVIEW_ID))
  presets.set(key, material)
  return material
}
