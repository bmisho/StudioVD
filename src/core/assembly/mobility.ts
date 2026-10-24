import type { Mate, MateType, SceneDocument, Vec3 } from "@/core/schema"
import { matrixRank } from "@/core/math/rank"
import { cross, length, normalize, rotate, scale, sub } from "@/core/math/vec3"
import { anchorWorld } from "./mateSnap"

/** A mate between two rigid groups of a mechanism. */
export interface Joint {
  mate: Mate
  gi: number
  gj: number
  loop: boolean
}

interface GroupLike {
  grounded: boolean
  mechanism: number
  dof: number | null
}
interface MechanismLike {
  groups: number[]
  grounded: boolean
  joints: Joint[]
  loops: number
  dof: number | null
}

/** Degrees of freedom a joint takes away from the body it joins. */
const REMOVES: Record<Exclude<MateType, "fixed">, number> = {
  revolute: 5,
  prismatic: 5,
  spherical: 3,
}
const removes = (type: MateType) => (type === "fixed" ? 6 : REMOVES[type])

/** Past this many moving groups a loop's constraints are not ranked (dense elimination). */
export const MAX_RANKED_GROUPS = 60

/**
 * A mechanism's degrees of freedom. Without loops, a count: each joint leaves 6 minus what
 * it removes, plus 6 when nothing in it is grounded. With loops a count (Grübler's) fails in
 * common cases (a planar four-bar counts −2 but moves with 1), so: 6 per moving group minus
 * the rank of the joints' velocity constraints at the current pose. Null past
 * MAX_RANKED_GROUPS moving groups.
 */
export function mechanismDof(
  doc: Pick<SceneDocument, "parts" | "anchors">,
  mech: MechanismLike,
  groups: readonly GroupLike[]
): number | null {
  if (mech.loops === 0) {
    const free = mech.joints.reduce((sum, j) => sum + 6 - removes(j.mate.type), 0)
    return (mech.grounded ? 0 : 6) + free
  }
  const moving = mech.groups.filter((g) => !groups[g]?.grounded)
  if (moving.length > MAX_RANKED_GROUPS) return null
  const column = new Map(moving.map((g, k) => [g, 6 * k]))
  const points = mech.joints.map((j) => jointFrame(doc, j.mate))
  // Points relative to their centroid over their spread: rotation and translation columns of
  // one size, so the rank tolerance means the same for both.
  const centre = scale(
    points.reduce<Vec3>((s, p) => [s[0] + p.at[0], s[1] + p.at[1], s[2] + p.at[2]], [0, 0, 0]),
    1 / Math.max(1, points.length)
  )
  const spread = Math.max(1, ...points.map((p) => length(sub(p.at, centre))))
  const rows: number[][] = []
  mech.joints.forEach((joint, k) => {
    const frame = points[k]
    if (!frame) return
    const p = scale(sub(frame.at, centre), 1 / spread)
    const row = (v: Vec3, w: Vec3) => {
      const r = new Array<number>(6 * moving.length).fill(0)
      for (const [g, sign] of [[joint.gi, 1] as const, [joint.gj, -1] as const]) {
        const c = column.get(g)
        if (c === undefined) continue // a grounded group does not move
        for (let i = 0; i < 3; i++) {
          r[c + i] = sign * (v[i] ?? 0)
          r[c + 3 + i] = sign * (w[i] ?? 0)
        }
      }
      rows.push(r)
    }
    // The velocity of the point p on a body: v + ω × p, and d·(ω × p) = ω·(p × d).
    const point = (d: Vec3) => row(d, cross(p, d))
    const turn = (d: Vec3) => row([0, 0, 0], d)
    const [u, w] = perpendiculars(frame.axis)
    const axes: Vec3[] = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ]
    if (joint.mate.type === "spherical" || joint.mate.type === "revolute") axes.forEach(point)
    if (joint.mate.type === "revolute") [u, w].forEach(turn)
    if (joint.mate.type === "prismatic") {
      axes.forEach(turn)
      ;[u, w].forEach(point)
    }
  })
  return 6 * moving.length - matrixRank(rows)
}

/** Where a joint acts and along which axis: anchor A's origin and z, in world coordinates. */
function jointFrame(doc: Pick<SceneDocument, "parts" | "anchors">, mate: Mate) {
  const a = Object.hasOwn(doc.anchors, mate.anchorA) ? doc.anchors[mate.anchorA] : undefined
  const part = a && (Object.hasOwn(doc.parts, a.partId) ? doc.parts[a.partId] : undefined)
  if (!a || !part) return { at: [0, 0, 0] as Vec3, axis: [0, 0, 1] as Vec3 }
  const world = anchorWorld(part, a)
  return { at: world.t, axis: rotate(world.q, [0, 0, 1]) }
}

/** Two unit vectors perpendicular to `a` and to each other. */
function perpendiculars(a: Vec3): [Vec3, Vec3] {
  const u = normalize(cross(a, Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]))
  return [u, cross(a, u)]
}

/**
 * Each group's degrees of freedom relative to the ground: 0 when grounded; in a loop-free
 * grounded mechanism, the sum of what the joints leave on its path from the ground (breadth
 * first); with loops, the mechanism's; null when its mechanism floats.
 */
export function groupDofs(groups: GroupLike[], mechanisms: readonly MechanismLike[]): void {
  for (const mech of mechanisms) {
    for (const g of mech.groups) {
      const group = groups[g]
      if (group) group.dof = group.grounded ? 0 : mech.grounded && mech.loops > 0 ? mech.dof : null
    }
    if (!mech.grounded || mech.loops > 0) continue
    const next = new Map<number, { other: number; left: number }[]>()
    for (const j of mech.joints) {
      const left = 6 - removes(j.mate.type)
      next.set(j.gi, [...(next.get(j.gi) ?? []), { other: j.gj, left }])
      next.set(j.gj, [...(next.get(j.gj) ?? []), { other: j.gi, left }])
    }
    const queue = mech.groups.filter((g) => groups[g]?.grounded)
    for (let k = 0; k < queue.length; k++) {
      const g = queue[k] ?? 0
      const base = groups[g]?.dof ?? 0
      for (const { other, left } of next.get(g) ?? []) {
        const group = groups[other]
        if (!group || group.dof !== null) continue
        group.dof = base + left
        queue.push(other)
      }
    }
  }
}
