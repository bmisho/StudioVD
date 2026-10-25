import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import { RESNAP_LOOP_TEXT } from "@/core/assembly/mateNames"
import { createTestRig } from "@/core/scene/testRig"
import type { AnchorId, MateId, PartId } from "@/core/schema"
import { degToRad } from "@/core/units"
import { useDocumentStore } from "@/store/document/documentStore"
import { resetStores } from "@/test/resetStores"
import { MateProperties } from "./MateProperties"

// UI review of the mate inspector: edits that must not change more than they say.

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
/** Focuses the field, types each text in turn, then leaves it. */
function typeInto(field: HTMLElement, ...texts: string[]) {
  act(() => field.focus())
  for (const value of texts) fireEvent.change(field, { target: { value } })
  act(() => field.blur())
}

describe("mate inspector edits", () => {
  beforeEach(resetStores)

  it("typing one limit leaves the other where it was (9 on the way to 90)", () => {
    const { hinge } = setup()
    act(() => {
      useDocumentStore
        .getState()
        .updateMate(hinge, { limits: { min: degToRad(10), max: degToRad(120) } })
    })
    render(<MateProperties id={hinge} />)
    typeInto(screen.getByRole("textbox", { name: "Maximum (°)" }), "9", "90")
    expect(doc().mates[hinge]?.limits?.min).toBeCloseTo(degToRad(10), 12)
    expect(doc().mates[hinge]?.limits?.max).toBeCloseTo(degToRad(90), 12)
  })

  it("retyping the angle it had adds no undo entry and moves nothing", () => {
    const { hinge } = setup()
    render(<MateProperties id={hinge} />)
    const before = doc()
    typeInto(screen.getByRole("textbox", { name: /^Angle/ }), "45", "0")
    expect(steps()).toBe(0)
    expect(doc()).toBe(before)
  })

  it("forgets why a change could not snap once the document changes (undo)", () => {
    const { leaf, hinge } = setup()
    act(() => useDocumentStore.getState().setPartsGrounded([leaf], true))
    render(<MateProperties id={hinge} />)
    const suppressed = screen.getByRole("switch", { name: "Suppressed" })
    fireEvent.click(suppressed)
    fireEvent.click(suppressed)
    expect(screen.getByText(/unground one first/)).toBeInTheDocument()
    act(() => useDocumentStore.temporal.getState().undo(3))
    expect(doc().parts[leaf]?.grounded).toBe(false)
    expect(screen.queryByText(/unground one first/)).toBeNull()
  })

  it("offers no Snap again for a loop it cannot close, and says why", () => {
    const { base, leaf } = setup()
    const pin = (partId: PartId) =>
      useDocumentStore.getState().addAnchor({
        partId,
        kind: "axial",
        frame: { originMm: [0, 0, 0], z: [0, 0, 1], x: [1, 0, 0] },
        source: { kind: "manual" },
      }) as AnchorId
    const [a, b] = [pin(base), pin(leaf)]
    const add = useDocumentStore
      .getState()
      .addMate({ anchorA: a, anchorB: b, type: "revolute", flip: false, angleOffsetRad: 0 })
    if (!add.ok) throw new Error(add.reason)
    render(<MateProperties id={add.id} />)
    expect(screen.getByText(/Not satisfied/)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Snap again" })).toBeNull()
    expect(screen.getByText(RESNAP_LOOP_TEXT)).toBeInTheDocument()
  })

  it("keeps focus in the inspector when Snap again puts the parts back and goes away", async () => {
    const { leaf, hinge } = setup()
    act(() =>
      useDocumentStore
        .getState()
        .setPartPose(leaf, { positionMm: [0, 300, 0], quaternion: [0, 0, 0, 1] })
    )
    render(<MateProperties id={hinge} />)
    const snap = screen.getByRole("button", { name: "Snap again" })
    act(() => snap.focus())
    fireEvent.click(snap)
    expect(screen.queryByRole("button", { name: "Snap again" })).toBeNull()
    await waitFor(() => expect(screen.getByRole("heading", { name: "Mate" })).toHaveFocus())
  })
})
