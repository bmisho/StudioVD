import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import { createTestRig } from "@/core/scene/testRig"
import type { MateId, PartId } from "@/core/schema"
import { useDocumentStore } from "@/store/document/documentStore"
import { useSessionStore } from "@/store/session/sessionStore"
import { resetStores } from "@/test/resetStores"
import { MateProperties } from "./MateProperties"
import { PartMotion } from "./PartMotion"

/** The test rig: Base (grounded) hinged to Leaf, as it was inserted. */
function setup() {
  const rig = createTestRig()
  useDocumentStore.getState().insertEntities(rig)
  useDocumentStore.temporal.getState().clear()
  const [base, leaf] = rig.parts.map((p) => p.id) as [PartId, PartId]
  const hinge = rig.mates[0]?.id as MateId
  return { base, leaf, hinge }
}
const doc = () => useDocumentStore.getState().doc
const steps = () => useDocumentStore.temporal.getState().pastStates.length

describe("MateProperties", () => {
  beforeEach(resetStores)

  it("shows its anchors and options; a new direction snaps the leaf over in one undo entry", async () => {
    const { leaf, hinge } = setup()
    render(<MateProperties id={hinge} />)
    expect(screen.getAllByRole("button", { name: /Hinge on (Base|Leaf)/ })).toHaveLength(2)
    expect(screen.getByText("Mechanism: 1 DOF")).toBeInTheDocument()
    const pose = doc().parts[leaf]?.pose
    fireEvent.click(screen.getByRole("combobox", { name: "Direction" }))
    fireEvent.click(await screen.findByRole("option", { name: "Opposed (face to face)" }))
    expect(doc().mates[hinge]?.flip).toBe(true)
    expect(doc().parts[leaf]?.pose).not.toEqual(pose) // turned over about the hinge's x
    expect(steps()).toBe(1)
  })

  it("sets limits in degrees (radians stored), suppresses, snaps again after a move, deletes", () => {
    const { leaf, hinge } = setup()
    render(<MateProperties id={hinge} />)
    fireEvent.click(screen.getByRole("switch", { name: "Limits" }))
    expect(doc().mates[hinge]?.limits).toEqual({ min: -Math.PI / 2, max: Math.PI / 2 })
    fireEvent.click(screen.getByRole("switch", { name: "Suppressed" }))
    expect(screen.getByText(/Suppressed: it holds nothing/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("switch", { name: "Suppressed" }))

    act(() =>
      useDocumentStore
        .getState()
        .setPartPose(leaf, { positionMm: [0, 300, 0], quaternion: [0, 0, 0, 1] })
    )
    expect(screen.getByText(/Not satisfied/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Snap again" }))
    expect(screen.queryByText(/Not satisfied/)).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Delete mate" }))
    expect(doc().mates).toEqual({})
  })

  it("a part says how it can move", () => {
    const { base, leaf } = setup()
    const { container } = render(
      <>
        <PartMotion id={base} />
        <PartMotion id={leaf} />
      </>
    )
    const lines = within(container).getAllByText(/Grounded|relative to the ground/)
    expect(lines.map((l) => l.textContent)).toEqual(["Grounded", "1 DOF relative to the ground"])
    act(() => useSessionStore.getState().select([]))
  })
})
