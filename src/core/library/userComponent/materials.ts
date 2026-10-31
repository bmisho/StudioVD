import { builtinByKey, matchesBuiltin } from "@/core/materials/presets"
import type { MaterialId, MaterialRef, Part, SceneDocument } from "@/core/schema"
import { localKey } from "./keys"

export interface ManifestMaterials {
  /** By manifest key. */
  refs: Record<string, MaterialRef>
  /** Each document material's key. */
  keyOf: Map<MaterialId, string>
}

const has = <T>(record: Record<string, T>, key: string): T | undefined =>
  Object.hasOwn(record, key) ? record[key] : undefined

/**
 * The manifest materials of `parts` (PLAN 9.7): an unchanged built-in preset by its key (it
 * is read back from this build's library), anything else written out with its look, density
 * and maps (texture files the project holds).
 */
export function manifestMaterials(doc: SceneDocument, parts: readonly Part[]): ManifestMaterials {
  const refs: Record<string, MaterialRef> = {}
  const keyOf = new Map<MaterialId, string>()
  const taken = new Set<string>()
  const used = parts.flatMap((p) => [
    ...(p.materialId ? [p.materialId] : []),
    ...(p.materialSlots ?? []).map((s) => s.materialId),
  ])
  for (const id of used) {
    const material = has(doc.materials, id)
    if (!material || keyOf.has(id)) continue
    const key = localKey(material.name, taken, "material")
    keyOf.set(id, key)
    const builtin = material.builtinKey ? builtinByKey(material.builtinKey) : undefined
    if (builtin && matchesBuiltin(material, builtin)) {
      refs[key] = { kind: "builtin", key: builtin.key }
      continue
    }
    const { id: _id, builtinKey: _key, maps, ...look } = material
    void _id
    void _key
    const ref: Extract<MaterialRef, { kind: "inline" }> = { kind: "inline", ...look }
    for (const slot of ["baseColor", "roughness"] as const) {
      const map = maps?.[slot]
      const texture = map && has(doc.textures, map.textureId)
      if (!map || !texture) continue
      ref.maps = {
        ...ref.maps,
        [slot]: { sha256: texture.id, path: texture.path, tileSizeMm: map.tileSizeMm },
      }
    }
    refs[key] = ref
  }
  return { refs, keyOf }
}
