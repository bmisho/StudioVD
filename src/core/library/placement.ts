import { mateRelative } from "@/core/assembly/mateSnap"
import { tagsFit } from "@/core/assembly/interfaceTags"
import {
  applyPoint,
  compose,
  fromFrame,
  fromPose,
  invert,
  quatFromBasis,
  toPose,
  type Rigid,
} from "@/core/math/rigid"
import { cross, normalize } from "@/core/math/vec3"
import type { ComponentManifest, GeometryAsset, Pose, Vec3 } from "@/core/schema"

/** Where the component goes: onto a fitting scene anchor, or flat on a surface (or the ground). */
export type PlacementTarget =
  { kind: "anchor"; frame: Rigid; key: string } | { kind: "surface"; point: Vec3; normal: Vec3 }

/** A component anchor's frame in the component frame (part transform ∘ part-local frame). */
export function anchorInComponent(manifest: ComponentManifest, key: string): Rigid | null {
  const a = Object.hasOwn(manifest.anchors, key) ? manifest.anchors[key] : undefined
  const part = a && Object.hasOwn(manifest.parts, a.part) ? manifest.parts[a.part] : undefined
  return a && part ? compose(fromPose(part.transform), fromFrame(a.frame)) : null
}

/**
 * The frame laid on a surface when the component is dropped (PLAN 4.6): its placement
 * anchor, else the middle of its box's bottom facing down (component frame).
 */
export function placementFrame(
  manifest: ComponentManifest,
  assets: Record<string, GeometryAsset>
): Rigid {
  const key = manifest.placement.placementAnchor
  const anchor = key ? anchorInComponent(manifest, key) : null
  if (anchor) return anchor
  const lo: Vec3 = [Infinity, Infinity, Infinity]
  const hi: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (const [k, part] of Object.entries(manifest.parts)) {
    const box = Object.hasOwn(assets, k) ? assets[k]?.bboxMm : undefined
    if (!box) continue
    const t = fromPose(part.transform)
    for (let c = 0; c < 8; c++) {
      const p = applyPoint(t, [
        c & 1 ? box.max[0] : box.min[0],
        c & 2 ? box.max[1] : box.min[1],
        c & 4 ? box.max[2] : box.min[2],
      ])
      for (let i = 0; i < 3; i++) {
        lo[i] = Math.min(lo[i] ?? 0, p[i] ?? 0)
        hi[i] = Math.max(hi[i] ?? 0, p[i] ?? 0)
      }
    }
  }
  // z down (-Y), x along +X: 90° about X.
  const DOWN: Rigid["q"] = [Math.SQRT1_2, 0, 0, Math.SQRT1_2]
  if (!Number.isFinite(lo[0])) return { q: DOWN, t: [0, 0, 0] }
  return { q: DOWN, t: [(lo[0] + hi[0]) / 2, lo[1], (lo[2] + hi[2]) / 2] }
}

/** A frame at `point` whose z is `normal` (its x as close to world X, else Z, as it can be). */
export function surfaceFrame(point: Vec3, normal: Vec3): Rigid {
  const z = normalize(normal)
  const seed: Vec3 = Math.abs(z[0]) < 0.9 ? [1, 0, 0] : [0, 0, 1]
  const x = normalize(cross(cross(z, seed), z))
  return { q: quatFromBasis(x, cross(z, x), z), t: point }
}

/**
 * The component frame's pose for a target (PLAN 4.6, §2 snap formula): the chosen anchor C
 * (in the component frame) meets target T face to face, turned by `quarterTurns` × 90° about
 * T's z: M · C = T · R_flip · R_z(φ), so M = T · R_flip · R_z(φ) · C⁻¹.
 */
export function placePose(
  manifest: ComponentManifest,
  assets: Record<string, GeometryAsset>,
  target: PlacementTarget,
  quarterTurns: number
): Pose {
  const relative = mateRelative({ flip: true, angleOffsetRad: (quarterTurns * Math.PI) / 2 })
  const T = target.kind === "anchor" ? target.frame : surfaceFrame(target.point, target.normal)
  const C =
    (target.kind === "anchor" ? anchorInComponent(manifest, target.key) : null) ??
    placementFrame(manifest, assets)
  return toPose(compose(compose(T, relative), invert(C)))
}

/**
 * The component's anchor that fits a scene anchor's interface tag (PLAN 4.6 snap to a
 * compatible anchor): placement and mate anchors first, then the rest in order.
 */
export function fittingAnchor(
  manifest: ComponentManifest,
  sceneTag: string | undefined
): string | null {
  if (!sceneTag) return null
  const rank = (role: string | undefined) =>
    role === "placement" ? 0 : role === "mate" ? 1 : role === "mount" ? 2 : 3
  const keys = Object.entries(manifest.anchors)
    .filter(([, a]) => tagsFit(a.interface, sceneTag))
    .sort(([, a], [, b]) => rank(a.role) - rank(b.role))
  return keys[0]?.[0] ?? null
}
