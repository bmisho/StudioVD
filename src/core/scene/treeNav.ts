import type { SceneTreeNode } from "./sceneTree"

/** One rendered row of the tree: flat, in visual order (WAI-ARIA tree with aria-level). */
export interface VisibleRow {
  node: SceneTreeNode
  level: number
  parentId: string | null
  hasChildren: boolean
  expanded: boolean
  /** 1-based position among siblings and sibling count (aria-posinset / aria-setsize). */
  posInSet: number
  setSize: number
}

/** Flattens the tree into visible rows; children of collapsed groups are skipped. */
export function visibleRows(tree: SceneTreeNode[], collapsed: ReadonlySet<string>): VisibleRow[] {
  const rows: VisibleRow[] = []
  const walk = (nodes: SceneTreeNode[], level: number, parentId: string | null) => {
    nodes.forEach((node, i) => {
      const children = node.kind === "group" ? node.children : []
      const expanded = children.length > 0 && !collapsed.has(node.id)
      rows.push({
        node,
        level,
        parentId,
        hasChildren: children.length > 0,
        expanded,
        posInSet: i + 1,
        setSize: nodes.length,
      })
      if (expanded) walk(children, level + 1, node.id)
    })
  }
  walk(tree, 1, null)
  return rows
}

export type TreeKey = "ArrowDown" | "ArrowUp" | "ArrowRight" | "ArrowLeft" | "Home" | "End"

export type TreeMove =
  | { type: "focus"; id: string }
  | { type: "expand"; id: string }
  | { type: "collapse"; id: string }
  | { type: "none" }

/** WAI-ARIA tree keyboard behaviour for the row with `activeId`. */
export function treeMove(rows: VisibleRow[], activeId: string | null, key: TreeKey): TreeMove {
  if (rows.length === 0) return { type: "none" }
  const index = rows.findIndex((r) => r.node.id === activeId)
  const at = (i: number): TreeMove => {
    const row = rows[Math.max(0, Math.min(rows.length - 1, i))]
    return row ? { type: "focus", id: row.node.id } : { type: "none" }
  }
  if (index < 0 || key === "Home") return at(0)
  if (key === "End") return at(rows.length - 1)
  const row = rows[index]
  if (!row) return { type: "none" }
  switch (key) {
    case "ArrowDown":
      return at(index + 1)
    case "ArrowUp":
      return at(index - 1)
    case "ArrowRight":
      if (row.hasChildren && !row.expanded) return { type: "expand", id: row.node.id }
      if (row.expanded) return at(index + 1) // first child
      return { type: "none" }
    case "ArrowLeft":
      if (row.expanded) return { type: "collapse", id: row.node.id }
      return row.parentId ? { type: "focus", id: row.parentId } : { type: "none" }
  }
}
