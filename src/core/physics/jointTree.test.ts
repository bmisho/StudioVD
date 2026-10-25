import { describe, expect, it } from "vitest"
import { MAX_MULTIBODY_LINKS, splitJointTree } from "./jointTree"

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

  // Security review: one multibody of ~135 hinged parts trapped Rapier (WASM `unreachable`),
  // and its step cost grows steeply (64 links on one hub: 24 ms; capped at 16: 1.5 ms).
  it("caps a multibody at MAX_MULTIBODY_LINKS: further joints are impulse joints", () => {
    const n = 3 * MAX_MULTIBODY_LINKS
    const leaves = Array.from({ length: n }, (_, i) => body(`p${i}`))
    const star = splitJointTree(
      [body("hub", true), ...leaves],
      leaves.map((b, i) => j(`h${i}`, "hub", b.id))
    )
    expect(star.tree).toHaveLength(MAX_MULTIBODY_LINKS)
    expect(star.loops).toHaveLength(n - MAX_MULTIBODY_LINKS)
    // A chain: past the cap a link starts a multibody of its own (rooted at that body).
    const chain = splitJointTree(
      [body("base", true), ...leaves],
      leaves.map((b, i) => j(`c${i}`, i === 0 ? "base" : `p${i - 1}`, b.id))
    )
    expect(chain.loops).toEqual(["c16", "c33"])
  })

  it("is linear in the joints (20,000 on one hub)", () => {
    const leaves = Array.from({ length: 20_000 }, (_, i) => body(`p${i}`))
    const start = performance.now()
    splitJointTree(
      [body("hub", true), ...leaves],
      leaves.map((b, i) => j(`h${i}`, "hub", b.id))
    )
    expect(performance.now() - start).toBeLessThan(200) // 1.4 s with lists copied per joint
  })
})
