import type { Draft } from "immer"
import type { ComponentInstanceId, SceneDocument } from "@/core/schema"

// Component instances list what they made (PLAN 4.6); these keep those lists true on a
// draft, so deleting or unlinking never leaves a document Open would refuse.

const has = (record: object, id: string) => Object.hasOwn(record, id)

/** Plain parts again: no component reference, anchors made manual; the group stays. */
export function unlinkInstance(doc: Draft<SceneDocument>, id: ComponentInstanceId): void {
  const c = doc.components[id]
  if (!c) return
  for (const partId of Object.values(c.parts)) delete doc.parts[partId]?.componentRef
  for (const anchorId of Object.values(c.anchors)) {
    const anchor = doc.anchors[anchorId]
    if (anchor) anchor.source = { kind: "manual" }
  }
  delete doc.components[id]
}

/**
 * After entities went: each instance forgets the keys of what is gone; one with no parts
 * left goes; one whose group was deleted is unlinked (its parts stay, as plain parts).
 */
export function pruneComponents(doc: Draft<SceneDocument>): void {
  for (const [id, c] of Object.entries(doc.components)) {
    const forget = (map: Record<string, string>, record: object) => {
      for (const [key, value] of Object.entries(map)) if (!has(record, value)) delete map[key]
    }
    forget(c.parts, doc.parts)
    forget(c.anchors, doc.anchors)
    forget(c.mates, doc.mates)
    forget(c.materials, doc.materials)
    forget(c.bindings, doc.bindings)
    if (c.nodeId !== undefined && !has(doc.schematic.nodes, c.nodeId)) delete c.nodeId
    if (!has(doc.groups, c.groupId)) unlinkInstance(doc, id as ComponentInstanceId)
    else if (Object.keys(c.parts).length === 0) delete doc.components[id as ComponentInstanceId]
  }
}
