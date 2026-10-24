import { act, fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import { createTestRig } from "@/core/scene/testRig"
import { useDocumentStore } from "@/store/document/documentStore"
import { useSessionStore } from "@/store/session/sessionStore"
import { resetStores } from "@/test/resetStores"
import { NewMateProperties } from "./NewMateProperties"

/** The rig without its hinge, its two hinge anchors picked by the Mate tool. */
function setup() {
  const rig = createTestRig()
  useDocumentStore.getState().insertEntities({ ...rig, mates: [] })
  const [a, b] = rig.anchors
  if (!a || !b) throw new Error("rig incomplete")
  act(() => {
    useSessionStore.getState().setTool("mate")
    useSessionStore.getState().setMateDraft({
      anchorA: a.id,
      anchorB: b.id,
      type: "revolute",
      flip: false,
      angleOffsetRad: 0,
    })
  })
  return rig
}

describe("NewMateProperties", () => {
  beforeEach(resetStores)

  it("says what applying moves, and applies", () => {
    setup()
    render(<NewMateProperties />)
    expect(screen.getByText("Moves Leaf.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Apply" }))
    expect(Object.keys(useDocumentStore.getState().doc.mates)).toHaveLength(1)
  })

  it("says why it cannot apply when both parts are grounded, and Apply does nothing", () => {
    const leaf = setup().parts[1]?.id
    if (!leaf) throw new Error("rig incomplete")
    act(() => useDocumentStore.getState().setPartsGrounded([leaf], true))
    render(<NewMateProperties />)
    expect(screen.getByRole("status")).toHaveTextContent("Both parts are fixed to the ground")
    const apply = screen.getByRole("button", { name: "Apply" })
    expect(apply).toHaveAttribute("aria-disabled", "true")
    fireEvent.click(apply)
    expect(useDocumentStore.getState().doc.mates).toEqual({})
  })
})
