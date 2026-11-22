import type { Draft } from "immer"
import type { EntityBatch } from "@/core/scene/entityBatch"
import type { SceneDocument } from "@/core/schema"

/**
 * Writes a checked entity batch into a draft (`insertEntities`, Replace): content-addressed
 * records (assets, textures, definitions, licence texts) only when new, the rest by id.
 */
export function applyEntityBatch(d: Draft<SceneDocument>, batch: EntityBatch): void {
  for (const a of batch.assets ?? []) if (!Object.hasOwn(d.assets, a.id)) d.assets[a.id] = a
  for (const t of batch.textures ?? []) if (!Object.hasOwn(d.textures, t.id)) d.textures[t.id] = t
  for (const m of batch.materials ?? []) d.materials[m.id] = m
  for (const g of batch.groups ?? []) d.groups[g.id] = g
  for (const p of batch.parts ?? []) d.parts[p.id] = p
  for (const a of batch.anchors ?? []) d.anchors[a.id] = a
  for (const m of batch.mates ?? []) d.mates[m.id] = m
  for (const def of batch.componentDefs ?? [])
    if (!Object.hasOwn(d.componentDefs, def.key)) d.componentDefs[def.key] = def
  for (const c of batch.components ?? []) d.components[c.id] = c
  for (const l of batch.licenseTexts ?? [])
    if (!Object.hasOwn(d.licenseTexts, l.sha256)) d.licenseTexts[l.sha256] = l.text
  for (const b of batch.blockDefs ?? []) d.schematic.blockDefs[b.id] = b
  for (const n of batch.schematicNodes ?? []) d.schematic.nodes[n.id] = n
  for (const b of batch.bindings ?? []) d.bindings[b.id] = b
}
