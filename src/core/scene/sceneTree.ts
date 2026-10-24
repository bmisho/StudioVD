import type { AssemblyGraph, MateIssue } from "@/core/assembly/assemblyGraph"
import { mateTypeLabel } from "@/core/assembly/mateNames"
import type { AnchorId, GroupId, MateId, MateType, PartId, SceneDocument } from "@/core/schema"

/** The id of the Mates folder row (never a minted id: those are UUIDs). */
export const MATES_FOLDER_ID = "mates"

export type SceneTreeNode =
  | { kind: "group"; id: GroupId; name: string; children: SceneTreeNode[] }
  | {
      kind: "part"
      id: PartId
      name: string
      hidden?: true
      grounded?: true
      /** In a mechanism: its degrees of freedom relative to the ground, or it floats. */
      dof?: number | "floating"
    }
  | { kind: "mates"; id: typeof MATES_FOLDER_ID; name: string; children: SceneTreeNode[] }
  | { kind: "mate"; id: MateId; name: string; type: MateType; issues: readonly MateIssue[] }

type TreeSource = Pick<SceneDocument, "groups" | "parts"> &
  Partial<Pick<SceneDocument, "anchors" | "mates">>

/**
 * Builds the scene-graph tree: groups first, then parts, each in document order, then a
 * Mates folder (PLAN 8.5) when there are mates, each named by its type and parts and marked
 * with its issues; parts in a mechanism carry their DOF (from `graph`).
 * Entities whose parent is missing are shown at the root rather than disappearing, and a
 * parent cycle (only possible in a corrupt file) is broken instead of recursing forever.
 */
export function buildSceneTree(doc: TreeSource, graph?: AssemblyGraph): SceneTreeNode[] {
  const groups = Object.values(doc.groups)
  const parts = Object.values(doc.parts)
  const parentOf = (parentId: GroupId | null): GroupId | null =>
    parentId !== null && Object.hasOwn(doc.groups, parentId) ? parentId : null

  const childGroups = new Map<GroupId | null, typeof groups>()
  for (const g of groups) {
    const key = parentOf(g.parentId)
    childGroups.set(key, [...(childGroups.get(key) ?? []), g])
  }
  const childParts = new Map<GroupId | null, typeof parts>()
  for (const p of parts) {
    const key = parentOf(p.parentId)
    childParts.set(key, [...(childParts.get(key) ?? []), p])
  }

  const visited = new Set<GroupId>()
  const build = (parent: GroupId | null): SceneTreeNode[] => {
    const nodes: SceneTreeNode[] = []
    for (const g of childGroups.get(parent) ?? []) {
      if (visited.has(g.id)) continue
      visited.add(g.id)
      nodes.push({ kind: "group", id: g.id, name: g.name, children: build(g.id) })
    }
    for (const p of childParts.get(parent) ?? []) {
      // A grounded part shows its pin instead: 0 DOF would say the same again.
      const dof = graph && !p.grounded ? partDof(graph, p.id) : undefined
      nodes.push({
        kind: "part",
        id: p.id,
        name: p.name,
        ...(p.visible ? {} : { hidden: true }),
        ...(p.grounded ? { grounded: true } : {}),
        ...(dof !== undefined ? { dof } : {}),
      })
    }
    return nodes
  }

  const roots = build(null)
  // Groups only reachable through a cycle never hang off the root: surface them there.
  for (const g of groups) {
    if (!visited.has(g.id)) {
      visited.add(g.id)
      roots.push({ kind: "group", id: g.id, name: g.name, children: build(g.id) })
    }
  }
  const mates = Object.values(doc.mates ?? {})
  if (mates.length > 0) {
    const anchors = doc.anchors ?? {}
    const partName = (anchorId: AnchorId) => {
      const a = Object.hasOwn(anchors, anchorId) ? anchors[anchorId] : undefined
      return (
        (a && Object.hasOwn(doc.parts, a.partId) ? doc.parts[a.partId]?.name : undefined) ?? "?"
      )
    }
    roots.push({
      kind: "mates",
      id: MATES_FOLDER_ID,
      name: "Mates",
      children: mates.map((m) => ({
        kind: "mate",
        id: m.id,
        name: `${mateTypeLabel(m.type)}: ${partName(m.anchorA)} – ${partName(m.anchorB)}`,
        type: m.type,
        issues: graph?.issues.get(m.id) ?? [],
      })),
    })
  }
  return roots
}

/** A part's DOF badge: only for parts in a mechanism (mated, or fixed to another part). */
function partDof(graph: AssemblyGraph, id: PartId): number | "floating" | undefined {
  const group = graph.groups[graph.groupOf.get(id) ?? -1]
  const mechanism = group && graph.mechanisms[group.mechanism]
  if (!group || !mechanism) return undefined
  if (group.parts.length < 2 && mechanism.joints.length === 0) return undefined
  return group.dof ?? (mechanism.grounded ? undefined : "floating")
}
