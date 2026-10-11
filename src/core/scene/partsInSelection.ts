import type { GroupId, PartId, SceneDocument } from "@/core/schema"
import type { SelectionRef } from "@/core/scene/selection"

const EMPTY: ReadonlySet<PartId> = new Set()

/**
 * Parts drawn as selected in 3D: directly selected parts plus every part below a selected
 * group (any depth). Parent cycles (corrupt files only) terminate. Unknown ids are ignored.
 */
export function partsInSelection(
  doc: Pick<SceneDocument, "groups" | "parts">,
  selection: readonly SelectionRef[]
): ReadonlySet<PartId> {
  const parts = new Set<string>()
  const groups = new Set<string>()
  for (const item of selection) {
    if (item.kind === "part") parts.add(item.id)
    else if (item.kind === "group") groups.add(item.id)
  }
  if (parts.size === 0 && groups.size === 0) return EMPTY

  const memo = new Map<GroupId, boolean>()
  const underSelectedGroup = (start: GroupId | null): boolean => {
    const path: GroupId[] = []
    let current = start
    let result = false
    while (current !== null) {
      const known = memo.get(current)
      if (known !== undefined) {
        result = known
        break
      }
      if (groups.has(current)) {
        result = true
        break
      }
      if (path.includes(current)) break // cycle
      path.push(current)
      const group = Object.hasOwn(doc.groups, current) ? doc.groups[current] : undefined
      current = group ? group.parentId : null
    }
    for (const id of path) memo.set(id, result)
    return result
  }

  const out = new Set<PartId>()
  for (const part of Object.values(doc.parts)) {
    if (parts.has(part.id) || (groups.size > 0 && underSelectedGroup(part.parentId))) {
      out.add(part.id)
    }
  }
  return out
}
