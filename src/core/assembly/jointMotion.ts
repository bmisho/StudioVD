import type { Mate, MateType, SceneDocument, Vec3 } from "@/core/schema"
import { cross, length, normalize, rotate, scale, sub } from "@/core/math/vec3"
import { MATE_ANGLE_TOLERANCE_RAD, MATE_POSITION_TOLERANCE_MM } from "./mateCheck"
import { anchorWorld } from "./mateSnap"

/** Where a joint acts and along which axis, in a mechanism's normalised coordinates. */
export interface JointAxis {
  at: Vec3
  axis: Vec3
}

/** A body's motion as a twist: the velocity of the point at the origin, and the turn rate. */
export type Twist = readonly [Vec3, Vec3]

const AXES: readonly Vec3[] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
]

/** How far zero may be off: ten times what `mateHolds` allows, in normalised units. */
const SLACK = 10

/**
 * Each mate's anchor A origin and z in world coordinates, the origins taken relative to their
 * centroid over their spread: rotations and translations then have one size. Also what counts
 * as zero in that size (a singular value, or a remainder): what `mateHolds` lets a held mate be
 * off, times SLACK, so geometry as exact as imports give (bore rims ~1e-7 apart) still moves.
 */
export function jointAxes(doc: Pick<SceneDocument, "parts" | "anchors">, mates: readonly Mate[]) {
  const world = mates.map((mate) => {
    const a = Object.hasOwn(doc.anchors, mate.anchorA) ? doc.anchors[mate.anchorA] : undefined
    const part = a && (Object.hasOwn(doc.parts, a.partId) ? doc.parts[a.partId] : undefined)
    if (!a || !part) return { at: [0, 0, 0] as Vec3, axis: [0, 0, 1] as Vec3 }
    const frame = anchorWorld(part, a)
    return { at: frame.t, axis: rotate(frame.q, [0, 0, 1]) }
  })
  const sum = world.reduce<Vec3>(
    (s, p) => [s[0] + p.at[0], s[1] + p.at[1], s[2] + p.at[2]],
    [0, 0, 0]
  )
  const centre = scale(sum, 1 / Math.max(1, world.length))
  const spread = world.reduce((s, p) => Math.max(s, length(sub(p.at, centre))), 1)
  const axes: JointAxis[] = world.map((p) => ({
    at: scale(sub(p.at, centre), 1 / spread),
    axis: p.axis,
  }))
  const tolerance = SLACK * Math.max(MATE_ANGLE_TOLERANCE_RAD, MATE_POSITION_TOLERANCE_MM / spread)
  return { axes, tolerance }
}

/** Two unit vectors perpendicular to `a` and to each other. */
function perpendiculars(a: Vec3): [Vec3, Vec3] {
  const u = normalize(cross(a, Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]))
  return [u, cross(a, u)]
}

/**
 * What a joint keeps equal between its two bodies, as rows (on the twist difference) that
 * must be zero: a point's velocity along d, d·(v + ω × p) = d·v + ω·(p × d); a turn rate
 * about d, d·ω. Revolute: the point, two turns; prismatic: the point across the axis, all
 * turns; spherical: the point.
 */
export function constraints(type: MateType, { at, axis }: JointAxis): Twist[] {
  const point = (d: Vec3): Twist => [d, cross(at, d)]
  const turn = (d: Vec3): Twist => [[0, 0, 0], d]
  const [u, w] = perpendiculars(axis)
  if (type === "spherical") return AXES.map(point)
  if (type === "revolute") return [...AXES.map(point), turn(u), turn(w)]
  if (type === "prismatic") return [point(u), point(w), ...AXES.map(turn)]
  return [...AXES.map(point), ...AXES.map(turn)]
}

/** Σ c cᵀ over a joint's constraints c (as 6-vectors): its 6 x 6 block of JᵀJ, row-major. */
export function constraintBlock(type: MateType, axis: JointAxis): Float64Array {
  const block = new Float64Array(36)
  for (const [v, w] of constraints(type, axis)) {
    const c = [...v, ...w]
    for (let i = 0; i < 6; i++)
      for (let j = 0; j < 6; j++)
        block[i * 6 + j] = (block[i * 6 + j] ?? 0) + (c[i] ?? 0) * (c[j] ?? 0)
  }
  return block
}

/**
 * What a joint lets one body do relative to the other, as twists: a turn about the axis
 * through p (the origin then moves with p × ω), a slide along it, or turns about p.
 */
export function freedoms(type: MateType, { at, axis }: JointAxis): Twist[] {
  const turn = (a: Vec3): Twist => [cross(at, a), a]
  if (type === "revolute") return [turn(axis)]
  if (type === "prismatic") return [[axis, [0, 0, 0]]]
  if (type === "spherical") return AXES.map(turn)
  return []
}
