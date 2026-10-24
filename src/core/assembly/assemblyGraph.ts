import type { AnchorId, Mate, MateId, PartId, SceneDocument } from "@/core/schema"
import { mateHolds } from "./mateCheck"
import { groupDofs, mechanismDof, type Joint } from "./mobility"
import { unionFind } from "./unionFind"

/** Something to tell the user about a mate (PLAN 8.4); none when it simply holds. */
export type MateIssue =
  | "suppressed"
  | "bothGrounded" // both ends are fixed to the ground: it can move nothing
  | "redundant" // both ends are already rigidly joined (fixed mates)
  | "closesLoop" // its ends are already joined through other mates: allowed, worth knowing
  | "unsatisfied" // the parts do not stand where it puts them (moved since, or a loop)

/** Parts joined by fixed mates: they move as one body. */
export interface RigidGroup {
  parts: PartId[]
  grounded: boolean
  mechanism: number
  /** Degrees of freedom relative to the ground: 0 grounded, its mechanism's with loops, the
   *  sum along its mates to the ground otherwise; null when its mechanism floats. */
  dof: number | null
}

/** Rigid groups joined by the other mates. */
export interface Mechanism {
  groups: number[]
  grounded: boolean
  /** Mates in effect between its groups (not suppressed, redundant or between grounds). */
  joints: Joint[]
  loops: number
  /** Its degrees of freedom: relative to the ground, or with its own 6 when it floats; null
   *  when too large to count with loops. */
  dof: number | null
}

export interface AssemblyGraph {
  groupOf: ReadonlyMap<PartId, number>
  groups: RigidGroup[]
  mechanisms: Mechanism[]
  issues: ReadonlyMap<MateId, MateIssue[]>
}

type Doc = Pick<SceneDocument, "parts" | "anchors" | "mates">

/**
 * The assembly as rigid groups and mechanisms (PLAN 8.4): fixed mates merge parts into groups
 * (union-find); the other mates join groups into mechanisms, where a mate whose ends are
 * already joined closes a loop (all grounded groups count as one ground). Each mate gets its
 * issues, each mechanism and group its degrees of freedom (`mobility.ts`). Linear in parts and
 * mates, plus the rank of a mechanism's constraints when it has loops.
 */
export function assemblyGraph(doc: Doc): AssemblyGraph {
  const parts = Object.values(doc.parts)
  const index = new Map(parts.map((p, i) => [p.id, i]))
  const issues = new Map<MateId, MateIssue[]>()
  const flag = (id: MateId, issue: MateIssue) => issues.get(id)?.push(issue)
  const partOf = (id: AnchorId) => {
    const anchor = Object.hasOwn(doc.anchors, id) ? doc.anchors[id] : undefined
    return anchor ? index.get(anchor.partId) : undefined
  }

  const rigid = unionFind(parts.length, (i) => parts[i]?.grounded ?? false)
  const others: { mate: Mate; i: number; j: number }[] = []
  for (const mate of Object.values(doc.mates)) {
    issues.set(mate.id, [])
    if (mate.suppressed) {
      flag(mate.id, "suppressed")
      continue
    }
    if (!mateHolds(doc, mate)) flag(mate.id, "unsatisfied")
    const [i, j] = [partOf(mate.anchorA), partOf(mate.anchorB)]
    if (i === undefined || j === undefined || i === j) continue
    if (mate.type !== "fixed") {
      others.push({ mate, i, j }) // joins rigid groups, below
      continue
    }
    if (rigid.find(i) === rigid.find(j)) flag(mate.id, "redundant")
    else if (rigid.isGrounded(i) && rigid.isGrounded(j)) flag(mate.id, "bothGrounded")
    rigid.union(i, j)
  }

  const groups: RigidGroup[] = []
  const groupOfRoot = new Map<number, number>()
  const groupOfIndex = parts.map((p, i) => {
    const root = rigid.find(i)
    let g = groupOfRoot.get(root)
    if (g === undefined) {
      g = groups.push({ parts: [], grounded: rigid.isGrounded(i), mechanism: -1, dof: null }) - 1
      groupOfRoot.set(root, g)
    }
    groups[g]?.parts.push(p.id)
    return g
  })
  const groupOf = new Map(parts.map((p, i) => [p.id, groupOfIndex[i] ?? 0]))

  // Mechanisms: groups joined by the other mates; loops counted with every ground as one.
  const joined = unionFind(groups.length)
  const treeless = unionFind(groups.length, (g) => groups[g]?.grounded ?? false)
  const grounds = groups.flatMap((g, k) => (g.grounded ? [k] : []))
  for (const k of grounds.slice(1)) treeless.union(k, grounds[0] ?? k)
  const joints: (Joint & { loop: boolean })[] = []
  for (const { mate, i, j } of others) {
    const [gi, gj] = [groupOfIndex[i] ?? 0, groupOfIndex[j] ?? 0]
    if (gi === gj) flag(mate.id, "redundant")
    else if (groups[gi]?.grounded && groups[gj]?.grounded) flag(mate.id, "bothGrounded")
    else {
      const loop = treeless.find(gi) === treeless.find(gj)
      if (loop) flag(mate.id, "closesLoop")
      treeless.union(gi, gj)
      joined.union(gi, gj)
      joints.push({ mate, gi, gj, loop })
    }
  }

  const mechanisms: Mechanism[] = []
  const mechanismOfRoot = new Map<number, number>()
  groups.forEach((g, k) => {
    const root = joined.find(k)
    let m = mechanismOfRoot.get(root)
    if (m === undefined) {
      m = mechanisms.push({ groups: [], grounded: false, joints: [], loops: 0, dof: null }) - 1
      mechanismOfRoot.set(root, m)
    }
    g.mechanism = m
    const mech = mechanisms[m]
    mech?.groups.push(k)
    if (mech && g.grounded) mech.grounded = true
  })
  for (const joint of joints) {
    const mech = mechanisms[groups[joint.gi]?.mechanism ?? 0]
    mech?.joints.push(joint)
    if (mech && joint.loop) mech.loops++
  }
  for (const mech of mechanisms) mech.dof = mechanismDof(doc, mech, groups)
  groupDofs(groups, mechanisms)
  return { groupOf, groups, mechanisms, issues }
}
