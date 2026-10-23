import { act, fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import { createTestRig } from "@/core/scene/testRig"
import type { AnchorId } from "@/core/schema"
import { useDocumentStore } from "@/store/document/documentStore"
import { useSessionStore } from "@/store/session/sessionStore"
import { resetStores } from "@/test/resetStores"
import { AnchorList } from "./AnchorList"
import { AnchorProperties } from "./AnchorProperties"

/** The test rig: Base and Leaf, a hinge anchor on each, one revolute mate between them. */
function setup() {
  resetStores()
  const rig = createTestRig()
  useDocumentStore.getState().insertEntities(rig)
  useDocumentStore.temporal.getState().clear()
  const [base] = rig.parts
  const hinge = rig.anchors.find((a) => a.partId === base?.id)
  if (!base || !hinge) throw new Error("rig incomplete")
  return { base: base.id, hinge: hinge.id }
}

const doc = () => useDocumentStore.getState().doc
const anchor = (id: AnchorId) => doc().anchors[id]
const steps = () => useDocumentStore.temporal.getState().pastStates.length

/** Types into a field the way a user does: focus, edits, Enter (one gesture). */
function type(field: HTMLElement, ...values: string[]) {
  act(() => field.focus())
  for (const value of values) fireEvent.change(field, { target: { value } })
  fireEvent.keyDown(field, { key: "Enter" })
}

describe("AnchorProperties", () => {
  beforeEach(resetStores)

  it("shows the anchor's part, name, kind, origin and direction", () => {
    const { hinge } = setup()
    render(<AnchorProperties id={hinge} />)
    expect(screen.getByText("On")).toContainElement(screen.getByRole("button", { name: "Base" }))
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("Hinge")
    expect(screen.getByRole("combobox", { name: "Kind" })).toHaveTextContent("Axial (an axis)")
    expect(screen.getByRole("textbox", { name: "Origin X (mm)" })).toHaveValue("60.5")
    expect(screen.getByText("Direction (z)").nextSibling).toHaveTextContent("0, 0, 1")
    expect(screen.getByText("Placed by hand")).toBeInTheDocument()
  })

  it("renames, tags and moves the anchor, one undo entry per edit; an empty name clears it", () => {
    const { hinge } = setup()
    render(<AnchorProperties id={hinge} />)
    type(screen.getByRole("textbox", { name: "Name" }), "Pi", "Pivot")
    type(screen.getByRole("textbox", { name: "Interface tag" }), "shaft-8mm")
    type(screen.getByRole("textbox", { name: "Origin Z (mm)" }), "1", "12.5")
    expect(anchor(hinge)).toMatchObject({ name: "Pivot", interface: "shaft-8mm" })
    expect(anchor(hinge)?.frame.originMm[2]).toBe(12.5)
    expect(steps()).toBe(3)
    type(screen.getByRole("textbox", { name: "Name" }), "")
    expect(anchor(hinge)).not.toHaveProperty("name")
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveAttribute("placeholder", "Axial")
  })

  it("flips the direction, and deletes the anchor with its mate, showing its part", () => {
    const { base, hinge } = setup()
    render(<AnchorProperties id={hinge} />)
    fireEvent.click(screen.getByRole("button", { name: "Flip direction" }))
    expect(anchor(hinge)?.frame.z).toEqual([0, 0, -1])
    fireEvent.click(screen.getByRole("button", { name: "Delete anchor" }))
    expect(anchor(hinge)).toBeUndefined()
    expect(doc().mates).toEqual({})
    expect(useSessionStore.getState().selection).toEqual([{ kind: "part", id: base }])
  })
})

describe("AnchorList", () => {
  beforeEach(resetStores)

  it("lists a part's anchors to select them, and starts Place Anchor (not in test mode)", () => {
    const { base, hinge } = setup()
    render(<AnchorList partId={base} />)
    fireEvent.click(screen.getByRole("button", { name: /^Hinge/ }))
    expect(useSessionStore.getState().selection).toEqual([{ kind: "anchor", id: hinge }])
    fireEvent.click(screen.getByRole("button", { name: "Place Anchor" }))
    expect(useSessionStore.getState().activeTool).toBe("anchor")
    act(() => useSessionStore.getState().toggleTestMode())
    expect(screen.getByRole("button", { name: "Place Anchor" })).toHaveAttribute(
      "aria-disabled",
      "true"
    )
    fireEvent.click(screen.getByRole("button", { name: "Place Anchor" }))
    expect(useSessionStore.getState().activeTool).toBe("select")
  })

  it("names an unnamed anchor by its kind once", () => {
    const { base, hinge } = setup()
    act(() => useDocumentStore.getState().updateAnchor(hinge, { name: "" }))
    render(<AnchorList partId={base} />)
    expect(screen.getByRole("button", { name: "Axial" })).toBeInTheDocument()
  })

  it("keeps the kind label readable on the hovered row (no muted text on accent, §7)", () => {
    const { base } = setup()
    render(<AnchorList partId={base} />)
    const kind = screen.getByText("Axial")
    expect(kind.closest("button")).toHaveClass("group", "hover:bg-accent")
    expect(kind).toHaveClass("group-hover:text-accent-foreground")
  })

  it("shows Place Anchor as unavailable in test mode and says why", () => {
    const { base } = setup()
    act(() => useSessionStore.getState().toggleTestMode())
    render(<AnchorList partId={base} />)
    const place = screen.getByRole("button", { name: "Place Anchor" })
    expect(place).toHaveClass("aria-disabled:opacity-50", "aria-disabled:hover:bg-transparent")
    expect(place).toHaveAccessibleDescription("Leave test mode to place anchors")
  })
})
