import { describe, expect, it } from "vitest"
import { splitJointTree } from "./jointTree"

const body = (id: string, grounded = false) => ({ id, grounded })
const j = (joint: string, a: string, b: string) => ({ joint, a, b })

describe("splitJointTree", () => {
  it("orients a chain from ground outward", () => {
    const forest = splitJointTree(
      [body("arm"), body("base", true), body("hand")],
      [j("wrist", "hand", "arm"), j("shoulder", "arm", "base")]
    )
    expect(forest.tree).toEqual([
      { joint: "shoulder", parent: "base", child: "arm" },
      { joint: "wrist", parent: "arm", child: "hand" },
    ])
    expect(forest.loops).toEqual([])
  })

  it("keeps a loop-closing joint as an impulse joint (four-bar linkage)", () => {
    const forest = splitJointTree(
      [body("ground", true), body("crank"), body("coupler"), body("rocker")],
      [
        j("A", "ground", "crank"),
        j("B", "crank", "coupler"),
        j("C", "coupler", "rocker"),
        j("D", "rocker", "ground"),
      ]
    )
    expect(forest.tree.map((t) => t.joint).sort()).toEqual(["A", "B", "D"])
    expect(forest.loops).toEqual(["C"])
  })

  it("treats all grounded bodies as one root", () => {
    const forest = splitJointTree(
      [body("g1", true), body("g2", true), body("door")],
      [j("h1", "g1", "door"), j("h2", "door", "g2"), j("weld", "g1", "g2")]
    )
    expect(forest.tree).toEqual([{ joint: "h1", parent: "g1", child: "door" }])
    expect(forest.loops).toEqual(["h2"]) // the ground-ground joint is dropped
  })

  it("roots floating assemblies at their first body", () => {
    const forest = splitJointTree([body("a"), body("b")], [j("pin", "b", "a")])
    expect(forest.tree).toEqual([{ joint: "pin", parent: "a", child: "b" }])
  })
})
