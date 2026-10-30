import {
  builtinByKey,
  materialFromBuiltin,
  reusableMaterial,
  uniqueMaterialName,
} from "@/core/materials/presets"
import {
  newId,
  type ComponentManifest,
  type Material,
  type MaterialId,
  type SceneDocument,
  type Texture,
  type TextureId,
} from "@/core/schema"

export interface ComponentMaterials {
  /** By the manifest's material key. */
  ids: Record<string, MaterialId>
  /** Materials to add (presets the document lacks, inline materials). */
  added: Material[]
  textures: Texture[]
}

/**
 * The document materials a component's parts use (PLAN 4.3): a built-in preset reuses the
 * document's unchanged copy of it (ten screws, one Steel), else a fresh copy; an inline
 * material is always added, its maps naming the pack's texture files. A built-in key this
 * build does not know falls back to a neutral copy of ABS under the key's name.
 */
export function componentMaterials(
  doc: SceneDocument,
  manifest: ComponentManifest
): ComponentMaterials {
  const ids: Record<string, MaterialId> = {}
  const added: Material[] = []
  const textures: Texture[] = []
  const names = { ...doc, materials: { ...doc.materials } }
  const add = (material: Material) => {
    added.push(material)
    names.materials[material.id] = material
    return material.id
  }
  for (const [key, ref] of Object.entries(manifest.materials)) {
    if (ref.kind === "builtin") {
      const builtin = builtinByKey(ref.key)
      const reuse =
        builtin && (reusableMaterial(names, builtin) ?? added.find((m) => m.builtinKey === ref.key))
      if (reuse) ids[key] = reuse.id
      else if (builtin)
        ids[key] = add(
          materialFromBuiltin(builtin, newId<MaterialId>(), uniqueMaterialName(names, builtin.name))
        )
      else {
        const abs = builtinByKey("std.abs")
        if (!abs) throw new Error("the built-in library lost ABS")
        const fallback = materialFromBuiltin(
          abs,
          newId<MaterialId>(),
          uniqueMaterialName(names, ref.key)
        )
        delete fallback.builtinKey
        ids[key] = add(fallback)
      }
      continue
    }
    const { kind: _kind, maps, name, ...look } = ref
    void _kind
    const material: Material = {
      ...look,
      id: newId<MaterialId>(),
      name: uniqueMaterialName(names, name),
    }
    if (maps) {
      material.maps = {}
      for (const slot of ["baseColor", "roughness"] as const) {
        const map = maps[slot]
        if (!map) continue
        const id = map.sha256 as TextureId
        if (!textures.some((t) => t.id === id)) textures.push({ id, path: map.path })
        material.maps[slot] = { textureId: id, tileSizeMm: map.tileSizeMm }
      }
    }
    ids[key] = add(material)
  }
  return { ids, added, textures }
}
