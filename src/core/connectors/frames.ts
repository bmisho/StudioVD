import { anchorWorld } from "@/core/assembly/mateSnap"
import type { Rigid } from "@/core/math/rigid"
import { connectorAnchors, type Connector, type SceneDocument } from "@/core/schema"

/** The world frames of a connector's end anchors at the design pose; null if one is missing. */
export function connectorFrames(
  doc: Pick<SceneDocument, "anchors" | "parts">,
  c: Connector
): Rigid[] | null {
  const frames: Rigid[] = []
  for (const id of connectorAnchors(c)) {
    const anchor = Object.hasOwn(doc.anchors, id) ? doc.anchors[id] : undefined
    const part =
      anchor && Object.hasOwn(doc.parts, anchor.partId) ? doc.parts[anchor.partId] : undefined
    if (!anchor || !part) return null
    frames.push(anchorWorld(part, anchor))
  }
  return frames
}

/** Everything the geometry depends on, as text: equal text, equal geometry (no rebuild). */
export const connectorSignature = (c: Connector, frames: readonly Rigid[]): string =>
  JSON.stringify([c, frames])
