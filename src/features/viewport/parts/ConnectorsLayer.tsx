import { useMemo } from "react"
import { connectorFrames, connectorSignature } from "@/core/connectors/frames"
import { useDocumentStore } from "@/store/document/documentStore"
import { useSessionStore } from "@/store/session/sessionStore"
import { ConnectorView } from "./ConnectorView"
import { useLiveParts } from "./useLiveParts"

/**
 * Every visible connector (PLAN 9.6), inside the pick root: at the design pose, or following
 * its parts live while test mode runs (PLAN 10.6).
 */
export function ConnectorsLayer() {
  const connectors = useDocumentStore((s) => s.doc.connectors)
  const anchors = useDocumentStore((s) => s.doc.anchors)
  const designParts = useDocumentStore((s) => s.doc.parts)
  const testMode = useSessionStore((s) => s.testMode)
  const parts = useLiveParts(designParts, anchors, connectors, testMode)
  const selection = useSessionStore((s) => s.selection)
  const views = useMemo(
    () =>
      Object.values(connectors).flatMap((c) => {
        const frames = c.visible ? connectorFrames({ anchors, parts }, c) : null
        return frames ? [{ c, frames, signature: connectorSignature(c, frames) }] : []
      }),
    [connectors, anchors, parts]
  )
  const selected = useMemo(
    () => new Set(selection.flatMap((s) => (s.kind === "connector" ? [s.id] : []))),
    [selection]
  )
  return views.map(({ c, frames, signature }) => (
    <ConnectorView
      key={c.id}
      connector={c}
      frames={frames}
      signature={signature}
      selected={selected.has(c.id)}
    />
  ))
}
