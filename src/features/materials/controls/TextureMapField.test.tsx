import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { MaterialId } from "@/core/schema"
import { SAMPLE_TEXTURE } from "@/core/schema/testing/sampleDocument"
import { toastNotifier } from "@/lib/notify"
import { importTexture, type ImportedTexture } from "@/lib/tauri/files"
import { err, ok } from "@/lib/tauri/result"
import { useDocumentStore } from "@/store/document/documentStore"
import { resetStores } from "@/test/resetStores"
import { TextureMapField } from "./TextureMapField"

vi.mock("@/lib/tauri/files", () => ({ importTexture: vi.fn() }))

const image = (id: string): ImportedTexture => ({
  id,
  ext: "jpg",
  name: "oak.jpg",
  width: 512,
  height: 512,
})

/** A new custom material without maps, a clean history, and its colour map field. */
function setup() {
  resetStores()
  vi.mocked(importTexture).mockReset()
  const id = useDocumentStore.getState().createMaterial()
  useDocumentStore.temporal.getState().clear()
  render(<TextureMapField materialId={id} kind="baseColor" label="Colour image" />)
  return id
}

const doc = () => useDocumentStore.getState().doc
const maps = (id: MaterialId) => doc().materials[id]?.maps
const undoSteps = () => useDocumentStore.temporal.getState().pastStates.length

describe("TextureMapField", () => {
  beforeEach(resetStores)

  it("adds the chosen image with a 50 mm tile, edits the tile and removes it", async () => {
    const id = setup()
    vi.mocked(importTexture).mockResolvedValue(ok(image(SAMPLE_TEXTURE)))
    expect(screen.getByText("None")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Choose image…" }))
    await waitFor(() => expect(maps(id)?.baseColor).toBeDefined())
    expect(maps(id)?.baseColor).toEqual({ textureId: SAMPLE_TEXTURE, tileSizeMm: 50 })
    const path = `textures/${SAMPLE_TEXTURE}.jpg`
    expect(doc().textures).toEqual({ [SAMPLE_TEXTURE]: { id: SAMPLE_TEXTURE, path } })
    expect(screen.getByText(`Image ${SAMPLE_TEXTURE.slice(0, 8)}`)).toBeInTheDocument()
    expect(undoSteps()).toBe(1)

    const tile = screen.getByRole("textbox", { name: "Tile size (mm)" })
    act(() => tile.focus())
    fireEvent.change(tile, { target: { value: "2" } })
    fireEvent.change(tile, { target: { value: "25" } })
    fireEvent.keyDown(tile, { key: "Enter" })
    expect(maps(id)?.baseColor?.tileSizeMm).toBe(25)
    expect(undoSteps()).toBe(2)

    const other = "cd".repeat(32)
    vi.mocked(importTexture).mockResolvedValue(ok(image(other)))
    fireEvent.click(screen.getByRole("button", { name: "Replace image…" }))
    await waitFor(() => expect(maps(id)?.baseColor?.textureId).toBe(other))
    expect(maps(id)?.baseColor?.tileSizeMm).toBe(25) // a new image keeps the tile size
    expect(Object.keys(doc().textures)).toEqual([other]) // the old one is unused now

    fireEvent.click(screen.getByRole("button", { name: "Remove" }))
    expect(maps(id)).toBeUndefined()
    expect(doc().textures).toEqual({}) // no material uses it any more
    expect(screen.getByRole("button", { name: "Choose image…" })).toHaveFocus()
    expect(undoSteps()).toBe(4)
  })

  it("changes nothing when cancelled, and reports errors and bad ids", async () => {
    const id = setup()
    const before = doc()
    const reported = vi.spyOn(toastNotifier, "error").mockImplementation(() => undefined)
    const choose = screen.getByRole("button", { name: "Choose image…" })
    const settle = () => act(async () => {})

    vi.mocked(importTexture).mockResolvedValueOnce(ok(null))
    fireEvent.click(choose)
    await settle()
    expect(reported).not.toHaveBeenCalled()

    vi.mocked(importTexture).mockResolvedValueOnce(err({ kind: "io", message: "disk full" }))
    fireEvent.click(choose)
    await settle()
    expect(reported).toHaveBeenLastCalledWith("Could not add the image", "disk full")

    vi.mocked(importTexture).mockResolvedValueOnce(ok(image("../../etc/passwd")))
    fireEvent.click(choose)
    await settle()
    expect(reported).toHaveBeenCalledTimes(2)
    expect(maps(id)).toBeUndefined()
    expect(doc()).toBe(before)
    reported.mockRestore()
  })
})
