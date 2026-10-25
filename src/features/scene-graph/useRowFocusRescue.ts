import { useEffect, useLayoutEffect, useRef, type RefObject } from "react"
import type { VisibleRow } from "@/core/scene/treeNav"
import { useDocumentStore } from "@/store/document/documentStore"

/**
 * Keeps keyboard focus in the tree when the focused row goes (Delete, undo; deleting the last
 * mate takes the Mates folder too): focus moves to the row now where it was, else the last,
 * instead of falling to <body>. The document listener runs before React removes the row, the
 * only moment that still knows which row had focus; every change records it afresh.
 */
export function useRowFocusRescue(
  list: RefObject<HTMLElement | null>,
  rows: readonly VisibleRow[],
  rowEls: RefObject<Map<string, HTMLElement>>
) {
  const focused = useRef<string | null>(null)
  const before = useRef(rows)
  useEffect(
    () =>
      useDocumentStore.subscribe((s, prev) => {
        if (s.doc === prev.doc) return
        const active = document.activeElement
        const inList = !!active && !!list.current?.contains(active)
        focused.current = inList ? (active.getAttribute("data-node-id") ?? null) : null
      }),
    [list]
  )
  useLayoutEffect(() => {
    const [previous, id] = [before.current, focused.current]
    before.current = rows
    focused.current = null
    if (id === null || rows.some((r) => r.node.id === id)) return
    const active = document.activeElement
    if (active && active !== document.body && active.isConnected) return
    const at = previous.findIndex((r) => r.node.id === id)
    const next = rows[Math.min(Math.max(at, 0), rows.length - 1)]
    if (next) rowEls.current.get(next.node.id)?.focus() // its onFocus makes it the tab stop
  }, [rows, rowEls])
}
