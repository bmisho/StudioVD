import type { Material, MaterialId, SceneDocument } from "@/core/schema"
import { BUILTIN_MATERIALS, type Appearance, type BuiltinMaterial } from "./builtinMaterials"

const APPEARANCE_KEYS = [
  "color",
  "metalness",
  "roughness",
  "opacity",
  "transmission",
  "ior",
  "thicknessMm",
  "clearcoat",
  "clearcoatRoughness",
  "emissive",
  "emissiveIntensity",
] as const satisfies readonly (keyof Appearance)[]

export const builtinByKey = (key: string): BuiltinMaterial | undefined =>
  BUILTIN_MATERIALS.find((b) => b.key === key)

/** A document material holding a built-in preset's values. */
export function materialFromBuiltin(builtin: BuiltinMaterial, id: MaterialId, name = builtin.name) {
  const material: Material = {
    id,
    name,
    builtinKey: builtin.key,
    ...builtin.look,
    densityKgM3: builtin.densityKgM3,
  }
  return material
}

/** A new custom material: neutral grey plastic, density of ABS until the user sets one. */
export function newCustomMaterial(id: MaterialId, name: string): Material {
  const base = builtinByKey("std.abs")
  if (!base) throw new Error("the built-in library lost ABS")
  const custom: Material = { ...materialFromBuiltin(base, id, name), color: "#a3a9b1" }
  delete custom.builtinKey // a custom material has no preset behind it
  return custom
}

/** The material still has exactly its preset's values (no edits, no maps). */
export function matchesBuiltin(material: Material, builtin: BuiltinMaterial): boolean {
  return (
    material.builtinKey === builtin.key &&
    material.maps === undefined &&
    material.densityKgM3 === builtin.densityKgM3 &&
    APPEARANCE_KEYS.every((k) => material[k] === builtin.look[k])
  )
}

/** A document material to reuse for a preset: one with the preset's key and values unchanged. */
export function reusableMaterial(doc: SceneDocument, builtin: BuiltinMaterial): Material | null {
  for (const material of Object.values(doc.materials))
    if (matchesBuiltin(material, builtin)) return material
  return null
}

/** `base`, or `base 2`, `base 3`... whichever no material uses yet. */
export function uniqueMaterialName(doc: SceneDocument, base: string): string {
  const taken = new Set(Object.values(doc.materials).map((m) => m.name))
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(`${base} ${n}`)) n++
  return `${base} ${n}`
}
