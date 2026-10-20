import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { PartId } from "@/core/schema"
import { sampleDocument } from "@/core/schema/testing/sampleDocument"
import { useDocumentStore } from "@/store/document/documentStore"
import { resetStores } from "@/test/resetStores"
import { PartMaterialSection } from "./PartMaterialSection"

// Previews need the 3D view's renderer; the section's behaviour does not.
vi.mock("./MaterialThumb", () => ({ MaterialThumb: () => null }))

/** The sample's two parts: the first is steel, the second has its Trim slot in rubber. */
function setup() {
  resetStores()
  const doc = sampleDocument()
  useDocumentStore.setState({ doc })
  const [first, second] = Object.values(doc.parts).map((p) => p.id)
  if (!first || !second) throw new Error("sample has two parts")
  return { first, second }
}

const partOf = (id: PartId) => useDocumentStore.getState().doc.parts[id]

/** Opens a Radix select by keyboard (jsdom has no layout for pointer use) and picks `name`. */
function choose(trigger: HTMLElement, name: string) {
  act(() => trigger.focus())
  fireEvent.keyDown(trigger, { key: "Enter" })
  fireEvent.keyDown(screen.getByRole("option", { name }), { key: "Enter" })
}

describe("part material section", () => {
  beforeEach(resetStores)

  it("shows Mixed for parts that differ, and assigns one material to all of them", () => {
    const { first, second } = setup()
    render(<PartMaterialSection partIds={[first, second]} />)
    const trigger = screen.getByRole("combobox", { name: "Material" })
    expect(trigger).toHaveTextContent("Mixed")
    choose(trigger, "Steel")
    expect(partOf(first)?.materialId).toBe(partOf(second)?.materialId)
    expect(trigger).toHaveTextContent("Steel")
    choose(trigger, "Imported colours")
    expect([partOf(first)?.materialId, partOf(second)?.materialId]).toEqual([null, null])
  })

  it("moves focus to the Material select when Make unique or Delete removes the button", () => {
    const { first, second } = setup()
    const steel = partOf(first)?.materialId
    act(() => useDocumentStore.getState().assignMaterial([second], steel ?? null))
    render(<PartMaterialSection partIds={[first]} />)
    const trigger = screen.getByRole("combobox", { name: "Material" })
    const press = (name: string) => {
      const button = screen.getByRole("button", { name })
      act(() => button.focus())
      fireEvent.click(button)
    }
    press("Make unique")
    expect(document.activeElement).toBe(trigger)
    expect(trigger).toHaveTextContent("Steel 2")
    press("Delete material")
    expect(document.activeElement).toBe(trigger)
    expect(trigger).toHaveTextContent("Imported colours")
  })

  it("lists a single part's slots with their own materials", () => {
    const { first, second } = setup()
    const { unmount } = render(<PartMaterialSection partIds={[second]} />)
    const slots = screen.getByText("Slots").parentElement ?? document.body
    const trim = within(slots).getByRole("combobox", { name: "Trim" })
    expect(trim).toHaveTextContent("Rubber")
    expect(within(slots).getByRole("combobox", { name: "Body" })).toHaveTextContent("Part material")
    choose(trim, "Part material")
    expect(partOf(second)?.materialSlots).toBeUndefined()
    unmount()
    render(<PartMaterialSection partIds={[first]} />) // its asset has one slot
    expect(screen.queryByText("Slots")).toBeNull()
  })
})
