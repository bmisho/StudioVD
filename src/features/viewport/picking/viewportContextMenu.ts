import { pickTarget } from "@/core/scene/componentPick"
import { selectionForContextMenu } from "@/core/scene/pickPolicy"
import { useDocumentStore } from "@/store/document/documentStore"
import { useContextMenuStore } from "@/store/session/contextMenuStore"
import { useSessionStore } from "@/store/session/sessionStore"
import { viewportBridge } from "../viewportBridge"

/**
 * A right click in the 3D view (decided on release, so a right drag never opens it): the part
 * under the pointer is picked as a left click would pick it (a component whole unless it is
 * the one entered), then the context menu opens there (PLAN 15.4).
 */
export function openViewportContextMenu(x: number, y: number): void {
  const session = useSessionStore.getState()
  const partId = viewportBridge.partAt(x, y)
  const doc = useDocumentStore.getState().doc
  const target = partId
    ? pickTarget(doc, { kind: "part", id: partId }, session.enteredComponent)
    : null
  const pick = selectionForContextMenu(session.selection, target)
  if (pick) session.select([pick])
  useContextMenuStore.getState().show({ place: "viewport", x, y })
}
