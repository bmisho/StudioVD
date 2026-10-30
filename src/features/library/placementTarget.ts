import { anchorWorld } from "@/core/assembly/mateSnap"
import { fittingAnchor, type PlacementTarget } from "@/core/library/placement"
import { applyPoint } from "@/core/math/rigid"
import type { ComponentManifest, SceneDocument } from "@/core/schema"
import type { ViewportApi } from "@/features/viewport/viewportBridge"

/** A scene anchor this close to the cursor (CSS px) snaps the component onto it. */
export const SNAP_PX = 24
/** Anchors this much farther (CSS px) than the nearest still count as level with it. */
const TIE_PX = 10

/**
 * The target under the cursor (PLAN 4.6 priority): a scene anchor near it whose interface
 * fits one of the component's (unless `noSnap`, Alt held), else the part surface under it,
 * else the ground. Null when the cursor is off the 3D view.
 */
export function placementTarget(
  doc: Pick<SceneDocument, "parts" | "anchors">,
  manifest: ComponentManifest,
  view: Pick<ViewportApi, "probe" | "toClient">,
  x: number,
  y: number,
  noSnap: boolean
): { target: PlacementTarget; snap: string | null } | null {
  const probe = view.probe(x, y)
  if (!probe) return null
  if (!noSnap) {
    const near: { target: PlacementTarget; snap: string; d: number; depth: number }[] = []
    for (const anchor of Object.values(doc.anchors)) {
      const key = fittingAnchor(manifest, anchor.interface)
      const part = Object.hasOwn(doc.parts, anchor.partId) ? doc.parts[anchor.partId] : undefined
      if (!key || !part || !part.visible) continue
      const frame = anchorWorld(part, anchor)
      const at = view.toClient(applyPoint(frame, [0, 0, 0]))
      const d = at ? Math.hypot(at.x - x, at.y - y) : Infinity
      if (at && d <= SNAP_PX)
        near.push({
          target: { kind: "anchor", frame, key },
          snap: anchor.interface ?? "",
          d,
          depth: at.depth,
        })
    }
    // The nearest on screen; of anchors almost as near (a nut's two faces seen from above),
    // the one nearest the camera: the face the user sees.
    const nearest = Math.min(...near.map((n) => n.d))
    const best = near.filter((n) => n.d <= nearest + TIE_PX).sort((a, b) => a.depth - b.depth)[0]
    if (best) return { target: best.target, snap: best.snap }
  }
  if (probe.surface) return { target: { kind: "surface", ...probe.surface }, snap: null }
  if (probe.ground)
    return { target: { kind: "surface", point: probe.ground, normal: [0, 1, 0] }, snap: null }
  return null
}
