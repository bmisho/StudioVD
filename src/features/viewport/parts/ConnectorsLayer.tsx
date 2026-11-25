import { useMemo, useSyncExternalStore } from "react"
import { connectorFrames, connectorSignature } from "@/core/connectors/frames"
import type { SceneDocument } from "@/core/schema"
import { useDocumentStore } from "@/store/document/documentStore"
import { useSessionStore } from "@/store/session/sessionStore"
import { assetCache } from "./assetCache"
import { ConnectorView } from "./ConnectorView"
import { partObstacles } from "./partObstacles"
import { useLiveParts } from "./useLiveParts"

// Counts asset loads: a cable is cleared of parts again once their meshes are in.
let loads = 0
assetCache.subscribe(() => void loads++)
const loadCount = () => loads

/** What the parts' places and shown state come to: cables clear them again when it changes. */
const placesOf = (parts: SceneDocument["parts"]) =>
  Object.values(parts)
    .map(
      (p) => `${p.id}${p.visible ? "" : "-"}${p.pose.positionMm.join()}${p.pose.quaternion.join()}`
    )
    .join(";")

/**
 * Every visible connector (PLAN 9.6), inside the pick root: at the design pose, or following
 * its parts live while test mode runs (PLAN 10.6). In design mode cables are kept out of the
 * parts (0.2.2); test mode redraws every frame, so there they follow their route as laid.
 */
export function ConnectorsLayer() {
  const connectors = useDocumentStore((s) => s.doc.connectors)
  const anchors = useDocumentStore((s) => s.doc.anchors)
  const designParts = useDocumentStore((s) => s.doc.parts)
  const testMode = useSessionStore((s) => s.testMode)
  const parts = useLiveParts(designParts, anchors, connectors, testMode)
  const selection = useSessionStore((s) => s.selection)
  const assets = useDocumentStore((s) => s.doc.assets)
  const loaded = useSyncExternalStore(assetCache.subscribe, loadCount)
  const obstacles = useMemo(
    () =>
      testMode
        ? null
        : {
            clear: partObstacles({ parts: designParts, assets }),
            key: `${loaded}|${placesOf(designParts)}`,
          },
    [testMode, designParts, assets, loaded]
  )
  const views = useMemo(
    () =>
      Object.values(connectors).flatMap((c) => {
        const frames = c.visible ? connectorFrames({ anchors, parts }, c) : null
        if (!frames) return []
        const clears = c.kind === "cable" ? obstacles : null
        const signature = connectorSignature(c, frames) + (clears ? `|${clears.key}` : "")
        return [{ c, frames, signature, clear: clears?.clear }]
      }),
    [connectors, anchors, parts, obstacles]
  )
  const selected = useMemo(
    () => new Set(selection.flatMap((s) => (s.kind === "connector" ? [s.id] : []))),
    [selection]
  )
  return views.map(({ c, frames, signature, clear }) => (
    <ConnectorView
      key={c.id}
      connector={c}
      frames={frames}
      clear={clear}
      signature={signature}
      selected={selected.has(c.id)}
    />
  ))
}
