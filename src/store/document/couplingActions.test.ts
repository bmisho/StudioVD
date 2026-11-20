import { describe, expect, it } from "vitest"
import { createTestRig } from "@/core/scene/testRig"
import type { MateId } from "@/core/schema"
import { createDocumentStore } from "./documentStore"

function rigWithTwoHinges() {
  const store = createDocumentStore()
  const rig = createTestRig()
  store.getState().insertEntities(rig)
  const [first] = rig.mates
  if (!first) throw new Error("rig incomplete")
  const second = { ...first, id: crypto.randomUUID() as MateId }
  store.setState((s) => ({ doc: { ...s.doc, mates: { ...s.doc.mates, [second.id]: second } } }))
  return { store, a: first.id, b: second.id }
}

describe("coupling actions (PLAN 10.5)", () => {
  it("adds a coupling that fits its mates, one undo entry", () => {
    const { store, a, b } = rigWithTwoHinges()
    const s = () => store.getState()
    const before = store.temporal.getState().pastStates.length
    const id = s().addCoupling("gear", a, b, -2)
    expect(id && s().doc.couplings[id]).toMatchObject({
      kind: "gear",
      mateA: a,
      mateB: b,
      ratio: -2,
    })
    expect(store.temporal.getState().pastStates.length).toBe(before + 1)
  })

  it("refuses kinds that do not fit, the same mate twice and unusable ratios", () => {
    const { store, a, b } = rigWithTwoHinges()
    const s = () => store.getState()
    expect(s().addCoupling("leadScrew", a, b, 1)).toBeNull() // two hinges: a gear only
    expect(s().addCoupling("gear", a, a, 1)).toBeNull()
    for (const ratio of [0, NaN, Infinity, 1e5])
      expect(s().addCoupling("gear", a, b, ratio)).toBeNull()
    expect(s().doc.couplings).toEqual({})
  })

  it("edits the ratio, ignores unusable ones, and deletes", () => {
    const { store, a, b } = rigWithTwoHinges()
    const s = () => store.getState()
    const id = s().addCoupling("gear", a, b, -2)
    if (!id) throw new Error("not added")
    s().setCouplingRatio(id, 3)
    s().setCouplingRatio(id, 0)
    expect(s().doc.couplings[id]?.ratio).toBe(3)
    s().deleteCouplings([id])
    expect(s().doc.couplings).toEqual({})
  })
})
