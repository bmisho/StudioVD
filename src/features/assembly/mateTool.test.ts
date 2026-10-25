import { act } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { createTestRig } from "@/core/scene/testRig"
import type { AnchorId } from "@/core/schema"
import { useDocumentStore } from "@/store/document/documentStore"
import { useSessionStore } from "@/store/session/sessionStore"
import { resetStores } from "@/test/resetStores"
import { applyMateDraft, pickMateAnchor } from "./mateTool"

/** The anchors drawn under the cursor, nearest first (anchorAt keeps the first accepted). */
const under = vi.hoisted(() => ({ anchors: [] as string[] }))
vi.mock("./glyphs", () => ({
  anchorAt: (_x: number, _y: number, accept?: (id: string) => boolean) =>
    under.anchors.find((id) => !accept || accept(id)) ?? null,
}))
const clickAll = (...ids: AnchorId[]) => {
  under.anchors = ids
  pickMateAnchor(0, 0)
}
const click = (id: AnchorId | null) => (id ? clickAll(id) : clickAll())

/** The test rig without its hinge: Base (grounded) and Leaf, a hinge anchor on each. */
function setup() {
  resetStores()
  const rig = createTestRig()
  useDocumentStore.getState().insertEntities({ ...rig, mates: [] })
  const [onBase, onLeaf] = rig.anchors
  if (!onBase || !onLeaf) throw new Error("rig incomplete")
  const spare = useDocumentStore.getState().addAnchor({
    partId: onBase.partId,
    kind: "point",
    frame: { originMm: [0, 0, 0], z: [0, 1, 0], x: [1, 0, 0] },
    source: { kind: "manual" },
  })
  if (!spare) throw new Error("anchor not added")
  useSessionStore.getState().setTool("mate")
  return { onBase: onBase.id, onLeaf: onLeaf.id, spare }
}
const draft = () => useSessionStore.getState().mateDraft

describe("Mate tool", () => {
  beforeEach(resetStores)

  it("picks A, then B on another part with the defaults; another on A's part picks A again", () => {
    const { onBase, onLeaf, spare } = setup()
    click(null) // empty space: nothing
    expect(draft()).toBeNull()
    click(onBase)
    expect(draft()).toMatchObject({ anchorA: onBase, anchorB: null })
    click(spare) // the same part: A again
    expect(draft()).toMatchObject({ anchorA: spare, anchorB: null })
    click(onBase)
    click(onLeaf)
    expect(draft()).toMatchObject({
      anchorA: onBase,
      anchorB: onLeaf,
      type: "revolute",
      flip: false,
    })
  })

  it("Apply adds the mate (the leaf snapped), selects it and waits for the next one", () => {
    const { onBase, onLeaf } = setup()
    click(onBase)
    click(onLeaf)
    const result = applyMateDraft()
    expect(result?.ok).toBe(true)
    const mates = Object.values(useDocumentStore.getState().doc.mates)
    expect(mates.map((m) => [m.anchorA, m.anchorB])).toEqual([[onBase, onLeaf]])
    expect(useSessionStore.getState().selection).toEqual([{ kind: "mate", id: mates[0]?.id }])
    expect([draft(), useSessionStore.getState().activeTool]).toEqual([null, "mate"])
  })

  it("picks B where two anchors are drawn on top of each other (tool review)", () => {
    const { onBase, onLeaf } = setup()
    click(onBase)
    clickAll(onBase, onLeaf) // a pin already in its hole: A's own anchor is nearest
    expect(draft()).toMatchObject({ anchorA: onBase, anchorB: onLeaf })
  })

  it("clicking A or B again keeps the options set for them (tool review)", () => {
    const { onBase, onLeaf } = setup()
    click(onBase)
    click(onLeaf)
    act(() =>
      useSessionStore.getState().setMateDraft({
        anchorA: onBase,
        anchorB: onLeaf,
        type: "prismatic",
        flip: false,
        angleOffsetRad: 1,
      })
    )
    click(onLeaf)
    click(onBase)
    expect(draft()).toMatchObject({ anchorA: onBase, anchorB: onLeaf, type: "prismatic" })
    expect(draft()?.angleOffsetRad).toBe(1)
  })
})
