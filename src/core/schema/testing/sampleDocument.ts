import { createTestRig } from "@/core/scene/testRig"
import { createEmptyDocument, type SceneDocument } from "../document"
import type { GroupId } from "../ids"

/** Readable fixed UUIDs for tests: `uuid(1)` is 00000000-0000-4000-8000-000000000001. */
export const uuid = (n: number): string =>
  `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`

/** A valid document using every reachable kind: assets, a group, parts, anchors, a mate. */
export function sampleDocument(): SceneDocument {
  const doc = createEmptyDocument("0.1.0", "Sample")
  const rig = createTestRig()
  const groupId = uuid(100) as GroupId
  doc.groups[groupId] = { id: groupId, name: "Rig", parentId: null }
  for (const a of rig.assets) doc.assets[a.id] = a
  for (const p of rig.parts) doc.parts[p.id] = { ...p, parentId: groupId }
  for (const a of rig.anchors) doc.anchors[a.id] = a
  for (const m of rig.mates) doc.mates[m.id] = m
  return doc
}

/** JSON text → object, for documents a test then breaks on purpose. */
export const asJson = (doc: SceneDocument): Record<string, unknown> =>
  JSON.parse(JSON.stringify(doc)) as Record<string, unknown>
