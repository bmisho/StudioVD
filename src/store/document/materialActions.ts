import type { Draft } from "immer"
import {
  builtinByKey,
  matchesBuiltin,
  materialFromBuiltin,
  newCustomMaterial,
  reusableMaterial,
  uniqueMaterialName,
} from "@/core/materials/presets"
import {
  COLLECTION_CAPS,
  MaterialSchema,
  materialMaps,
  newId,
  TextureMapSchema,
  type MapKind,
  type Material,
  type MaterialId,
  type PartId,
  type SceneDocument,
  type Texture,
  type TextureId,
  type TextureMap,
} from "@/core/schema"
import { deepEqual } from "@/core/util/deepEqual"

/** Values the editor changes; identity, provenance and maps have their own actions. */
export type MaterialPatch = Partial<Omit<Material, "id" | "builtinKey" | "maps">>

export interface MaterialActions {
  /** Gives parts a built-in preset: an unchanged copy already in the project, else a new one. */
  assignBuiltin: (partIds: readonly PartId[], key: string) => MaterialId | null
  /** Sets the parts' material (`null`: their source colours). An unknown id is ignored. */
  assignMaterial: (partIds: readonly PartId[], id: MaterialId | null) => void
  /** Creates a custom material and gives it to `partIds`; null at the project's limit. */
  createMaterial: (partIds?: readonly PartId[]) => MaterialId | null
  /** Copies a material ("Make Unique") and gives the copy to `partIds`. */
  duplicateMaterial: (id: MaterialId, partIds?: readonly PartId[]) => MaterialId | null
  /** Changes values; a result the schema would refuse, or no change, is ignored. */
  updateMaterial: (id: MaterialId, patch: MaterialPatch) => void
  /** Sets or clears one texture map; `texture` is recorded when the project lacks it. */
  setMaterialMap: (id: MaterialId, kind: MapKind, map: TextureMap | null, texture?: Texture) => void
  /** Deletes a material; its parts and slots fall back to their source look. */
  deleteMaterial: (id: MaterialId) => void
  /** Gives one slot of a part its own material (`null`: back to the part's material). */
  setSlotMaterial: (partId: PartId, slot: string, id: MaterialId | null) => void
}

type Set = (fn: (state: Draft<{ doc: SceneDocument }>) => void) => void
type Get = () => { doc: SceneDocument }

const hasMaterial = (doc: SceneDocument, id: MaterialId) => Object.hasOwn(doc.materials, id)

function assign(doc: Draft<SceneDocument>, partIds: readonly PartId[], id: MaterialId | null) {
  for (const partId of partIds) {
    const part = Object.hasOwn(doc.parts, partId) ? doc.parts[partId] : undefined
    if (part && part.materialId !== id) part.materialId = id
  }
}

/** Drops texture records no material uses any more (their files stay, for undo). */
function dropUnusedTextures(doc: Draft<SceneDocument>) {
  const used = new Set(
    Object.values(doc.materials).flatMap((m) => materialMaps(m).map(([, map]) => map.textureId))
  )
  for (const id of Object.keys(doc.textures) as TextureId[])
    if (!used.has(id)) delete doc.textures[id]
}

