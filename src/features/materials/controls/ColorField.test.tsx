import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { MaterialId } from "@/core/schema"
import { useDocumentStore } from "@/store/document/documentStore"
import { documentHistory } from "@/store/document/history"
import { resetStores } from "@/test/resetStores"
import { ColorField } from "./ColorField"
import { PICK_IDLE_MS } from "./SystemColorPicker"

/** A new custom material (colour #a3a9b1, not a swatch) with a clean history. */
function setup() {
  resetStores()
  const id = useDocumentStore.getState().createMaterial()
  if (!id) throw new Error("no material")
  useDocumentStore.temporal.getState().clear()
  render(<Bound id={id} />)
  return id
}

function Bound({ id }: { id: MaterialId }) {
  const value = useDocumentStore((s) => s.doc.materials[id]?.color ?? "#000000")
  const update = useDocumentStore((s) => s.updateMaterial)
  return <ColorField label="Colour" value={value} onChange={(color) => update(id, { color })} />
}

const color = (id: MaterialId) => useDocumentStore.getState().doc.materials[id]?.color
const undoSteps = () => useDocumentStore.temporal.getState().pastStates.length
const hexInput = () => screen.getByRole("textbox", { name: "Colour" })
const swatch = (name: string) => screen.getByRole("radio", { name })

describe("ColorField", () => {
  beforeEach(resetStores)

  it("commits typed hex once, on Enter, in the stored lowercase form", () => {
    const id = setup()
    act(() => hexInput().focus())
    fireEvent.change(hexInput(), { target: { value: "AB" } })
    fireEvent.change(hexInput(), { target: { value: "AB12CD" } })
    expect(color(id)).toBe("#a3a9b1") // nothing applied while typing
    fireEvent.keyDown(hexInput(), { key: "Enter" })
    expect(color(id)).toBe("#ab12cd")
    expect(hexInput()).toHaveValue("#ab12cd")
    expect(undoSteps()).toBe(1)
  })

  it("applies nothing for text that is not a colour, and reverts on Escape", () => {
    const id = setup()
    act(() => hexInput().focus())
    fireEvent.change(hexInput(), { target: { value: "#12345" } })
    expect(hexInput()).toHaveAttribute("aria-invalid", "true")
    act(() => hexInput().blur())
    expect(hexInput()).toHaveValue("#a3a9b1")
    expect(hexInput()).not.toHaveAttribute("aria-invalid")
    act(() => hexInput().focus())
    fireEvent.change(hexInput(), { target: { value: "#FFFFFF" } })
    fireEvent.keyDown(hexInput(), { key: "Escape" })
    expect(hexInput()).toHaveValue("#a3a9b1")
    expect(color(id)).toBe("#a3a9b1")
    expect(undoSteps()).toBe(0)
  })

  it("offers named swatches as a radio group with one tab stop", () => {
    const id = setup()
    const group = screen.getByRole("radiogroup", { name: "Colour swatches" })
    const radios = within(group).getAllByRole("radio")
    expect(radios.length).toBeGreaterThanOrEqual(10)
    expect(radios.filter((r) => r.tabIndex === 0)).toEqual([radios[0]]) // none checked yet
    fireEvent.click(swatch("Red"))
    expect(swatch("Red")).toHaveAttribute("aria-checked", "true")
    expect(color(id)).not.toBe("#a3a9b1")
    expect(undoSteps()).toBe(1)
    expect(
      within(group)
        .getAllByRole("radio")
        .filter((r) => r.tabIndex === 0)
    ).toEqual([swatch("Red")])
  })

  it("moves focus and the pick with the arrow keys, wrapping, one entry per pick", () => {
    const id = setup()
    const radios = screen.getAllByRole("radio")
    const [first, second] = radios
    const last = radios.at(-1)
    if (!first || !second || !last) throw new Error("swatches missing")
    act(() => first.focus())
    fireEvent.keyDown(first, { key: "ArrowRight" })
    expect(second).toHaveFocus()
    expect(second).toHaveAttribute("aria-checked", "true")
    fireEvent.keyDown(second, { key: "ArrowLeft" })
    fireEvent.keyDown(first, { key: "ArrowUp" })
    expect(last).toHaveFocus()
    expect(last).toHaveAttribute("aria-checked", "true")
    expect(undoSteps()).toBe(3)
    const event = new KeyboardEvent("keydown", { key: "Delete", bubbles: true, cancelable: true })
    act(() => {
      last.dispatchEvent(event)
    })
    expect(event.defaultPrevented).toBe(false) // not ours: bubbles to the app shortcuts
    expect(color(id)).toMatch(/^#[0-9a-f]{6}$/)
  })

  it("applies the system picker's events live as ONE entry (Chromium: one change)", () => {
    vi.useFakeTimers()
    const id = setup()
    const picker = screen.getByLabelText("System colour picker")
    act(() => picker.focus())
    fireEvent.input(picker, { target: { value: "#ff0000" } })
    fireEvent.input(picker, { target: { value: "#00ff00" } })
    expect(color(id)).toBe("#00ff00")
    fireEvent.change(picker, { target: { value: "#0000ff" } }) // the dialog closed on a choice
    expect(color(id)).toBe("#0000ff")
    act(() => {
      vi.advanceTimersByTime(PICK_IDLE_MS)
    })
    expect(documentHistory.isInGesture()).toBe(false)
    expect(undoSteps()).toBe(1)
    fireEvent.input(picker, { target: { value: "#123456" } })
    act(() => picker.blur()) // dismissed
    expect(documentHistory.isInGesture()).toBe(false)
    expect(undoSteps()).toBe(2)
    documentHistory.undo()
    expect(color(id)).toBe("#0000ff")
    vi.useRealTimers()
  })

  it("WebKitGTK: live updates and a Cancel back to the old colour add no entry", () => {
    vi.useFakeTimers()
    const id = setup()
    const before = useDocumentStore.getState().doc
    const old = color(id) ?? ""
    const picker = screen.getByLabelText("System colour picker")
    // GTK reports every live change as input + change, and Cancel as one more with the old value.
    for (const hex of ["#ff0000", "#00ff00", "#0000ff", old]) {
      fireEvent.input(picker, { target: { value: hex } })
      fireEvent.change(picker, { target: { value: hex } })
    }
    act(() => {
      vi.advanceTimersByTime(PICK_IDLE_MS)
    })
    expect(undoSteps()).toBe(0)
    expect(useDocumentStore.getState().doc).toBe(before) // not an unsaved change either
    vi.useRealTimers()
  })
})
