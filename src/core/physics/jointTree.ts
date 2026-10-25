/**
 * Splits joints into a spanning forest and loop closures.
 *
 * Tree joints become Rapier multibody joints (reduced coordinates: the hinge cannot pull
 * apart, measured separation ~1e-5 mm vs 0.05-0.7 mm for impulse joints under a drag load).
 * A multibody must be a tree, so a joint that would close a loop (four-bar linkage, a part
 * hinged to two grounded parts) stays an impulse joint. All grounded bodies count as one
 * root ("ground"); a joint between two grounded bodies is dropped (nothing can move).
 *
 * Each tree joint is oriented parent -> child (Rapier's createMultibodyJoint order), found
 * by breadth-first search from ground, then from one body of each floating assembly.
 *
 * A multibody (everything joined below one root body) holds at most MAX_MULTIBODY_LINKS
 * links; a joint past that is an impulse joint too, and its child the root of a new
 * multibody. Rapier's multibody cost grows steeply with its links and one of ~135 trapped
 * (WASM `unreachable`, rapier3d-compat 0.19.2). Measured per step, hinged boxes, no contacts:
 * 120 on one hub 125 ms uncapped, 2.5 ms at 16; a 200-link chain 236 ms, 4.9 ms at 16.
 */
export const MAX_MULTIBODY_LINKS = 16

export interface TreeInput<J> {
  joint: J
  a: string
  b: string
}

export interface JointForest<J> {
  tree: { joint: J; parent: string; child: string }[]
  /** Impulse joints: loop closures, and joints past a multibody's link cap. */
  loops: J[]
}

export function splitJointTree<J>(
  bodies: readonly { id: string; grounded: boolean }[],
  joints: readonly TreeInput<J>[]
): JointForest<J> {
  const grounded = new Set(bodies.filter((b) => b.grounded).map((b) => b.id))
  const edges = new Map<string, { index: number; other: string }[]>()
  const link = (from: string, index: number, other: string) => {
    const list = edges.get(from)
    if (list) list.push({ index, other })
    else edges.set(from, [{ index, other }])
  }
  joints.forEach((j, index) => {
    link(j.a, index, j.b)
    link(j.b, index, j.a)
  })

  const used = new Set<number>()
  const reached = new Set<string>()
  const tree: JointForest<J>["tree"] = []
  const capped: J[] = []
  // Each body's multibody root, and each root's link count.
  const rootOf = new Map<string, string>()
  const links = new Map<string, number>()
  const search = (roots: string[]) => {
    const queue = [...roots]
    for (const r of roots) {
      reached.add(r)
      rootOf.set(r, r)
    }
    for (let i = 0; i < queue.length; i++) {
      const parent = queue[i] ?? ""
      const root = rootOf.get(parent) ?? parent
      for (const { index, other } of edges.get(parent) ?? []) {
        if (used.has(index) || reached.has(other)) continue
        used.add(index)
        reached.add(other)
        queue.push(other)
        const input = joints[index]
        if (!input) continue
        const count = links.get(root) ?? 0
        if (count >= MAX_MULTIBODY_LINKS) {
          capped.push(input.joint)
          rootOf.set(other, other)
          continue
        }
        links.set(root, count + 1)
        rootOf.set(other, root)
        tree.push({ joint: input.joint, parent, child: other })
      }
    }
  }
  search([...grounded])
  for (const body of bodies) if (!reached.has(body.id)) search([body.id])

  const loops = joints
    .filter((j, index) => !used.has(index) && !(grounded.has(j.a) && grounded.has(j.b)))
    .map((j) => j.joint)
  return { tree, loops: [...capped, ...loops] }
}
