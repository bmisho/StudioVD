import { builtinByKey, materialFromBuiltin } from "@/core/materials/presets"
import { createTestRig } from "@/core/scene/testRig"
import { createEmptyDocument, type SceneDocument } from "../document"
import type { GroupId, MaterialId, TextureId } from "../ids"

/** Readable fixed UUIDs for tests: `uuid(1)` is 00000000-0000-4000-8000-000000000001. */
export const uuid = (n: number): string =>
  `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`

/** A texture id for tests (no file behind it). */
export const SAMPLE_TEXTURE = "ab".repeat(32) as TextureId

/** A built-in preset as a document material, for tests. */
export function testMaterial(key: string, n: number): ReturnType<typeof materialFromBuiltin> {
  const builtin = builtinByKey(key)
  if (!builtin) throw new Error(`no built-in ${key}`)
  return materialFromBuiltin(builtin, uuid(n) as MaterialId)
}

/**
 * A valid document using every reachable kind: assets (one with material slots), a texture,
 * materials (one with a map), a group, parts (a material and a slot override), anchors, a mate.
 */
export function sampleDocument(): SceneDocument {
  const doc = createEmptyDocument("0.1.0", "Sample")
  const rig = createTestRig()
  const groupId = uuid(100) as GroupId
  doc.groups[groupId] = { id: groupId, name: "Rig", parentId: null }
  for (const a of rig.assets) doc.assets[a.id] = a
  for (const p of rig.parts) doc.parts[p.id] = { ...p, parentId: groupId }
  for (const a of rig.anchors) doc.anchors[a.id] = a
  for (const m of rig.mates) doc.mates[m.id] = m

  doc.textures[SAMPLE_TEXTURE] = { id: SAMPLE_TEXTURE, path: `textures/${SAMPLE_TEXTURE}.png` }
  const steel = testMaterial("std.steel", 900)
  const rubber = { ...testMaterial("std.rubber", 901) }
  rubber.maps = { baseColor: { textureId: SAMPLE_TEXTURE, tileSizeMm: 25 } }
  doc.materials[steel.id] = steel
  doc.materials[rubber.id] = rubber
  const [first, second] = Object.values(doc.parts)
  const slotted = second ? doc.assets[second.assetId] : undefined
  if (!first || !second || !slotted) throw new Error("rig incomplete")
  first.materialId = steel.id
  slotted.slots = ["Body", "Trim"]
  second.materialSlots = [{ slot: "Trim", materialId: rubber.id }]
  return doc
}

/** JSON text → object, for documents a test then breaks on purpose. */
export const asJson = (doc: SceneDocument): Record<string, unknown> =>
  JSON.parse(JSON.stringify(doc)) as Record<string, unknown>
