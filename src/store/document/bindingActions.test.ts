import { describe, expect, it } from "vitest"
import { createTestRig } from "@/core/scene/testRig"
import { createDocumentStore } from "./documentStore"

// Binding actions (PLAN 13.1): each one undo entry, refused when the rules say no, gone with
// what they name.

function setup() {
  const store = createDocumentStore()
  const s = () => store.getState()
  const rig = createTestRig()
  s().insertEntities(rig)
  const [base, leaf] = rig.parts
  const hinge = rig.mates[0]
  if (!base || !leaf || !hinge) throw new Error("rig")
  const pot = s().addBlock("electrical.potentiometer@1", { x: 0, y: 0 })
  const probe = s().addBlock("data.probe@1", { x: 300, y: 0 })
  const led = s().addBlock("electrical.led@1", { x: 600, y: 0 })
  if (!pot || !probe || !led) throw new Error("blocks")
  return { store, s, base: base.id, leaf: leaf.id, hinge: hinge.id, pot, probe, led }
}

describe("binding actions", () => {
  it("binds a hinge to a parameter and an LED to a glow, one undo entry each", () => {
    const { store, s, hinge, pot, led, leaf } = setup()
    const before = store.temporal.getState().pastStates.length
    const a = s().addBinding({
      from: { kind: "mateCoordinate", mate: hinge },
      to: { kind: "param", node: pot, param: "position" },
      scale: 1 / Math.PI,
      offset: 0.5,
    })
    expect(a.ok).toBe(true)
    const glow = s().addBinding({
      from: { kind: "output", node: led, port: "light", quantity: "value" },
      to: { kind: "glow", part: leaf, color: "red" },
      scale: 10,
      offset: 0,
    })
    expect(glow.ok).toBe(true)
    expect(store.temporal.getState().pastStates.length).toBe(before + 2)
    if (a.ok) s().updateBinding(a.id, { min: 0, max: 1 })
    expect(a.ok && s().doc.bindings[a.id]).toMatchObject({ min: 0, max: 1 })
  })

  it("refuses what does not fit, and a wire can no longer drive a bound input", () => {
    const { s, hinge, pot, probe, leaf } = setup()
    const refused = [
      s().addBinding({
        from: { kind: "mateCoordinate", mate: hinge },
        to: { kind: "param", node: pot, param: "taper" }, // a choice takes no number
        scale: 1,
        offset: 0,
      }),
      s().addBinding({
        from: { kind: "mateCoordinate", mate: hinge },
        to: { kind: "glow", part: leaf, color: "red" }, // 3D into 3D
        scale: 1,
        offset: 0,
      }),
    ]
    expect(refused.map((r) => r.ok)).toEqual([false, false])
    const mass = s().addBinding({
      from: { kind: "mass", part: leaf },
      to: { kind: "input", node: probe, port: "value" },
      scale: 1,
      offset: 0,
    })
    expect(mass.ok).toBe(true)
    const k = s().addBlock("data.constant@1", { x: 0, y: 300 })
    if (!k) throw new Error("block")
    expect(s().connectPorts({ node: k, port: "out" }, { node: probe, port: "value" })).toBe(
      "driven"
    )
    // A second binding into the same input is refused too.
    const again = s().addBinding({
      from: { kind: "mass", part: leaf },
      to: { kind: "input", node: probe, port: "value" },
      scale: 2,
      offset: 0,
    })
    expect(again.ok).toBe(false)
  })

  it("goes with the part, mate or block it names", () => {
    const { s, hinge, pot, probe, leaf, base } = setup()
    s().addBinding({
      from: { kind: "mateCoordinate", mate: hinge },
      to: { kind: "param", node: pot, param: "position" },
      scale: 1,
      offset: 0,
    })
    s().addBinding({
      from: { kind: "mass", part: base },
      to: { kind: "input", node: probe, port: "value" },
      scale: 1,
      offset: 0,
    })
    s().deleteSchematic([pot], [])
    expect(Object.values(s().doc.bindings).map((b) => b.from.kind)).toEqual(["mass"])
    s().deleteItems([leaf], [])
    expect(Object.keys(s().doc.bindings)).toHaveLength(1) // the base's mass stays
    s().deleteItems([base], [])
    expect(s().doc.bindings).toEqual({})
  })
})
