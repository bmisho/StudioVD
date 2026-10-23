import type { FaceInfo } from "@/core/geometry/meshData"
import type { SnapArc, SnapCorner, SnapFeatures, SnapLine } from "@/core/geometry/snapFeatures"
import { add, dot, length, normalize, scale, sub } from "@/core/math/vec3"
import type { AnchorSource, Frame, Vec3 } from "@/core/schema"
import { anchorFrame, diameterLabel } from "./anchorFrames"

/** How close (CSS px) the cursor must be to a corner, midpoint or centre to snap to it. */
export const SNAP_THRESHOLD_PX = 12

export type SnapKind = "corner" | "edgeMid" | "circle" | "faceCentre" | "axis" | "face" | "surface"

/** What the Place Anchor tool would place under the cursor (PLAN 7.2). */
export interface AnchorCandidate {
  snap: SnapKind
  kind: "point" | "planar" | "axial"
  /** Part-local. */
  frame: Frame
  source: AnchorSource
  /** The new anchor's name. */
  name: string
  /** What the cursor snapped to, for the tool's hint. */
  hint: string
  /** Drawn while hovering: the edge or circle snapped to. */
  feature:
    | { type: "segment"; a: Vec3; b: Vec3 }
    | { type: "circle"; centre: Vec3; axis: Vec3; radius: number }
    | null
}

export interface SnapQuery {
  /** The hit, part-local. */
  point: Vec3
  /** The hit triangle's outward normal, part-local. */
  normal: Vec3
  triangle: number
  /** Unit direction from the hit towards the camera, part-local. */
  toViewer: Vec3
  faces: readonly FaceInfo[]
  features: SnapFeatures | null
  /** Part-local point -> client coordinates (CSS px). */
  toScreen: (p: Vec3) => { x: number; y: number }
  cursor: { x: number; y: number }
  thresholdPx?: number
}

/** The face holding triangle `t` (faces are sorted, disjoint triangle ranges), or -1. */
export function faceOfTriangle(faces: readonly FaceInfo[], t: number): number {
  let lo = 0
  let hi = faces.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const f = faces[mid]
    if (!f) return -1
    if (t < f.first) hi = mid - 1
    else if (t > f.last) lo = mid + 1
    else return mid
  }
  return -1
}

interface NearFace {
  corners: SnapCorner[]
  lines: SnapLine[]
  arcs: SnapArc[]
}
const byFace = new WeakMap<SnapFeatures, Map<number, NearFace>>()

/** The corners and edges on the boundary of each face, built once per feature set. */
function nearFace(features: SnapFeatures, face: number): NearFace {
  let index = byFace.get(features)
  if (!index) {
    const map = new Map<number, NearFace>()
    const of = (f: number) => {
      let entry = map.get(f)
      if (!entry) map.set(f, (entry = { corners: [], lines: [], arcs: [] }))
      return entry
    }
    for (const c of features.corners) for (const f of c.faces) of(f).corners.push(c)
    for (const e of features.edges)
      for (const f of new Set(e.faces)) {
        if (f < 0) continue
        if (e.kind === "line") of(f).lines.push(e)
        else of(f).arcs.push(e)
      }
    byFace.set(features, (index = map))
  }
  return index.get(face) ?? { corners: [], lines: [], arcs: [] }
}

/** Nearest item within the threshold, by screen distance. */
function nearest<T>(items: readonly T[], distance: (item: T) => number, threshold: number) {
  let best: T | null = null
  let bestD = threshold
  for (const item of items) {
    const d = distance(item)
    if (d <= bestD) {
      best = item
      bestD = d
    }
  }
  return best
}

const sourceOf = (face: number): AnchorSource =>
  face >= 0 ? { kind: "face", faceIndex: face } : { kind: "manual" }
/** `v` or its opposite, whichever points along `towards`. */
const facing = (v: Vec3, towards: Vec3): Vec3 => (dot(v, towards) < 0 ? scale(v, -1) : v)

/** "Hole Ø8", "Shaft Ø8" or "Circle Ø8", from the sense of the cylinder beside the edge. */
function roundName(features: SnapFeatures | null, faces: readonly number[], radius: number) {
  const sense = faces.map((f) => features?.cylinderSense[f] ?? 0).find((s) => s !== 0) ?? 0
  return `${sense < 0 ? "Hole" : sense > 0 ? "Shaft" : "Circle"} ${diameterLabel(radius)}`
}

