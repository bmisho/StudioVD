import { useCallback, useMemo, useRef, useState } from "react"
import type { SceneTreeNode } from "@/core/scene/sceneTree"
import { treeMove, visibleRows, type TreeKey, type VisibleRow } from "@/core/scene/treeNav"
import type { PartId } from "@/core/schema"
import { useDocumentStore } from "@/store/document/documentStore"
import { useSessionStore, type SelectionItem } from "@/store/session/sessionStore"
import { SceneTreeRow } from "./SceneTreeRow"

const TREE_KEYS: ReadonlySet<string> = new Set<TreeKey>([
  "ArrowDown",
  "ArrowUp",
  "ArrowRight",
  "ArrowLeft",
  "Home",
  "End",
])
const isTreeKey = (key: string): key is TreeKey => TREE_KEYS.has(key)

/** What selecting a row selects; the Mates folder selects nothing (it opens and closes). */
function itemOf(node: SceneTreeNode): SelectionItem | null {
  if (node.kind === "group") return { kind: "group", id: node.id }
  if (node.kind === "part") return { kind: "part", id: node.id }
  if (node.kind === "mate") return { kind: "mate", id: node.id }
  return null
}
const keyOf = (item: { kind: string; id: string }) => `${item.kind}:${item.id}`

/**
 * WAI-ARIA multi-select tree with a roving tabindex. Selection follows focus (like a file
 * explorer); Ctrl+arrows move focus only, Ctrl+Space / Ctrl+click toggle an item.
 * Delete, Escape and other app shortcuts bubble on to the command registry.
 */
export function SceneTree({ tree }: { tree: SceneTreeNode[] }) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set())
  const [activeId, setActiveId] = useState<string | null>(null)
  const rows = useMemo(() => visibleRows(tree, collapsed), [tree, collapsed])
  const selection = useSessionStore((s) => s.selection)
  const select = useSessionStore((s) => s.select)
  const toggleSelected = useSessionStore((s) => s.toggleSelected)
  const selectedKeys = useMemo(() => new Set(selection.map(keyOf)), [selection])
  const rowEls = useRef(new Map<string, HTMLElement>())
  const toggleVisible = useCallback((id: string) => {
    const { doc, setPartsVisible } = useDocumentStore.getState()
    const part = doc.parts[id as PartId]
    if (part) setPartsVisible([part.id], !part.visible)
  }, [])

  // The tab stop: the last focused row while it is visible, else the first selected, else first.
  const tabStopId =
    (rows.some((r) => r.node.id === activeId) ? activeId : null) ??
    rows.find((r) => selectedKeys.has(keyOf(r.node)))?.node.id ??
    rows[0]?.node.id ??
    null

  const toggleExpanded = useCallback((id: string, expand?: boolean) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (expand ?? next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const onSelect = useCallback(
    (row: VisibleRow, additive: boolean) => {
      setActiveId(row.node.id)
      const item = itemOf(row.node)
      if (!item) toggleExpanded(row.node.id)
      else if (additive) toggleSelected(item)
      else select([item])
    },
    [select, toggleSelected, toggleExpanded]
  )

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.altKey || e.metaKey || e.shiftKey) return
    const current = rows.find((r) => r.node.id === tabStopId)
    if (e.key === " " || e.key === "Enter") {
      if (!current) return
      e.preventDefault()
      onSelect(current, e.ctrlKey && e.key === " ")
      return
    }
    if (!isTreeKey(e.key)) return
    e.preventDefault()
    const move = treeMove(rows, tabStopId, e.key)
    if (move.type === "expand") toggleExpanded(move.id, true)
    else if (move.type === "collapse") toggleExpanded(move.id, false)
    else if (move.type === "focus") {
      setActiveId(move.id)
      rowEls.current.get(move.id)?.focus()
      const target = rows.find((r) => r.node.id === move.id)
      const item = target && itemOf(target.node)
      if (item && !e.ctrlKey) select([item])
    }
  }

  return (
    <ul
      role="tree"
      aria-label="Scene graph"
      aria-multiselectable
      className="p-1"
      onKeyDown={onKeyDown}
    >
      {rows.map((row) => (
        <SceneTreeRow
          key={keyOf(row.node)}
          row={row}
          selected={selectedKeys.has(keyOf(row.node))}
          tabStop={row.node.id === tabStopId}
          onSelect={onSelect}
          onToggleExpanded={toggleExpanded}
          onToggleVisible={toggleVisible}
          onFocusRow={setActiveId}
          rowRef={(el) => {
            if (el) rowEls.current.set(row.node.id, el)
            else rowEls.current.delete(row.node.id)
          }}
        />
      ))}
    </ul>
  )
}
