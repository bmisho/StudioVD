import { act, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import { createTestRig } from "@/core/scene/testRig"
import { useDocumentStore } from "@/store/document/documentStore"
import { useSessionStore } from "@/store/session/sessionStore"
import { resetStores } from "@/test/resetStores"
import { MateToolHint } from "./MateToolHint"

describe("MateToolHint (tool review)", () => {
  beforeEach(resetStores)

  it("counts the fits the view draws: none on a hidden part", () => {
    const rig = createTestRig()
    useDocumentStore.getState().insertEntities({ ...rig, mates: [] })
    const [onBase, onLeaf] = rig.anchors
    if (!onBase || !onLeaf) throw new Error("rig incomplete")
    act(() => {
      useDocumentStore.getState().updateAnchor(onBase.id, { interface: "shaft-8mm" })
      useDocumentStore.getState().updateAnchor(onLeaf.id, { interface: "bore-8mm" })
      useSessionStore.getState().setTool("mate")
      useSessionStore.getState().setMateDraft({
        anchorA: onBase.id,
        anchorB: null,
        type: "revolute",
        flip: false,
        angleOffsetRad: 0,
      })
    })
    render(<MateToolHint />)
    expect(screen.getByRole("status")).toHaveTextContent("(1 fit: larger, in green)")
    act(() => useDocumentStore.getState().setPartsVisible([onLeaf.partId], false))
    expect(screen.getByRole("status")).not.toHaveTextContent("fit")
  })
})
