import type { MouseEvent } from "react"
import { selectionForContextMenu } from "@/core/scene/pickPolicy"
import type { NodeId } from "@/core/schema"
import { useContextMenuStore } from "@/store/session/contextMenuStore"
import { useSessionStore } from "@/store/session/sessionStore"

/** A right click on a block: it joins the selection rule of a click, then the menu opens. */
export function openBlockContextMenu(e: MouseEvent, node: { id: string }): void {
  e.preventDefault()
  const session = useSessionStore.getState()
  const pick = selectionForContextMenu(session.selection, {
    kind: "node" as const,
    id: node.id as NodeId,
  })
  if (pick) session.select([pick])
  useContextMenuStore.getState().show({ place: "schematic", x: e.clientX, y: e.clientY })
}
