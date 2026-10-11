import type { GroupId, PartId, SceneDocument } from "@/core/schema"

export type SceneTreeNode =
  | { kind: "group"; id: GroupId; name: string; children: SceneTreeNode[] }
  | { kind: "part"; id: PartId; name: string; hidden?: true; grounded?: true }

/**
 * Builds the scene-graph tree: groups first, then parts, each in document order.
 * Entities whose parent is missing are shown at the root rather than disappearing, and a
 * parent cycle (only possible in a corrupt file) is broken instead of recursing forever.
 */
export function buildSceneTree(doc: Pick<SceneDocument, "groups" | "parts">): SceneTreeNode[] {
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
      nodes.push({
        kind: "part",
        id: p.id,
        name: p.name,
        ...(p.visible ? {} : { hidden: true }),
        ...(p.grounded ? { grounded: true } : {}),
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
  return roots
}
