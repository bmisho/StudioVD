import { blockLayout } from "@/core/schematic/layout"
import { freeSpot } from "@/core/schematic/placement"
import { findModel } from "@/core/sim/models/registry"
import { useDocumentStore } from "@/store/document/documentStore"
import { useSessionStore } from "@/store/session/sessionStore"

// "Add this block" from outside the schematic (the Library's Schematic primitives, PLAN 9.4):
// the canvas places it where its own Add block would (the middle of its view); without a
// canvas, next to the origin.

type Listener = (modelKey: string) => void
let listener: Listener | null = null

export function requestBlock(modelKey: string): void {
  if (listener) return listener(modelKey)
  const ports = findModel(modelKey)?.ports ?? []
  const at = freeSpot(useDocumentStore.getState().doc, blockLayout({ ports }), { x: 0, y: 0 })
  const id = useDocumentStore.getState().addBlock(modelKey, at)
  if (id) useSessionStore.getState().select([{ kind: "node", id }])
}

/** The canvas answers block requests while it is mounted. */
export function onBlockRequest(handler: Listener): () => void {
  listener = handler
  return () => {
    if (listener === handler) listener = null
  }
}
