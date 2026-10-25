import { describe, expect, it } from "vitest"
import { createTestRig } from "@/core/scene/testRig"
import { setupRegistry } from "./registryTestSetup"

// Tool review: Apply had no keyboard route with the Properties panel collapsed.
describe("Apply Mate (Ctrl+Enter)", () => {
  it("is off until the Mate tool has both picks, then adds the mate and selects it", () => {
    const { registry, document, session } = setupRegistry()
    const rig = createTestRig()
    document.getState().insertEntities({ ...rig, mates: [] })
    const [a, b] = rig.anchors
    if (!a || !b) throw new Error("rig incomplete")
    expect(registry.get("tool.mateApply").shortcuts).toEqual(["Ctrl+Enter"])
    session.getState().setTool("mate")
    const first = { anchorA: a.id, anchorB: null, type: "revolute", flip: false } as const
    session.getState().setMateDraft({ ...first, angleOffsetRad: 0 })
    expect(registry.isEnabled("tool.mateApply")).toBe(false)
    session.getState().setMateDraft({ ...first, angleOffsetRad: 0, anchorB: b.id })
    expect(registry.run("tool.mateApply")).toBe(true)
    const mates = Object.values(document.getState().doc.mates)
    expect(mates).toHaveLength(1)
    expect(session.getState().selection).toEqual([{ kind: "mate", id: mates[0]?.id }])
  })

  it("says why it could not apply (both parts grounded)", () => {
    const { registry, document, session, reportError } = setupRegistry()
    const rig = createTestRig()
    document.getState().insertEntities({ ...rig, mates: [] })
    const [a, b] = rig.anchors
    if (!a || !b) throw new Error("rig incomplete")
    document.getState().setPartsGrounded([b.partId], true)
    session.getState().setTool("mate")
    session.getState().setMateDraft({
      anchorA: a.id,
      anchorB: b.id,
      type: "revolute",
      flip: false,
      angleOffsetRad: 0,
    })
    registry.run("tool.mateApply")
    expect(document.getState().doc.mates).toEqual({})
    expect(reportError.mock.calls[0]?.[0].message).toMatch(/unground one first/)
  })
})
