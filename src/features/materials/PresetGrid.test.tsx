import { act, fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { BUILTIN_MATERIALS } from "@/core/materials/builtinMaterials"
import type { PartId } from "@/core/schema"
import { sampleDocument } from "@/core/schema/testing/sampleDocument"
import { useDocumentStore } from "@/store/document/documentStore"
import { resetStores } from "@/test/resetStores"
import { PresetGrid } from "./PresetGrid"

// Previews need the 3D view's renderer; the grid's behaviour does not.
vi.mock("./MaterialThumb", () => ({ MaterialThumb: () => null }))

function setup() {
  resetStores()
  const doc = sampleDocument()
  useDocumentStore.setState({ doc })
  return Object.values(doc.parts).map((p) => p.id)
}

const tile = (name: string) => screen.getByRole("button", { name })
const materialOf = (id: PartId) => {
  const { doc } = useDocumentStore.getState()
  const m = doc.parts[id]?.materialId
  return m ? doc.materials[m]?.name : null
}

describe("preset grid", () => {
  beforeEach(resetStores)

  it("is one tab stop; arrows move by tile and by row", () => {
    const parts = setup()
    render(<PresetGrid partIds={parts} />)
    const tiles = screen.getAllByRole("button")
    expect(tiles).toHaveLength(BUILTIN_MATERIALS.length)
    expect(tiles.filter((t) => t.tabIndex === 0)).toEqual([tiles[0]])
    act(() => tiles[0]?.focus())
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "ArrowRight" })
    expect(tiles[1]).toHaveFocus()
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "ArrowDown" })
    expect(tiles[5]).toHaveFocus()
    expect(tiles[5]).toHaveAttribute("tabindex", "0")
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "End" })
    expect(tiles.at(-1)).toHaveFocus()
  })

  it("gives the preset to the selected parts and shows it as pressed", () => {
    const parts = setup()
    render(<PresetGrid partIds={parts} />)
    fireEvent.click(tile("Copper"))
    expect(parts.map(materialOf)).toEqual(parts.map(() => "Copper"))
    expect(tile("Copper")).toHaveAttribute("aria-pressed", "true")
    expect(tile("Steel")).toHaveAttribute("aria-pressed", "false")
  })

  it("does nothing without parts, but stays focusable and says why", () => {
    setup()
    render(<PresetGrid partIds={[]} />)
    const copper = tile("Copper")
    expect(copper).toHaveAttribute("aria-disabled", "true")
    expect(copper).toHaveAttribute("title", expect.stringContaining("Select parts first"))
    const before = useDocumentStore.getState().doc
    fireEvent.click(copper)
    expect(useDocumentStore.getState().doc).toBe(before)
  })
})
