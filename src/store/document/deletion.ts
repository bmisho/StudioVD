import type { Draft } from "immer"
import { anchorDeletion, mateDeletion, partDeletion } from "@/core/scene/partOps"
import { bindingRefs } from "@/core/schema/binding"
import type {
  AnchorId,
  BindingId,
  EdgeId,
  GroupId,
  MateId,
  NodeId,
  PartId,
  SceneDocument,
} from "@/core/schema"
import { pruneComponents } from "./componentUpkeep"
import { pruneConnectors } from "./connectorActions"

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
  pruneConnectors(doc)
  pruneComponents(doc)
}

/** Removes anchors with the mates on them, their couplings and bindings (PLAN 7.4). */
export function removeAnchors(doc: Draft<SceneDocument>, ids: readonly AnchorId[]): void {
  const gone = anchorDeletion(doc, ids)
  for (const id of gone.anchors) delete doc.anchors[id]
  for (const id of gone.mates) delete doc.mates[id]
  for (const id of gone.couplings) delete doc.couplings[id]
  for (const id of gone.bindings) delete doc.bindings[id]
  pruneConnectors(doc)
  pruneComponents(doc)
}

/** Removes mates with the couplings on them and the bindings that name them (PLAN 8.5). */
export function removeMates(doc: Draft<SceneDocument>, ids: readonly MateId[]): void {
  const gone = mateDeletion(doc, ids)
  for (const id of gone.mates) delete doc.mates[id]
  for (const id of gone.couplings) delete doc.couplings[id]
  for (const id of gone.bindings) delete doc.bindings[id]
  pruneComponents(doc)
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
  pruneComponents(doc) // a component whose group went is unlinked
}

/** Removes wires, and blocks with every wire on them; their components are unlinked. */
export function removeSchematic(
  doc: Draft<SceneDocument>,
  nodes: readonly NodeId[],
  edges: readonly EdgeId[]
): void {
  for (const id of edges) delete doc.schematic.edges[id]
  const gone = new Set<string>(nodes)
  for (const [id, e] of Object.entries(doc.schematic.edges))
    if (gone.has(e.source) || gone.has(e.target)) delete doc.schematic.edges[id as EdgeId]
  // Bindings to or from these blocks go with them.
  for (const [id, b] of Object.entries(doc.bindings))
    if (bindingRefs(b).some((ref) => gone.has(ref))) delete doc.bindings[id as BindingId]
  for (const id of nodes) {
    const node = doc.schematic.nodes[id]
    const c = node?.componentInstanceId
    const instance = c !== undefined ? doc.components[c] : undefined
    if (instance?.nodeId === id) delete instance.nodeId
    delete doc.schematic.nodes[id]
  }
  pruneComponents(doc) // components forget the bindings that went
}