export function materialActions(set: Set, get: Get): MaterialActions {
  /** Adds a material unless the project holds as many as a file may (then: false). */
  const insert = (material: Material, partIds: readonly PartId[]) => {
    if (Object.keys(get().doc.materials).length >= COLLECTION_CAPS.materials) return false
    set((s) => {
      s.doc.materials[material.id] = material
      assign(s.doc, partIds, material.id)
    })
    return true
  }

  return {
    assignBuiltin: (partIds, key) => {
      const builtin = builtinByKey(key)
      if (!builtin) return null
      const doc = get().doc
      // Parts that went away (undo during a drag) get nothing; no unused material either.
      if (partIds.length > 0 && !partIds.some((id) => Object.hasOwn(doc.parts, id))) return null
      // Parts that already show this preset keep the copy they have (no undo entry either).
      const current = partIds.map((id) => (Object.hasOwn(doc.parts, id) ? doc.parts[id] : null))
      const kept = current[0]?.materialId
      const unchanged = (id: MaterialId | null | undefined) => {
        const material = id && hasMaterial(doc, id) ? doc.materials[id] : undefined
        return material !== undefined && matchesBuiltin(material, builtin)
      }
      if (kept && current.every((part) => unchanged(part?.materialId))) return kept
      const reused = reusableMaterial(doc, builtin)
      if (reused) {
        set((s) => assign(s.doc, partIds, reused.id))
        return reused.id
      }
      const material = materialFromBuiltin(builtin, newId(), uniqueMaterialName(doc, builtin.name))
      return insert(material, partIds) ? material.id : null
    },

    assignMaterial: (partIds, id) => {
      if (id !== null && !hasMaterial(get().doc, id)) return
      set((s) => assign(s.doc, partIds, id))
    },

    createMaterial: (partIds = []) => {
      const material = newCustomMaterial(newId(), uniqueMaterialName(get().doc, "Material"))
      return insert(material, partIds) ? material.id : null
    },

    duplicateMaterial: (id, partIds = []) => {
      const doc = get().doc
      const source = hasMaterial(doc, id) ? doc.materials[id] : undefined
      if (!source) return null
      const copy: Material = { ...structuredClone(source), id: newId() }
      copy.name = uniqueMaterialName(doc, source.name)
      // The user's own copy from now on: never handed out again as the preset (reuse).
      delete copy.builtinKey
      return insert(copy, partIds) ? copy.id : null
    },

    updateMaterial: (id, patch) => {
      const current = hasMaterial(get().doc, id) ? get().doc.materials[id] : undefined
      if (!current) return
      const parsed = MaterialSchema.safeParse({ ...current, ...patch })
      if (!parsed.success || deepEqual(parsed.data, current)) return
      set((s) => {
        s.doc.materials[id] = parsed.data
      })
    },

    setMaterialMap: (id, kind, map, texture) => {
      const doc = get().doc
      if (!hasMaterial(doc, id)) return
      if (map && !TextureMapSchema.safeParse(map).success) return
      const known = map === null || Object.hasOwn(doc.textures, map.textureId)
      if (!known && texture?.id !== map.textureId) return
      if (!known && Object.keys(doc.textures).length >= COLLECTION_CAPS.textures) return
      if (deepEqual(doc.materials[id]?.maps?.[kind] ?? null, map)) return
      set((s) => {
        const material = s.doc.materials[id]
        if (!material) return
        if (map && texture && !Object.hasOwn(s.doc.textures, texture.id))
          s.doc.textures[texture.id] = texture
        const maps = { ...material.maps }
        if (map) maps[kind] = map
        else delete maps[kind]
        if (Object.keys(maps).length > 0) material.maps = maps
        else delete material.maps
        dropUnusedTextures(s.doc)
      })
    },

    deleteMaterial: (id) =>
      set((s) => {
        if (!Object.hasOwn(s.doc.materials, id)) return
        delete s.doc.materials[id]
        for (const part of Object.values(s.doc.parts)) {
          if (part.materialId === id) part.materialId = null
          if (!part.materialSlots?.some((o) => o.materialId === id)) continue
          const kept = part.materialSlots.filter((o) => o.materialId !== id)
          if (kept.length > 0) part.materialSlots = kept
          else delete part.materialSlots
        }
        dropUnusedTextures(s.doc)
      }),

    setSlotMaterial: (partId, slot, id) => {
      const doc = get().doc
      const part = Object.hasOwn(doc.parts, partId) ? doc.parts[partId] : undefined
      const asset =
        part && Object.hasOwn(doc.assets, part.assetId) ? doc.assets[part.assetId] : null
      if (!part || !asset?.slots?.includes(slot)) return
      if (id !== null && !hasMaterial(doc, id)) return
      const current = part.materialSlots?.find((o) => o.slot === slot)?.materialId ?? null
      if (current === id) return
      set((s) => {
        const draft = s.doc.parts[partId]
        if (!draft) return
        const others = (draft.materialSlots ?? []).filter((o) => o.slot !== slot)
        const slots = id === null ? others : [...others, { slot, materialId: id }]
        if (slots.length > 0) draft.materialSlots = slots
        else delete draft.materialSlots
      })
    },
  }
}
