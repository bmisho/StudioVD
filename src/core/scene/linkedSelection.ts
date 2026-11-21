import type { SelectionRef } from "@/core/scene/selection"
import type { GroupId, NodeId, PartId, SceneDocument } from "@/core/schema"

// Cross-selection (PLAN 11.6): a block and the parts of the component it is linked to show
// each other, in the 3D view, the tree and the schematic.

const NO_PARTS: ReadonlySet<PartId> = new Set()
const NO_GROUPS: ReadonlySet<GroupId> = new Set()
const NO_NODES: ReadonlySet<NodeId> = new Set()

type Doc = Pick<SceneDocument, "components" | "schematic">

/** The parts and component groups linked to the selected blocks. */
export function linkedToSelectedNodes(
  doc: Doc,
  selection: readonly SelectionRef[]
): { parts: ReadonlySet<PartId>; groups: ReadonlySet<GroupId> } {
  const parts = new Set<PartId>()
  const groups = new Set<GroupId>()
  for (const item of selection) {
    if (item.kind !== "node" || !Object.hasOwn(doc.schematic.nodes, item.id)) continue
    const c = doc.schematic.nodes[item.id as NodeId]?.componentInstanceId
    const instance =
      c !== undefined && Object.hasOwn(doc.components, c) ? doc.components[c] : undefined
    if (!instance) continue
    groups.add(instance.groupId)
    for (const part of Object.values(instance.parts)) parts.add(part)
  }
  return parts.size === 0 ? { parts: NO_PARTS, groups: NO_GROUPS } : { parts, groups }
}

/** The blocks linked to the components these parts belong to. */
export function nodesLinkedToParts(
  doc: Doc & Pick<SceneDocument, "parts">,
  parts: ReadonlySet<PartId>
): ReadonlySet<NodeId> {
  if (parts.size === 0) return NO_NODES
  const out = new Set<NodeId>()
  for (const id of parts) {
    const c = Object.hasOwn(doc.parts, id) ? doc.parts[id]?.componentRef?.instance : undefined
    const node =
      c !== undefined && Object.hasOwn(doc.components, c) ? doc.components[c]?.nodeId : undefined
    if (node !== undefined) out.add(node)
  }
  return out.size === 0 ? NO_NODES : out
}