/**
 * The anchor the cursor would place (PLAN 7.3): a corner, else an edge midpoint, else a
 * circle centre (cursor near the rim or the centre), else the face centre, each within the
 * pixel threshold and on the boundary of the face under the cursor; otherwise the hit itself
 * (a cylinder's axis, a plane, or a point on any other surface).
 */
export function snapCandidate(q: SnapQuery): AnchorCandidate {
  const threshold = q.thresholdPx ?? SNAP_THRESHOLD_PX
  const face = faceOfTriangle(q.faces, q.triangle)
  const info = face >= 0 ? q.faces[face] : undefined
  const normal = info?.kind === "plane" && info.normal ? info.normal : normalize(q.normal)
  const px = (p: Vec3) => {
    const s = q.toScreen(p)
    return Math.hypot(s.x - q.cursor.x, s.y - q.cursor.y)
  }
  const near = q.features ? nearFace(q.features, face) : null

  const corner = near && nearest(near.corners, (c) => px(c.at), threshold)
  if (corner)
    return {
      snap: "corner",
      kind: "point",
      frame: anchorFrame(corner.at, normal),
      source: { kind: "vertex", vertexIndex: corner.vertex },
      name: "Vertex",
      hint: "Vertex",
      feature: null,
    }
  const mid = (l: SnapLine) => scale(add(l.start, l.end), 0.5)
  const line = near && nearest(near.lines, (l) => px(mid(l)), threshold)
  if (line)
    return {
      snap: "edgeMid",
      kind: "point",
      frame: anchorFrame(mid(line), normal, sub(line.end, line.start)),
      source: sourceOf(face),
      name: "Edge midpoint",
      hint: "Edge midpoint",
      feature: { type: "segment", a: line.start, b: line.end },
    }
  const rimPx = (a: SnapArc) => {
    const off = sub(q.point, a.centre)
    const radial = sub(off, scale(a.axis, dot(off, a.axis)))
    const l = length(radial)
    const rim = l > 1e-9 ? add(a.centre, scale(radial, a.radius / l)) : a.centre
    return Math.min(px(a.centre), px(rim))
  }
  const arc = near && nearest(near.arcs, rimPx, threshold)
  if (arc) {
    // Out of the planar face around a hole's mouth; on a cylinder's wall, towards the viewer.
    const z = facing(arc.axis, info?.kind === "plane" ? normal : q.toViewer)
    const round = arc.faces.find((f) => q.faces[f]?.kind === "cylinder") ?? face
    const name = roundName(q.features, arc.faces, arc.radius)
    return {
      snap: "circle",
      kind: "axial",
      frame: anchorFrame(arc.centre, z),
      source: sourceOf(round),
      name,
      hint: `${name} centre`,
      feature: { type: "circle", centre: arc.centre, axis: arc.axis, radius: arc.radius },
    }
  }
  if (info?.kind === "plane" && info.point && px(info.point) <= threshold)
    return planar(info.point, normal, face, "Face centre")
  if (info?.kind === "cylinder" && info.axis && info.point && info.radiusMm !== undefined) {
    const foot = add(info.point, scale(info.axis, dot(sub(q.point, info.point), info.axis)))
    const name = roundName(q.features, [face], info.radiusMm)
    return {
      snap: "axis",
      kind: "axial",
      frame: anchorFrame(foot, facing(info.axis, q.toViewer)),
      source: sourceOf(face),
      name,
      hint: `${name} axis`,
      feature: null,
    }
  }
  if (info?.kind === "plane" && info.point) {
    const onPlane = sub(q.point, scale(normal, dot(sub(q.point, info.point), normal)))
    return planar(onPlane, normal, face, "Face")
  }
  return {
    snap: "surface",
    kind: "point",
    frame: anchorFrame(q.point, normal),
    source: sourceOf(face),
    name: "Point",
    hint: "Point on surface",
    feature: null,
  }
}

function planar(origin: Vec3, normal: Vec3, face: number, hint: string): AnchorCandidate {
  return {
    snap: hint === "Face" ? "face" : "faceCentre",
    kind: "planar",
    frame: anchorFrame(origin, normal),
    source: sourceOf(face),
    name: "Face",
    hint,
    feature: null,
  }
}
