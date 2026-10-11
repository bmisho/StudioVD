import type { Page } from "@playwright/test"
import {
  dropFiles,
  expect,
  exportedFiles,
  fixtureFile,
  queueImportPick,
  storedAssetIds,
  test,
} from "./fixtures"
import { partPose, waitForViewport } from "./viewportHelpers"

// PLAN 4.10: import end to end against the mocked backend. The real worker parses the files
// (occt WASM for STEP), assets are written through the raw IPC path and loaded back.

const parts = (page: Page) => page.evaluate(() => window.__STUDIOVD_VIEWPORT__?.parts() ?? [])
const partMesh = (page: Page, id: string) =>
  page.evaluate((i) => window.__STUDIOVD_VIEWPORT__?.partMesh(i) ?? null, id)

async function importVia(page: Page, files: { name: string; base64: string }[]) {
  await queueImportPick(page, files)
  await page.keyboard.press("Control+i")
  const dialog = page.getByRole("dialog", { name: "Import" })
  await expect(dialog).toBeVisible()
  return dialog
}

test.describe("import", () => {
  test("STEP + STL: real geometry, one undo entry, stored once", async ({ page }) => {
    await waitForViewport(page)
    const dialog = await importVia(page, [fixtureFile("cube.step"), fixtureFile("bracket.stl")])
    await expect(dialog.getByText("cube.step")).toBeVisible()
    // Both conditional options apply: STL has no unit, STEP has a tessellation quality.
    await expect(dialog.getByLabel("Units")).toBeVisible()
    await expect(dialog.getByLabel("STEP/IGES quality")).toBeVisible()
    await dialog.getByRole("button", { name: "Import" }).click()
    await expect(page.getByText("Imported 2 parts from 2 files")).toBeVisible({ timeout: 30_000 })
    await expect(dialog).toBeHidden()

    const tree = page.getByRole("tree", { name: "Scene graph" })
    await expect(tree.getByText("Cube")).toBeVisible()
    await expect(tree.getByText("bracket")).toBeVisible()
    expect(await storedAssetIds(page)).toHaveLength(2)
    const [cube, bracket] = await parts(page)
    // The GLBs come back through the asset URL and replace the bounding boxes.
    await expect.poll(() => partMesh(page, cube?.id ?? "")).toEqual({ triangles: 12, loaded: true })
    await expect.poll(async () => (await partMesh(page, bracket?.id ?? ""))?.loaded).toBe(true)

    await page.keyboard.press("Escape")
    await page.keyboard.press("Control+z")
    await expect(tree.getByText("Cube")).toBeHidden()
    expect(await parts(page)).toEqual([])
    await page.keyboard.press("Control+Shift+z")
    await expect(tree.getByText("bracket")).toBeVisible()
  })

  test("a GLB's assembly node becomes a group", async ({ page }) => {
    const dialog = await importVia(page, [fixtureFile("sample.glb")])
    await expect(dialog.getByLabel("Units")).toBeHidden() // glTF is metres by definition
    await dialog.getByRole("button", { name: "Import" }).click()
    await expect(page.getByText("Imported 2 parts from 1 file")).toBeVisible({ timeout: 30_000 })
    // A flat tree: nesting is aria-level (WAI-ARIA tree pattern), not DOM structure.
    const tree = page.getByRole("tree", { name: "Scene graph" })
    await expect(tree.getByRole("treeitem", { name: "Assembly" })).toHaveAttribute(
      "aria-level",
      "1"
    )
    await expect(tree.getByRole("treeitem", { name: "Plate" })).toHaveAttribute("aria-level", "2")
    await expect(tree.getByRole("treeitem", { name: "Peg" })).toHaveAttribute("aria-level", "2")
  })

  test("DRACO and meshopt GLBs decode with the bundled decoders", async ({ page }) => {
    const dialog = await importVia(page, [
      fixtureFile("sample-draco.glb"),
      fixtureFile("sample-meshopt.glb"),
    ])
    await dialog.getByRole("button", { name: "Import" }).click()
    await expect(page.getByText("Imported 4 parts from 2 files")).toBeVisible({ timeout: 30_000 })
    // Same placement as the uncompressed sample.glb (Plate at x 100 mm, Peg 20 mm above it).
    const poses = await Promise.all(
      (await parts(page)).map(async (p) => [p.name, await partPose(page, p.id)] as const)
    )
    expect(poses.map(([name, pose]) => [name, pose?.position.map((v) => Math.round(v))])).toEqual([
      ["Plate", [100, 0, 0]],
      ["Peg", [100, 20, 0]],
      ["Plate", [100, 0, 0]],
      ["Peg", [100, 20, 0]],
    ])
  })

  test("dropped files open the dialog; other items are reported", async ({ page }) => {
    await dropFiles(page, [fixtureFile("bracket.stl")], ["notes.txt"])
    await expect(page.getByText("Some dropped items cannot be imported")).toBeVisible()
    const dialog = page.getByRole("dialog", { name: "Import" })
    await expect(dialog.getByText("bracket.stl")).toBeVisible()
    await dialog.getByRole("button", { name: "Cancel" }).click()
    await expect(dialog).toBeHidden()
    expect(await parts(page)).toEqual([])
  })

  test("exports the assembly as GLB and a selected part as STL", async ({ page }) => {
    await waitForViewport(page)
    const dialog = await importVia(page, [fixtureFile("cube.step"), fixtureFile("bracket.stl")])
    await dialog.getByRole("button", { name: "Import" }).click()
    await expect(page.getByText("Imported 2 parts from 2 files")).toBeVisible({ timeout: 30_000 })
    const [cube] = await parts(page)
    await expect.poll(async () => (await partMesh(page, cube?.id ?? ""))?.loaded).toBe(true)

    await page.getByRole("tree", { name: "Scene graph" }).getByText("Cube").click()
    await page.getByRole("menuitem", { name: "File" }).click()
    await page.getByRole("menuitem", { name: "Export" }).click()
    await page.getByRole("menuitem", { name: "STL (.stl)…" }).click()
    const written = async () => (await exportedFiles(page)).filter((f) => f.size > 0)
    await expect.poll(async () => (await written()).length).toBe(1)
    const [stl] = await written()
    expect(stl?.name).toBe("Cube.stl")
    // Binary STL: 80-byte header, uint32 triangle count, 50 bytes per triangle.
    const count = new DataView(new Uint8Array(stl?.head ?? []).buffer).getUint32(80, true)
    expect(count).toBe(12)
    expect(stl?.size).toBe(84 + 50 * 12)

    // Ctrl+click toggles the part off: with nothing selected, export takes everything.
    const tree = page.getByRole("tree", { name: "Scene graph" })
    await tree.getByText("Cube").click({ modifiers: ["Control"] })
    await expect(tree.locator('[aria-selected="true"]')).toHaveCount(0)
    await page.getByRole("menuitem", { name: "File" }).click()
    await page.getByRole("menuitem", { name: "Export" }).click()
    await page.getByRole("menuitem", { name: "glTF Binary (.glb)…" }).click()
    await expect.poll(async () => (await written()).length).toBe(2)
    const glb = (await written())[1]
    expect(glb?.name).toBe("assembly.glb")
    expect(String.fromCharCode(...(glb?.head.slice(0, 4) ?? []))).toBe("glTF")
  })
})
