import { act, fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import { ADD_REFUSAL_TEXT } from "@/core/assembly/mateNames"
import { createTestRig } from "@/core/scene/testRig"
import { COLLECTION_CAPS, type Mate, type MateId } from "@/core/schema"
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

  it("Escape in the angle field puts back the angle the picks had (UI review)", () => {
    setup()
    render(<NewMateProperties />)
    const angle = screen.getByRole("textbox", { name: /^Angle/ })
    act(() => angle.focus())
    fireEvent.change(angle, { target: { value: "45" } })
    expect(useSessionStore.getState().mateDraft?.angleOffsetRad).toBeCloseTo(Math.PI / 4, 12)
    fireEvent.keyDown(angle, { key: "Escape" })
    expect(useSessionStore.getState().mateDraft?.angleOffsetRad).toBe(0)
  })

  it("says the project is full of mates, and Apply does nothing (UI review)", () => {
    setup()
    const filler = (i: number) => ({ id: `m${i}` as MateId }) as Mate // counted, never read
    const mates = Object.fromEntries(
      Array.from({ length: COLLECTION_CAPS.mates }, (_, i) => [`m${i}`, filler(i)])
    )
    act(() => useDocumentStore.setState((s) => ({ doc: { ...s.doc, mates } })))
    render(<NewMateProperties />)
    expect(screen.getByRole("status")).toHaveTextContent(ADD_REFUSAL_TEXT.full)
    const apply = screen.getByRole("button", { name: "Apply" })
    expect(apply).toHaveAttribute("aria-disabled", "true")
  })
})
