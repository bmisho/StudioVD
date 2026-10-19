import { act, fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import {
  DENSITY_FIELD,
  GLASS_FIELDS,
  SURFACE_FIELDS,
  type MaterialField,
} from "@/core/materials/materialFields"
import type { MaterialId } from "@/core/schema"
import { useDocumentStore } from "@/store/document/documentStore"
import { documentHistory } from "@/store/document/history"
import { resetStores } from "@/test/resetStores"
import { MaterialSlider } from "./MaterialSlider"

const field = (key: string, fields: readonly MaterialField[] = SURFACE_FIELDS) => {
  const found = fields.find((f) => f.key === key)
  if (!found) throw new Error(`no field ${key}`)
  return found
}
const ROUGHNESS = field("roughness")
const THICKNESS = field("thicknessMm", GLASS_FIELDS)

/** A new custom material (roughness 0.5, thickness 0) with a clean history. */
function setup() {
  resetStores()
  const id = useDocumentStore.getState().createMaterial()
  if (!id) throw new Error("no material")
  useDocumentStore.temporal.getState().clear()
  return id
}

const material = (id: MaterialId) => useDocumentStore.getState().doc.materials[id]
const undoSteps = () => useDocumentStore.temporal.getState().pastStates.length

function Bound({ id, f, slider }: { id: MaterialId; f: MaterialField; slider?: boolean }) {
  const value = useDocumentStore((s) => s.doc.materials[id]?.[f.key] ?? 0)
  const update = useDocumentStore((s) => s.updateMaterial)
  return (
    <MaterialSlider
      field={f}
      value={value}
      slider={slider}
      onChange={(v) => update(id, { [f.key]: v })}
    />
  )
}

describe("MaterialSlider", () => {
  beforeEach(resetStores)

  it("names the slider and the number field, with the hint as their description", () => {
    const id = setup()
    render(<Bound id={id} f={THICKNESS} />)
    const thumb = screen.getByRole("slider", { name: "Thickness" })
    expect(thumb).toHaveAccessibleDescription(THICKNESS.hint)
    expect(thumb).toHaveAttribute("aria-valuetext", "0 mm")
    expect(thumb).toHaveAttribute("aria-valuemax", "50") // the slider's span, not the bounds
    const input = screen.getByRole("textbox", { name: "Thickness (mm)" })
    expect(input).toHaveAccessibleDescription(THICKNESS.hint)
  })

  it("makes a burst of slider keys ONE undo entry, ended by blur", () => {
    const id = setup()
    render(<Bound id={id} f={ROUGHNESS} />)
    const thumb = screen.getByRole("slider", { name: "Roughness" })
    act(() => thumb.focus())
    for (let i = 0; i < 3; i++) fireEvent.keyDown(thumb, { key: "ArrowRight" })
    expect(material(id)?.roughness).toBeCloseTo(0.53)
    expect(screen.getByRole("textbox", { name: "Roughness" })).toHaveValue("0.53")
    expect(documentHistory.isInGesture()).toBe(true)
    act(() => thumb.blur())
    expect(documentHistory.isInGesture()).toBe(false)
    expect(undoSteps()).toBe(1)
    documentHistory.undo()
    expect(material(id)?.roughness).toBe(0.5)
  })

  it("ends a key burst on any other key, so Ctrl+Z right after can undo it", () => {
    const id = setup()
    render(<Bound id={id} f={ROUGHNESS} />)
    const thumb = screen.getByRole("slider", { name: "Roughness" })
    act(() => thumb.focus())
    fireEvent.keyDown(thumb, { key: "End" })
    fireEvent.keyDown(thumb, { key: "Control" }) // a modifier alone keeps the burst open
    expect(documentHistory.isInGesture()).toBe(true)
    fireEvent.keyDown(thumb, { key: "z", ctrlKey: true })
    expect(documentHistory.isInGesture()).toBe(false)
    expect(material(id)?.roughness).toBe(1)
    expect(undoSteps()).toBe(1)
  })

  it("applies a typed number live and commits it as ONE entry on Enter", () => {
    const id = setup()
    render(<Bound id={id} f={ROUGHNESS} />)
    const input = screen.getByRole("textbox", { name: "Roughness" })
    act(() => input.focus())
    fireEvent.change(input, { target: { value: "0.2" } })
    expect(material(id)?.roughness).toBe(0.2)
    fireEvent.change(input, { target: { value: "0,25" } }) // a comma decimal works too
    fireEvent.keyDown(input, { key: "Enter" })
    expect(input).not.toHaveFocus()
    expect(material(id)?.roughness).toBe(0.25)
    expect(undoSteps()).toBe(1)
  })

  it("restores the value on Escape", () => {
    const id = setup()
    render(<Bound id={id} f={ROUGHNESS} />)
    const input = screen.getByRole("textbox", { name: "Roughness" })
    act(() => input.focus())
    fireEvent.change(input, { target: { value: "0.9" } })
    expect(material(id)?.roughness).toBe(0.9)
    fireEvent.keyDown(input, { key: "Escape" })
    expect(material(id)?.roughness).toBe(0.5)
    expect(input).toHaveValue("0.5")
    expect(undoSteps()).toBe(0)
  })

  it("flags text that is not a number, applies nothing for it, and clamps to the bounds", () => {
    const id = setup()
    render(<Bound id={id} f={ROUGHNESS} />)
    const input = screen.getByRole("textbox", { name: "Roughness" })
    act(() => input.focus())
    fireEvent.change(input, { target: { value: "abc" } })
    expect(input).toHaveAttribute("aria-invalid", "true")
    expect(material(id)?.roughness).toBe(0.5)
    fireEvent.change(input, { target: { value: "7" } })
    expect(input).not.toHaveAttribute("aria-invalid")
    expect(material(id)?.roughness).toBe(1)
    act(() => input.blur())
    expect(input).toHaveValue("1") // the stored value shows again
  })

  it("shows the number field alone without the slider", () => {
    const id = setup()
    render(<Bound id={id} f={DENSITY_FIELD} slider={false} />)
    expect(screen.queryByRole("slider")).toBeNull()
    const input = screen.getByRole("textbox", { name: "Density (kg/m³)" })
    expect(input).toHaveValue("1040") // no digit grouping, so the text parses back
  })
})
