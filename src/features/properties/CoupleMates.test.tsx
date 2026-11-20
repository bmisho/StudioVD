import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import { createTestRig } from "@/core/scene/testRig"
import type { MateId } from "@/core/schema"
import { useDocumentStore } from "@/store/document/documentStore"
import { useSessionStore } from "@/store/session/sessionStore"
import { resetStores } from "@/test/resetStores"
import { CoupleMates } from "./CoupleMates"
import { MateCouplings } from "./MateCouplings"

/** The rig's hinge and a second hinge on the same anchors. */
function twoHinges(): [MateId, MateId] {
  const rig = createTestRig()
  useDocumentStore.getState().insertEntities(rig)
  const first = rig.mates[0]
  if (!first) throw new Error("rig incomplete")
  const second = { ...first, id: crypto.randomUUID() as MateId }
  useDocumentStore.setState((s) => ({
    doc: { ...s.doc, mates: { ...s.doc.mates, [second.id]: second } },
  }))
  useDocumentStore.temporal.getState().clear()
  return [first.id, second.id]
}
const doc = () => useDocumentStore.getState().doc

describe("coupling mates (PLAN 10.5)", () => {
  beforeEach(resetStores)

  it("two hinges couple as a gear pair at the ratio typed, and the mate lists it", () => {
    const [a, b] = twoHinges()
    render(<CoupleMates mates={[a, b]} />)
    expect(screen.getByRole("radio", { name: "Gear pair" })).toHaveAttribute("aria-checked", "true")
    expect(screen.queryByRole("radio", { name: "Lead screw" })).toBeNull()
    fireEvent.change(screen.getByLabelText(/^Ratio/), { target: { value: "-3" } })
    fireEvent.click(screen.getByRole("button", { name: "Couple" }))
    expect(Object.values(doc().couplings)).toMatchObject([
      { kind: "gear", mateA: a, mateB: b, ratio: -3 },
    ])
    expect(useSessionStore.getState().selection).toEqual([{ kind: "mate", id: a }])

    render(<MateCouplings id={a} />)
    fireEvent.click(screen.getByRole("button", { name: "Reverse" }))
    expect(Object.values(doc().couplings)[0]?.ratio).toBe(3)
    fireEvent.click(screen.getByRole("button", { name: "Remove" }))
    expect(doc().couplings).toEqual({})
  })

  it("a hinge and a fixed mate cannot couple, and says what can", () => {
    const [a, b] = twoHinges()
    useDocumentStore.getState().updateMate(b, { type: "fixed" })
    render(<CoupleMates mates={[a, b]} />)
    expect(
      screen.getByText(/Couple two hinges \(gears\), or a hinge and a slider/)
    ).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Couple" })).toBeNull()
  })
})
