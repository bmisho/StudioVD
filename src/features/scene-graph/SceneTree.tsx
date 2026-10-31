import { useCallback, useMemo, useRef, useState } from "react"
import { MATES_FOLDER_ID, type SceneTreeNode } from "@/core/scene/sceneTree"
import {
  foldersHolding,
  treeMove,
  visibleRows,
  type TreeKey,
  type VisibleRow,
} from "@/core/scene/treeNav"
import type { PartId } from "@/core/schema"
import { useDocumentStore } from "@/store/document/documentStore"
import { useSessionStore, type SelectionItem } from "@/store/session/sessionStore"
import { SceneTreeRow } from "./SceneTreeRow"
import { useRowFocusRescue } from "./useRowFocusRescue"

const TREE_KEYS: ReadonlySet<string> = new Set<TreeKey>([
  "ArrowDown",
  "ArrowUp",
  "ArrowRight",
  "ArrowLeft",
  "Home",
  "End",
])
const isTreeKey = (key: string): key is TreeKey => TREE_KEYS.has(key)

/** What selecting a row selects; the Mates and Connectors folders select nothing (they open). */
function itemOf(node: SceneTreeNode): SelectionItem | null {
  if (node.kind === "group") return { kind: "group", id: node.id }
  if (node.kind === "part") return { kind: "part", id: node.id }
  if (node.kind === "mate") return { kind: "mate", id: node.id }
  if (node.kind === "connector") return { kind: "connector", id: node.id }
  return null
}
const keyOf = (item: { kind: string; id: string }) => `${item.kind}:${item.id}`
/** Past this many mates the Mates folder closes (once): its rows would dwarf the parts'. */
const LARGE_FOLDER = 500

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
  const list = useRef<HTMLUListElement>(null)
  useRowFocusRescue(list, rows, rowEls)
  const registerRow = useCallback((id: string, el: HTMLElement | null) => {
    if (el) rowEls.current.set(id, el)
    else rowEls.current.delete(id)
  }, [])

  // Adjusted while rendering (React's pattern for state that follows props): a new selection
  // opens the folders holding it, and a Mates folder that grows large closes once.
  const [shown, setShown] = useState(selection)
  if (selection !== shown) {
    setShown(selection)
    const open = foldersHolding(tree, new Set(selection.map((s) => s.id)))
    if ([...open].some((id) => collapsed.has(id)))
      setCollapsed((prev) => new Set([...prev].filter((id) => !open.has(id))))
  }
  const large = tree.some((n) => n.kind === "mates" && n.children.length > LARGE_FOLDER)
  const [wasLarge, setWasLarge] = useState(false)
  if (large !== wasLarge) {
    setWasLarge(large)
    if (large) setCollapsed((prev) => new Set(prev).add(MATES_FOLDER_ID))
  }
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
      ref={list}
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
          registerRow={registerRow}
        />
      ))}
    </ul>
  )
}
