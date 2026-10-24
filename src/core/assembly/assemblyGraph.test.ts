import { describe, expect, it } from "vitest"
import type { Vec3 } from "@/core/schema"
import { assemblyGraph } from "./assemblyGraph"
import { anchor, mate, mateDoc, part } from "./testing/mateFixtures"

// Parts at the identity pose with anchors at shared world points: every mate holds as built.
const hinge = (
  p: ReturnType<typeof part>,
  q: ReturnType<typeof part>,
  at: Vec3,
  axis: Vec3 = [0, 0, 1],
  type: "revolute" | "fixed" | "prismatic" | "spherical" = "revolute"
) => {
  const x: Vec3 = Math.abs(axis[0]) > 0.9 ? [0, 1, 0] : [1, 0, 0]
  const [a, b] = [anchor(p, at, axis, x), anchor(q, at, axis, x)]
  return { anchors: [a, b], mate: mate(a, b, type) }
}
function graphOf(parts: ReturnType<typeof part>[], joints: ReturnType<typeof hinge>[]) {
  const doc = mateDoc(
    parts,
    joints.flatMap((j) => j.anchors),
    joints.map((j) => j.mate)
  )
  return { doc, graph: assemblyGraph(doc) }
}
const dofOf = (g: ReturnType<typeof assemblyGraph>, p: ReturnType<typeof part>) =>
  g.groups[g.groupOf.get(p.id) ?? -1]?.dof

describe("assembly graph", () => {
  it("a hinge on the ground: 1 DOF; a two-link chain: 2 at its tip; a fixed mate: 0", () => {
    const [ground, l1, l2, bolted] = [part("G", true), part("L1"), part("L2"), part("Bolted")]
    const { graph } = graphOf(
      [ground, l1, l2, bolted],
      [
        hinge(ground, l1, [0, 0, 0]),
        hinge(l1, l2, [0, 50, 0]),
        hinge(ground, bolted, [9, 9, 9], [0, 0, 1], "fixed"),
      ]
    )
    expect([
      dofOf(graph, l1),
      dofOf(graph, l2),
      dofOf(graph, bolted),
      dofOf(graph, ground),
    ]).toEqual([1, 2, 0, 0])
    expect(graph.groupOf.get(bolted.id)).toBe(graph.groupOf.get(ground.id)) // one rigid group
    expect(graph.mechanisms.find((m) => m.grounded)?.dof).toBe(2)
    for (const issues of graph.issues.values()) expect(issues).toEqual([])
  })

  it("parts floating together: 6 plus their joints, no DOF relative to the ground", () => {
    const [p, q] = [part("P"), part("Q")]
    const { graph } = graphOf([p, q], [hinge(p, q, [1, 2, 3])])
    expect(graph.mechanisms.map((m) => m.dof)).toEqual([7])
    expect(dofOf(graph, q)).toBeNull()
  })

  it("a planar four-bar moves with 1 DOF (Grübler would count -2), one mate closing the loop", () => {
    const [g, crank, coupler, rocker] = [
      part("G", true),
      part("Crank"),
      part("Coupler"),
      part("Rocker"),
    ]
    const { graph } = graphOf(
      [g, crank, coupler, rocker],
      [
        hinge(g, crank, [0, 0, 0]),
        hinge(crank, coupler, [0, 20, 0]),
        hinge(coupler, rocker, [40, 25, 0]),
        hinge(rocker, g, [45, 0, 0]),
      ]
    )
    const mech = graph.mechanisms.find((m) => m.grounded)
    expect([mech?.loops, mech?.dof, dofOf(graph, coupler)]).toEqual([1, 1, 1])
    expect([...graph.issues.values()].filter((i) => i.includes("closesLoop"))).toHaveLength(1)
  })

  it("a link hinged to the ground twice: 1 DOF on one axis, 0 on crossing axes", () => {
    const [g, link] = [part("G", true), part("Link")]
    const coaxial = graphOf([g, link], [hinge(g, link, [0, 0, 0]), hinge(g, link, [0, 0, 30])])
    expect(coaxial.graph.mechanisms.find((m) => m.grounded)?.dof).toBe(1)
    const crossing = graphOf(
      [g, link],
      [hinge(g, link, [0, 0, 0]), hinge(g, link, [0, 0, 30], [1, 0, 0])]
    )
    expect(crossing.graph.mechanisms.find((m) => m.grounded)?.dof).toBe(0)
  })

  it("flags mates that move nothing, are redundant, no longer hold or are suppressed", () => {
    const [g1, g2, p, q] = [part("G1", true), part("G2", true), part("P"), part("Q")]
    const grounds = hinge(g1, g2, [0, 0, 0])
    const bolt = hinge(p, q, [5, 0, 0], [0, 0, 1], "fixed")
    const extra = hinge(p, q, [6, 0, 0]) // a hinge between parts already bolted together
    const { doc, graph } = graphOf([g1, g2, p, q], [grounds, bolt, extra])
    expect(graph.issues.get(grounds.mate.id)).toEqual(["bothGrounded"])
    expect(graph.issues.get(extra.mate.id)).toEqual(["redundant"])
    const moved = {
      ...doc,
      parts: {
        ...doc.parts,
        [q.id]: { ...q, pose: { positionMm: [1, 0, 0] as Vec3, quaternion: q.pose.quaternion } },
      },
    }
    expect(assemblyGraph(moved).issues.get(bolt.mate.id)).toEqual(["unsatisfied"])
    const off = {
      ...doc,
      mates: { ...doc.mates, [bolt.mate.id]: { ...bolt.mate, suppressed: true } },
    }
    expect(assemblyGraph(off).issues.get(bolt.mate.id)).toEqual(["suppressed"])
  })
})
