import type { Mate, MateType, SceneDocument } from "@/core/schema"
import { psdNullSpace, spanBasis } from "@/core/math/nullSpace"
import { constraintBlock, freedoms, jointAxes, type Twist } from "./jointMotion"

/** A mate between two rigid groups of a mechanism. */
export interface Joint {
  mate: Mate
  gi: number
  gj: number
  loop: boolean
}

interface GroupLike {
  grounded: boolean
  dof: number | null
}
interface MechanismLike {
  groups: number[]
  grounded: boolean
  joints: Joint[]
  loops: number
  dof: number | null
}

type Doc = Pick<SceneDocument, "parts" | "anchors">

/** Degrees of freedom a joint takes away from the body it joins. */
const REMOVES: Record<Exclude<MateType, "fixed">, number> = {
  revolute: 5,
  prismatic: 5,
  spherical: 3,
}
const removes = (type: MateType) => (type === "fixed" ? 6 : REMOVES[type])

/** Past this many moving groups a loop's constraints are not ranked (360 columns). */
export const MAX_RANKED_GROUPS = 60

const unit = ([v, w]: Twist) => {
  const l = Math.hypot(...v, ...w)
  return [...v, ...w].map((x) => x / l)
}

/**
 * A mechanism's degrees of freedom and its groups' (PLAN 8.4); grounded groups 0, groups of a
 * floating mechanism null. Without loops the mechanism's is a count: each joint leaves 6 minus
 * what it removes, plus 6 when nothing in it is grounded. With loops a count (Grübler's) fails
 * in common cases (a planar four-bar counts −2 but moves with 1), so: 6 per moving group minus
 * the rank of the joints' velocity constraints at the current pose (null past
 * MAX_RANKED_GROUPS). A group's own is how it can move: at most 6, however many joints.
 */
export function mobility(doc: Doc, mech: MechanismLike, groups: readonly GroupLike[]): void {
  for (const g of mech.groups) {
    const group = groups[g]
    if (group) group.dof = group.grounded ? 0 : null
  }
  if (mech.loops > 0) {
    loopMobility(doc, mech, groups)
    return
  }
  mech.dof = mech.joints.reduce((sum, j) => sum + 6 - removes(j.mate.type), mech.grounded ? 0 : 6)
  if (mech.grounded) treeMobility(doc, mech, groups)
}

/**
 * Loop-free on the ground: a group moves as the joints on its path from the (one) grounded
 * group let it, all together: the dimension of their freedoms' span, breadth first.
 */
function treeMobility(doc: Doc, mech: MechanismLike, groups: readonly GroupLike[]) {
  const { axes, tolerance } = jointAxes(
    doc,
    mech.joints.map((j) => j.mate)
  )
  const next = new Map<number, { other: number; k: number }[]>()
  const link = (from: number, other: number, k: number) => {
    const list = next.get(from)
    if (list) list.push({ other, k })
    else next.set(from, [{ other, k }])
  }
  mech.joints.forEach((j, k) => {
    link(j.gi, j.gj, k)
    link(j.gj, j.gi, k)
  })
  const span = new Map<number, number[][]>()
  const queue = mech.groups.filter((g) => groups[g]?.grounded)
  for (const g of queue) span.set(g, [])
  for (let i = 0; i < queue.length; i++) {
    const g = queue[i] ?? 0
    for (const { other, k } of next.get(g) ?? []) {
      const [joint, axis] = [mech.joints[k], axes[k]]
      if (span.has(other) || !joint || !axis) continue
      const basis = spanBasis(freedoms(joint.mate.type, axis).map(unit), tolerance, span.get(g))
      span.set(other, basis)
      const group = groups[other]
      if (group) group.dof = basis.length
      queue.push(other)
    }
  }
}

/**
 * With loops: the null space of the joints' constraint rows (6 columns per moving group), from
 * their Gram matrix, so the cost grows with the groups, not the mates. A group's DOF is the
 * rank of the null space's part for its columns: a link locked between two crossing hinges
 * has 0, whatever moves elsewhere.
 */
function loopMobility(doc: Doc, mech: MechanismLike, groups: readonly GroupLike[]) {
  const moving = mech.groups.filter((g) => !groups[g]?.grounded)
  if (moving.length > MAX_RANKED_GROUPS) {
    mech.dof = null
    return
  }
  const column = new Map(moving.map((g, k) => [g, 6 * k]))
  const { axes, tolerance } = jointAxes(
    doc,
    mech.joints.map((j) => j.mate)
  )
  // Joints repeated between two groups weigh as one: their errors add up, not the tolerance.
  const pair = (j: Joint) =>
    [column.get(j.gi) ?? -1, column.get(j.gj) ?? -1].sort((x, y) => x - y).join()
  const repeats = new Map<string, number>()
  for (const j of mech.joints) repeats.set(pair(j), (repeats.get(pair(j)) ?? 0) + 1)
  const n = 6 * moving.length
  const gram = new Float64Array(n * n)
  const add = (r: number, c: number, block: Float64Array, s: number) => {
    for (let i = 0; i < 6; i++)
      for (let j = 0; j < 6; j++) {
        const at = (r + i) * n + c + j
        gram[at] = (gram[at] ?? 0) + s * (block[i * 6 + j] ?? 0)
      }
  }
  // A joint's rows are c on gi's columns and −c on gj's: its block B = Σ c cᵀ goes on both
  // diagonals and −B across. A grounded group has no columns: it does not move.
  mech.joints.forEach((joint, k) => {
    const axis = axes[k]
    if (!axis) return
    const block = constraintBlock(joint.mate.type, axis)
    const s = 1 / (repeats.get(pair(joint)) ?? 1) // the rows' weight, squared
    const [ci, cj] = [column.get(joint.gi), column.get(joint.gj)]
    if (ci !== undefined) add(ci, ci, block, s)
    if (cj !== undefined) add(cj, cj, block, s)
    if (ci === undefined || cj === undefined) return
    add(ci, cj, block, -s)
    add(cj, ci, block, -s)
  })
  const { rank, basis } = psdNullSpace(gram, n, tolerance ** 2)
  mech.dof = n - rank
  if (!mech.grounded) return
  const modes = spanBasis(basis, 1e-12) // orthonormal, so a part's share has a size
  for (const g of moving) {
    const c = column.get(g) ?? 0
    const group = groups[g]
    if (group)
      group.dof = spanBasis(
        modes.map((m) => m.slice(c, c + 6)),
        tolerance
      ).length
  }
}
