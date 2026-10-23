import type { Draft } from "immer"
import { anchorDeletion, partDeletion } from "@/core/scene/partOps"
import type { AnchorId, GroupId, PartId, SceneDocument } from "@/core/schema"

// Deletion steps on an immer draft, so one store action can combine them in ONE undo entry.

/** Removes parts with their anchors, mates, couplings, bindings and now-unused assets. */
export function removeParts(doc: Draft<SceneDocument>, ids: readonly PartId[]): void {
  const gone = partDeletion(doc, ids)
  for (const id of gone.parts) delete doc.parts[id]
  for (const id of gone.anchors) delete doc.anchors[id]
  for (const id of gone.mates) delete doc.mates[id]
  for (const id of gone.couplings) delete doc.couplings[id]
  for (const id of gone.bindings) delete doc.bindings[id]
  for (const id of gone.assets) delete doc.assets[id]
}

/** Removes anchors with the mates on them, their couplings and bindings (PLAN 7.4). */
export function removeAnchors(doc: Draft<SceneDocument>, ids: readonly AnchorId[]): void {
  const gone = anchorDeletion(doc, ids)
  for (const id of gone.anchors) delete doc.anchors[id]
  for (const id of gone.mates) delete doc.mates[id]
  for (const id of gone.couplings) delete doc.couplings[id]
  for (const id of gone.bindings) delete doc.bindings[id]
}

/** Removes groups; their child groups and parts move up to the deleted group's parent. */
export function removeGroups(doc: Draft<SceneDocument>, ids: readonly GroupId[]): void {
  for (const id of ids) {
    const group = doc.groups[id]
    if (!group) continue
    for (const child of Object.values(doc.groups)) {
      if (child.parentId === id) child.parentId = group.parentId
    }
    for (const part of Object.values(doc.parts)) {
      if (part.parentId === id) part.parentId = group.parentId
    }
    delete doc.groups[id]
  }
}
