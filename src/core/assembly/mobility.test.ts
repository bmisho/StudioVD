// @vitest-environment node
import { describe, expect, it } from "vitest"
import { normalize } from "@/core/math/vec3"
import type { Vec3 } from "@/core/schema"
import { assemblyGraph } from "./assemblyGraph"
import { dofOf, graphOf, groundedDof, joint } from "./testing/graphFixtures"
import { mateDoc, part, prng } from "./testing/mateFixtures"

const tilted = (rad: number): Vec3 => normalize([0, Math.sin(rad), Math.cos(rad)])

describe("degrees of freedom within what imported geometry gives", () => {
  it("a double hinge on one axis turns, within 1e-7 rad and 1e-5 mm; 1e-3 rad locks it", () => {
    const [g, link] = [part("G", true), part("Link")]
    const dofs = (at: Vec3, axis: Vec3) => {
      const { graph } = graphOf([g, link], [joint(g, link, [0, 0, 0]), joint(g, link, at, axis)])
      return [groundedDof(graph), dofOf(graph, link)]
    }
    expect(dofs([0, 0, 30], tilted(1e-7))).toEqual([1, 1])
    expect(dofs([1e-5, 0, 30], [0, 0, 1])).toEqual([1, 1])
    expect(dofs([0, 0, 30], tilted(1e-3))).toEqual([0, 0])
  })

  it("a planar four-bar with one axis 1e-7 rad off still moves with 1 DOF", () => {
    const [g, crank, coupler, rocker] = [part("G", true), part("C"), part("K"), part("R")]
    const { graph } = graphOf(
      [g, crank, coupler, rocker],
      [
        joint(g, crank, [0, 0, 0]),
        joint(crank, coupler, [0, 20, 0], tilted(1e-7)),
        joint(coupler, rocker, [40, 25, 0]),
        joint(rocker, g, [45, 0, 0]),
      ]
    )
    expect(groundedDof(graph)).toBe(1)
  })
})

describe("each part's degrees of freedom", () => {
  it("in a loop, how the part itself moves: a locked link 0, the link hinged to it 1", () => {
    const [g, locked, swing] = [part("G", true), part("Locked"), part("Swing")]
    const { graph } = graphOf(
      [g, locked, swing],
      [
        joint(g, locked, [0, 0, 0]),
        joint(g, locked, [0, 0, 30], [1, 0, 0]),
        joint(locked, swing, [10, 0, 0]),
      ]
    )
    expect([groundedDof(graph), dofOf(graph, locked), dofOf(graph, swing)]).toEqual([1, 0, 1])
  })

  it("along a chain, at most 6: ball joints 3, 5, 6; coaxial hinges in series 1 and 1", () => {
    const [g, l1, l2, l3] = [part("G", true), part("L1"), part("L2"), part("L3")]
    const balls = graphOf(
      [g, l1, l2, l3],
      [
        joint(g, l1, [0, 0, 0], [0, 0, 1], "spherical"),
        joint(l1, l2, [10, 0, 0], [0, 0, 1], "spherical"),
        joint(l2, l3, [10, 10, 0], [0, 0, 1], "spherical"),
      ]
    ).graph
    expect([l1, l2, l3].map((p) => dofOf(balls, p))).toEqual([3, 5, 6])
    expect(groundedDof(balls)).toBe(9)
    const coaxial = graphOf(
      [g, l1, l2],
      [joint(g, l1, [0, 0, 0]), joint(l1, l2, [0, 0, 20], tilted(1e-7))]
    ).graph
    expect([dofOf(coaxial, l1), dofOf(coaxial, l2), groundedDof(coaxial)]).toEqual([1, 1, 2])
    const cylinder = graphOf(
      [g, l1, l2],
      [joint(g, l1, [0, 0, 0]), joint(l1, l2, [0, 0, 20], [0, 0, 1], "prismatic")]
    ).graph
    expect(dofOf(cylinder, l2)).toBe(2) // turns and slides on one axis
  })
})

describe("cost", () => {
  it("ranks 60 moving parts held by 20,000 mates in well under the 14 s it took row by row", () => {
    const random = prng(8)
    const parts = [part("G", true), ...Array.from({ length: 60 }, (_, i) => part(`P${i}`))]
    const pick = () => parts[Math.floor(random() * parts.length)] ?? parts[0]
    const coord = () => (random() - 0.5) * 200
    const joints = Array.from({ length: 20_000 }, () => {
      const p = pick()
      let q = pick()
      while (q === p) q = pick()
      if (!p || !q) throw new Error("no parts")
      return joint(p, q, [coord(), coord(), coord()], normalize([random(), random(), 1]))
    })
    const doc = mateDoc(
      parts,
      joints.flatMap((j) => j.anchors),
      joints.map((j) => j.mate)
    )
    const start = performance.now()
    const graph = assemblyGraph(doc)
    expect(performance.now() - start).toBeLessThan(2000) // ~0.4 s here
    expect(groundedDof(graph)).toBe(0)
  }, 30_000)
})
