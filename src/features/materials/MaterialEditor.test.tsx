import { act, fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import type { MaterialId, PartId } from "@/core/schema"
import { sampleDocument } from "@/core/schema/testing/sampleDocument"
import { useDocumentStore } from "@/store/document/documentStore"
import { resetStores } from "@/test/resetStores"
import { MaterialEditor } from "./MaterialEditor"

/** The sample with its steel on both parts (the second also has rubber on its Trim slot). */
function setup() {
  resetStores()
  const doc = sampleDocument()
  const [first, second] = Object.values(doc.parts).map((p) => p.id)
  const steel = Object.values(doc.materials).find((m) => m.name === "Steel")?.id
  const rubber = Object.values(doc.materials).find((m) => m.name === "Rubber")?.id
  if (!first || !second || !steel || !rubber) throw new Error("sample incomplete")
  useDocumentStore.setState({ doc })
  useDocumentStore.getState().assignMaterial([first, second], steel)
  useDocumentStore.temporal.getState().clear()
  return { first, second, steel, rubber }
}

const s = () => useDocumentStore.getState()
const material = (id: MaterialId) => s().doc.materials[id]
const partOf = (id: PartId) => s().doc.parts[id]
const undoSteps = () => useDocumentStore.temporal.getState().pastStates.length

/** The editor for a part's own material, as the part inspector mounts it. */
function PartMaterial({ partId }: { partId: PartId }) {
  const id = useDocumentStore((st) => st.doc.parts[partId]?.materialId)
  return id ? <MaterialEditor materialId={id} partIds={[partId]} /> : null
}

describe("MaterialEditor", () => {
  beforeEach(resetStores)

  it("shows the material's values, its preset, the density source and its users", () => {
    const { first, steel } = setup()
    render(<MaterialEditor materialId={steel} partIds={[first]} />)
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("Steel")
    expect(screen.getByRole("slider", { name: "Metalness" })).toHaveAttribute("aria-valuenow", "1")
    expect(screen.getByRole("textbox", { name: "Density (kg/m³)" })).toHaveValue("7850")
    expect(screen.getByRole("group", { name: "Colour image" })).toBeInTheDocument()
    expect(screen.getByText(/Based on Steel\. Density: EN 1991-1-1/)).toHaveTextContent(
      "(high confidence)"
    )
    expect(screen.getByText("Used by 2 parts")).toBeInTheDocument()
  })

  it("renames the material as one undo entry", () => {
    const { first, steel } = setup()
    render(<MaterialEditor materialId={steel} partIds={[first]} />)
    const name = screen.getByRole("textbox", { name: "Name" })
    act(() => name.focus())
    fireEvent.change(name, { target: { value: "Bright" } })
    fireEvent.change(name, { target: { value: "Bright steel" } })
    fireEvent.keyDown(name, { key: "Enter" })
    expect(material(steel)?.name).toBe("Bright steel")
    expect(undoSteps()).toBe(1)
  })

  it("turns glass on and off as one entry each, showing the glass values only while on", () => {
    const { first, steel } = setup()
    s().updateMaterial(steel, { opacity: 0.5 })
    render(<MaterialEditor materialId={steel} partIds={[first]} />)
    const glass = screen.getByRole("switch", { name: "Glass" })
    expect(screen.queryByRole("slider", { name: "IOR" })).toBeNull()
    fireEvent.click(glass)
    expect(material(steel)).toMatchObject({ transmission: 1, opacity: 1 })
    expect(screen.getByRole("slider", { name: "IOR" })).toBeInTheDocument()
    expect(screen.getByRole("textbox", { name: "Thickness (mm)" })).toBeInTheDocument()
    fireEvent.click(glass)
    expect(material(steel)?.transmission).toBe(0)
    expect(screen.queryByRole("slider", { name: "IOR" })).toBeNull()
    expect(undoSteps()).toBe(3)
  })

  it("keeps the glass values while transmission is typed (0 of 0.5 stops at 0.01)", () => {
    const { first, steel } = setup()
    render(<MaterialEditor materialId={steel} partIds={[first]} />)
    fireEvent.click(screen.getByRole("switch", { name: "Glass" }))
    const transmission = screen.getByRole("textbox", { name: "Transmission" })
    act(() => transmission.focus())
    fireEvent.change(transmission, { target: { value: "0" } })
    expect(material(steel)?.transmission).toBe(0.01)
    expect(transmission).toBeInTheDocument()
    expect(document.activeElement).toBe(transmission)
    fireEvent.change(transmission, { target: { value: "0.5" } })
    expect(material(steel)?.transmission).toBe(0.5)
  })

  it("steps a slider from a value past its usual span, and reads values out", () => {
    const { first, steel } = setup()
    s().updateMaterial(steel, { emissiveIntensity: 50 }) // typed: the field takes up to 100
    render(<MaterialEditor materialId={steel} partIds={[first]} />)
    const glow = screen.getByRole("slider", { name: "Glow" })
    expect(glow).toHaveAttribute("aria-valuetext", "50")
    act(() => glow.focus())
    fireEvent.keyDown(glow, { key: "ArrowDown" })
    expect(material(steel)?.emissiveIntensity).toBeCloseTo(49.9, 9)
  })

  it("gives the shown parts a copy on Make unique, offered only while others share it", () => {
    const { first, second, steel } = setup()
    render(<PartMaterial partId={first} />)
    fireEvent.click(screen.getByRole("button", { name: "Make unique" }))
    const copy = partOf(first)?.materialId
    expect(copy).not.toBe(steel)
    expect(copy && material(copy)?.name).toBe("Steel 2")
    expect(partOf(second)?.materialId).toBe(steel)
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("Steel 2")
    expect(screen.getByText("Used by 1 part")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Make unique" })).toBeNull()
    expect(undoSteps()).toBe(1)
  })

  it("counts slot overrides as users, and renders nothing once the material is deleted", () => {
    const { second, rubber } = setup()
    const { container } = render(<MaterialEditor materialId={rubber} partIds={[second]} />)
    expect(screen.getByText("Used by 1 part")).toBeInTheDocument()
    expect(screen.getByText(/low confidence/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Delete material" }))
    expect(material(rubber)).toBeUndefined()
    expect(partOf(second)?.materialSlots).toBeUndefined()
    expect(container).toBeEmptyDOMElement()
    act(() => useDocumentStore.temporal.getState().undo())
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("Rubber")
  })
})
