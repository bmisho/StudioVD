import { describe, expect, it } from "vitest"
import { createTestRig } from "@/core/scene/testRig"
import type { MateId } from "@/core/schema"
import { setupRegistry } from "./registryTestSetup"

function withRig() {
  const t = setupRegistry()
  const rig = createTestRig()
  t.document.getState().insertEntities(rig)
  const [base, leaf] = rig.parts
  if (!base || !leaf) throw new Error("rig incomplete")
  return { ...t, base: base.id, leaf: leaf.id }
}

describe("part commands", () => {
  it("hide/show acts on parts below a selected group, hiding a mixed selection first", () => {
    const t = withRig()
    expect(t.registry.isEnabled("view.toggleVisibility")).toBe(false)
    t.session.getState().select([{ kind: "part", id: t.leaf }])
    t.registry.run("edit.newGroup") // the leaf moves into Group 1, which is selected
    t.document.getState().setPartsVisible([t.base], false)
    t.session.getState().select([{ kind: "part", id: t.base }, ...t.session.getState().selection])
    t.registry.run("view.toggleVisibility")
    const parts = () => t.document.getState().doc.parts
    expect([parts()[t.base]?.visible, parts()[t.leaf]?.visible]).toEqual([false, false])
    t.registry.run("view.toggleVisibility")
    expect([parts()[t.base]?.visible, parts()[t.leaf]?.visible]).toEqual([true, true])
    t.document.getState().setPartsVisible([t.leaf], false)
    t.registry.run("view.showAll")
    expect(parts()[t.leaf]?.visible).toBe(true)
    expect(t.registry.isEnabled("view.showAll")).toBe(false)
  })

  it("isolate toggles a view filter; grounded is checked only when all are grounded", () => {
    const t = withRig()
    t.session.getState().select([{ kind: "part", id: t.leaf }])
    t.registry.run("view.isolate")
    expect(t.session.getState().isolated).toEqual([t.leaf])
    expect(t.registry.get("view.isolate").isChecked?.()).toBe(true)
    t.registry.run("view.isolate")
    expect(t.session.getState().isolated).toBeNull()

    t.session.getState().select([
      { kind: "part", id: t.base },
      { kind: "part", id: t.leaf },
    ])
    expect(t.registry.get("part.toggleGrounded").isChecked?.()).toBe(false)
    t.registry.run("part.toggleGrounded")
    expect(t.registry.get("part.toggleGrounded").isChecked?.()).toBe(true)
  })

  it("Delete removes selected parts with their mates, then clears the selection", () => {
    const t = withRig()
    t.session.getState().select([{ kind: "part", id: t.leaf }])
    expect(t.registry.isEnabled("edit.delete")).toBe(true)
    t.registry.run("edit.delete")
    expect(Object.keys(t.document.getState().doc.parts)).toEqual([t.base])
    expect(t.document.getState().doc.mates).toEqual({})
    expect(t.session.getState().selection).toEqual([])
  })

  it("Delete on anchors alone removes them and shows their parts (as Delete anchor does)", () => {
    const t = withRig()
    const anchors = Object.values(t.document.getState().doc.anchors)
    t.session.getState().select(anchors.map((a) => ({ kind: "anchor", id: a.id })))
    t.registry.run("edit.delete")
    expect(t.document.getState().doc.anchors).toEqual({})
    expect(t.session.getState().selection).toEqual([
      { kind: "part", id: t.base },
      { kind: "part", id: t.leaf },
    ])
  })
})

describe("delete mates", () => {
  it("Delete on a selected mate removes it, leaving its parts and anchors", () => {
    const t = withRig()
    const [hinge] = Object.keys(t.document.getState().doc.mates) as MateId[]
    if (!hinge) throw new Error("rig has no hinge")
    t.session.getState().select([{ kind: "mate", id: hinge }])
    expect(t.registry.isEnabled("edit.delete")).toBe(true)
    t.registry.run("edit.delete")
    const doc = t.document.getState().doc
    expect([Object.keys(doc.mates).length, Object.keys(doc.anchors).length]).toEqual([0, 2])
  })
})

describe("delete", () => {
  it("deleting parts and groups together is ONE undo step", () => {
    const t = withRig()
    t.session.getState().select([{ kind: "part", id: t.base }])
    t.registry.run("edit.newGroup") // the base moves into Group 1
    const group = t.session.getState().selection[0]
    if (group?.kind !== "group") throw new Error("expected the new group selected")
    t.session.getState().select([group, { kind: "part", id: t.leaf }])
    const before = t.document.temporal.getState().pastStates.length
    t.registry.run("edit.delete")
    expect(Object.keys(t.document.getState().doc.parts)).toEqual([t.base])
    expect(t.document.getState().doc.groups).toEqual({})
    expect(t.document.temporal.getState().pastStates.length).toBe(before + 1)
    t.history.undo()
    expect(Object.keys(t.document.getState().doc.parts)).toHaveLength(2)
    expect(Object.keys(t.document.getState().doc.groups)).toHaveLength(1)
  })
})
