import { Color, FrontSide, MeshPhysicalMaterial, type Material as ThreeMaterial } from "three"
import { lookKey, type SlotLook } from "@/core/materials/slotLooks"
import type { Material, Texture } from "@/core/schema"
import { readSceneTokens } from "../theme/sceneTokens"
import { applyPhysical } from "./applyPhysical"
import { textureCache } from "./textureCache"
import { EdgeLineMaterial } from "./edgeLineMaterial"
import { setTriplanarMaps, type TriplanarMaps } from "./triplanar"
import { XRayMaterial } from "./xrayMaterial"

/** The two ways a look is drawn: lit (every mode with faces) and X-ray. */
export type LookVariant = "shaded" | "xray"

interface Entry {
  shaded: MeshPhysicalMaterial
  xray: XRayMaterial
  /** The document material last applied (immer replaces it on every edit). */
  applied: Material | null
}

/** Imported colours and the default look: plain plastic, like the Phase 4 source materials. */
const PLAIN = { metalness: 0, roughness: 0.55, side: FrontSide } as const

const entries = new Map<string, Entry>()
let edges: EdgeLineMaterial | null = null

/** Feature edges of every part: one material for the app's lifetime (like the highlights). */
export function edgeLineMaterial(): EdgeLineMaterial {
  edges ??= new EdgeLineMaterial(new Color(readSceneTokens().edge))
  return edges
}

function createEntry(look: SlotLook): Entry {
  const color =
    look.kind === "source"
      ? new Color().setRGB(...look.color) // linear already, three's working space
      : new Color(readSceneTokens().partDefault) // sRGB token -> linear
  const shaded = new MeshPhysicalMaterial({ ...PLAIN, color })
  return { shaded, xray: new XRayMaterial(color), applied: null }
}

function mapsOf(material: Material, textures: Readonly<Record<string, Texture>>): TriplanarMaps {
  const map = (kind: "baseColor" | "roughness", space: "color" | "data") => {
    const ref = material.maps?.[kind]
    const record = ref && Object.hasOwn(textures, ref.textureId) ? textures[ref.textureId] : null
    if (!ref || !record) return null
    const texture = textureCache.get(record.id, space)
    if (!texture) textureCache.request(record, space)
    return texture ? { texture, tileSizeMm: ref.tileSizeMm } : null
  }
  return { baseColor: map("baseColor", "color"), roughness: map("roughness", "data") }
}

/** Copies a document material onto its three.js materials, in place (no new programs). */
function apply(entry: Entry, material: Material, textures: Readonly<Record<string, Texture>>) {
  const s = entry.shaded
  applyPhysical(s, material)
  setTriplanarMaps(s, mapsOf(material, textures))
  entry.xray.setTint(s.color)
  entry.applied = material
}

/**
 * three.js materials by look (PLAN 6.1): one per document material, imported colour and the
 * default, each with an X-ray variant, so switching display modes only swaps references and
 * every part with the same material shares one (CLAUDE.md §4: never in the store).
 */
export const materialCache = {
  get(
    look: SlotLook,
    variant: LookVariant,
    doc: {
      materials: Readonly<Record<string, Material>>
      textures: Readonly<Record<string, Texture>>
    }
  ): ThreeMaterial {
    const key = lookKey(look)
    let entry = entries.get(key)
    if (!entry) {
      entry = createEntry(look)
      entries.set(key, entry)
    }
    if (look.kind === "material" && Object.hasOwn(doc.materials, look.materialId)) {
      const material = doc.materials[look.materialId]
      if (material && material !== entry.applied) apply(entry, material, doc.textures)
    }
    return variant === "xray" ? entry.xray : entry.shaded
  },

  /**
   * After a document change: re-applies edited materials (and textures that finished loading),
   * frees materials the document no longer has. Returns whether a redraw is needed.
   */
  sync(doc: {
    materials: Readonly<Record<string, Material>>
    textures: Readonly<Record<string, Texture>>
  }): boolean {
    let changed = false
    for (const [key, entry] of entries) {
      if (!key.startsWith("m:")) continue
      const id = key.slice(2)
      const material = Object.hasOwn(doc.materials, id) ? doc.materials[id] : undefined
      if (!material) {
        entry.shaded.dispose()
        entry.xray.dispose()
        entries.delete(key)
        continue
      }
      // Re-applied when maps are set, too: a texture may have arrived since.
      if (material !== entry.applied || material.maps) {
        apply(entry, material, doc.textures)
        changed = true
      }
    }
    return changed
  },
}
