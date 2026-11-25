import { beforeEach, describe, expect, it, vi } from "vitest"
import { createTestRig } from "@/core/scene/testRig"
import { useDocumentStore } from "@/store/document/documentStore"
import { startAnchorTarget, useAnchorTarget } from "@/store/session/anchorTargetStore"
import { useSessionStore } from "@/store/session/sessionStore"
import { resetStores } from "@/test/resetStores"
import { cableToolPick } from "./cableTool"

const fitTiesOn = vi.hoisted(() => vi.fn(() => Promise.resolve()))
vi.mock("@/features/library/tieFit", () => ({ fitTiesOn }))

const doc = () => useDocumentStore.getState().doc
const route = () => {
  const t = useAnchorTarget.getState().target
  return t?.kind === "cable" ? t.route : null
}

describe("the Cable tool (0.2.2)", () => {
  beforeEach(resetStores)

  it("starts, goes through a tie, ends; then starts the next cable", () => {
    const rig = createTestRig()
    useDocumentStore.getState().insertEntities(rig)
    const [a, b] = rig.anchors
    if (!a || !b) throw new Error("rig incomplete")
    const tie = useDocumentStore.getState().addAnchor({
      partId: a.partId,
      kind: "axial",
      frame: { originMm: [0, 30, 0], z: [1, 0, 0], x: [0, 1, 0] },
      source: { kind: "manual" },
      name: "Cable through",
    })
    if (!tie) throw new Error("no tie anchor")
    startAnchorTarget({ kind: "cable", route: [] })
    cableToolPick(a.id)
    cableToolPick(a.id) // the same anchor again: nothing
    expect(route()).toEqual([a.id])
    cableToolPick(tie)
    expect(route()).toEqual([a.id, tie])
    expect(Object.keys(doc().connectors)).toHaveLength(0)
    cableToolPick(b.id)
    const cables = Object.values(doc().connectors)
    expect(cables).toHaveLength(1)
    const [cable] = cables
    if (cable?.kind !== "cable") throw new Error("not a cable")
    expect(cable.ends).toEqual([a.id, b.id])
    expect(cable.via).toEqual([tie])
    expect(cable.lengthMm).toBeGreaterThan(1) // fitted to its route
    expect(useSessionStore.getState().selection).toEqual([{ kind: "connector", id: cable.id }])
    expect(fitTiesOn).toHaveBeenCalledWith([tie])
    expect(route()).toEqual([]) // ready for the next one
    expect(useSessionStore.getState().activeTool).toBe("anchor")
  })
})
