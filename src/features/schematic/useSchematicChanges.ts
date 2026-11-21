import type { EdgeChange, NodeChange } from "@xyflow/react"
import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react"
import type { EdgeId, NodeId } from "@/core/schema"
import { useDocumentStore } from "@/store/document/documentStore"
import { documentHistory, type GestureToken } from "@/store/document/history"
import { useSessionStore, type SelectionItem } from "@/store/session/sessionStore"
import type { BlockFlowNode, WireFlowEdge } from "./flowTypes"
import type { Measured } from "./useFlowElements"

type Select = { id: string; selected: boolean }
const keyOf = (s: SelectionItem) => `${s.kind}:${s.id}`

/** Applies React Flow's select changes to the app selection (one list for every view). */
function applySelect(changes: Select[], kind: "node" | "edge", additive: boolean): void {
  const session = useSessionStore.getState()
  // A plain click in the schematic replaces what the other views had selected.
  const base =
    additive || !changes.some((c) => c.selected)
      ? session.selection
      : session.selection.filter((s) => s.kind === "node" || s.kind === "edge")
  const next = new Map(base.map((s) => [keyOf(s), s]))
  for (const c of changes) {
    const item = (
      kind === "node" ? { kind, id: c.id as NodeId } : { kind, id: c.id as EdgeId }
    ) as SelectionItem
    if (c.selected) next.set(keyOf(item), item)
    else next.delete(keyOf(item))
  }
  const items = [...next.values()]
  const same =
    items.length === session.selection.length &&
    items.every((s, i) => keyOf(s) === keyOf(session.selection[i] as SelectionItem))
  if (!same) session.select(items)
}

/**
 * The store-controlled flow's changes (PLAN 11.1): moves go to the document (a drag is one
 * undo entry), selection to the session, measured sizes stay here (view state).
 */
export function useSchematicChanges() {
  const [measured, setMeasured] = useState<Measured>(() => new Map())
  const additive = useRef(false)
  const drag = useRef<GestureToken | null>(null)

  const onNodesChange = useCallback((changes: NodeChange<BlockFlowNode>[]) => {
    const moves = new Map<NodeId, { x: number; y: number }>()
    const selects: Select[] = []
    const sizes = new Map<string, { width: number; height: number }>()
    for (const c of changes) {
      if (c.type === "position" && c.position) moves.set(c.id as NodeId, c.position)
      else if (c.type === "select") selects.push(c)
      else if (c.type === "dimensions" && c.dimensions) sizes.set(c.id, c.dimensions)
    }
    if (moves.size > 0) useDocumentStore.getState().moveNodes(moves)
    if (selects.length > 0) applySelect(selects, "node", additive.current)
    if (sizes.size > 0)
      setMeasured((old) => {
        const next = new Map(old)
        for (const [id, size] of sizes) {
          const was = old.get(id)
          if (was?.width !== size.width || was.height !== size.height) next.set(id, size)
        }
        return next.size === old.size && [...sizes].every(([id]) => next.get(id) === old.get(id))
          ? old
          : next
      })
  }, [])

  const onEdgesChange = useCallback((changes: EdgeChange<WireFlowEdge>[]) => {
    const selects = changes.filter((c) => c.type === "select")
    if (selects.length > 0) applySelect(selects, "edge", additive.current)
  }, [])

  // Dragging blocks (one or a box selection) is one undo entry.
  const onDragStart = useCallback(() => {
    drag.current ??= documentHistory.beginGesture()
  }, [])
  const onDragStop = useCallback(() => {
    documentHistory.endGesture(drag.current)
    drag.current = null
  }, [])
  useEffect(() => () => documentHistory.endGesture(drag.current), [])

  // Ctrl/Cmd/Shift on the press decides whether a click adds to the selection.
  const onPointerDownCapture = useCallback((e: PointerEvent) => {
    additive.current = e.ctrlKey || e.metaKey || e.shiftKey
  }, [])

  return {
    measured,
    onNodesChange,
    onEdgesChange,
    onDragStart,
    onDragStop,
    onPointerDownCapture,
  }
}
