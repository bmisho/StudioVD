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
 */
export interface TreeInput<J> {
  joint: J
  a: string
  b: string
}

export interface JointForest<J> {
  tree: { joint: J; parent: string; child: string }[]
  loops: J[]
}

export function splitJointTree<J>(
  bodies: readonly { id: string; grounded: boolean }[],
  joints: readonly TreeInput<J>[]
): JointForest<J> {
  const grounded = new Set(bodies.filter((b) => b.grounded).map((b) => b.id))
  const edges = new Map<string, { index: number; other: string }[]>()
  joints.forEach((j, index) => {
    edges.set(j.a, [...(edges.get(j.a) ?? []), { index, other: j.b }])
    edges.set(j.b, [...(edges.get(j.b) ?? []), { index, other: j.a }])
  })

  const used = new Set<number>()
  const reached = new Set<string>()
  const tree: JointForest<J>["tree"] = []
  const search = (roots: string[]) => {
    const queue = [...roots]
    for (const r of roots) reached.add(r)
    for (let i = 0; i < queue.length; i++) {
      const parent = queue[i] ?? ""
      for (const { index, other } of edges.get(parent) ?? []) {
        if (used.has(index) || reached.has(other)) continue
        used.add(index)
        reached.add(other)
        queue.push(other)
        const input = joints[index]
        if (input) tree.push({ joint: input.joint, parent, child: other })
      }
    }
  }
  search([...grounded])
  for (const body of bodies) if (!reached.has(body.id)) search([body.id])

  const loops = joints
    .filter((j, index) => !used.has(index) && !(grounded.has(j.a) && grounded.has(j.b)))
    .map((j) => j.joint)
  return { tree, loops }
}
