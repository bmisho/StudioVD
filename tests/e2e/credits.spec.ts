import { readFileSync } from "node:fs"
import type { Page } from "@playwright/test"
import { expect, test, type E2EWindow } from "./fixtures"
import { waitForViewport } from "./viewportHelpers"

// PLAN 9.8, 9.9: a licensed library component is inserted (undo, redo), credited in the
// Project credits dialog and in every export, and survives save → reopen on a machine whose
// library is empty: the project carries its definition, geometry and licence.
test.use({ contextOptions: { reducedMotion: "reduce" } })

const FIXTURE = "src/core/schema/testing/fixtures/library/component-asset.valid.json"
const backend = {
  assetIds: (page: Page) =>
    page.evaluate(() => (window as unknown as E2EWindow).__E2E__.assetIds()),
  exportText: (page: Page, name: string) =>
    page.evaluate((n) => (window as unknown as E2EWindow).__E2E__.exportText(n), name),
  saved: (page: Page, name: string) =>
    page.evaluate((n) => (window as unknown as E2EWindow).__E2E__.savedScene(n), name),
}
const components = (page: Page) =>
  page.evaluate(() => window.__STUDIOVD_VIEWPORT__?.components() ?? [])
const names = async (page: Page) => (await components(page)).map((c) => c.name)

async function menu(page: Page, ...path: (string | RegExp)[]) {
  for (const name of path) await page.getByRole("menuitem", { name }).click()
}

/** The fixture knob, its geometry replaced by an asset the mocked workspace holds. */
function knobManifest(assetId: string): { id: string; version: string; manifest: string } {
  const text = readFileSync(FIXTURE, "utf8").replaceAll("a".repeat(64), assetId)
  const m = JSON.parse(text) as {
    identity: { id: string; version: string }
    materials: { abs: { maps?: unknown } }
    thumbnails: unknown[]
  }
  delete m.materials.abs.maps // no texture file in the mocked library
  m.thumbnails = []
  return { id: m.identity.id, version: m.identity.version, manifest: JSON.stringify(m) }
}

test("a licensed component: undo, redo, credits, exports, reopen without the library", async ({
  page,
}) => {
  test.setTimeout(120_000)
  await waitForViewport(page)
  await page.getByRole("tab", { name: "Library" }).click()
  const list = page.getByRole("listbox", { name: "Components" })
  const search = page.getByRole("searchbox", { name: "Search components" })

  // A generated cube puts a real GLB into the workspace; the pack's component reuses it.
  await search.fill("cube 20")
  await list.getByRole("option", { name: /Cube 20 mm/ }).click()
  await page.getByRole("button", { name: "Insert", exact: true }).click()
  await expect.poll(() => components(page), { timeout: 20_000 }).toHaveLength(1)
  const [assetId] = await backend.assetIds(page)
  await page.keyboard.press("Control+z")
  await expect.poll(() => components(page)).toHaveLength(0)

  await page.evaluate(
    (m) => (window as unknown as E2EWindow).__E2E__.queuePack([m]),
    knobManifest(assetId ?? "")
  )
  await page.getByRole("button", { name: "Install components from a file…" }).click()
  const install = page.getByRole("dialog", { name: "Install components" })
  await install.getByRole("button", { name: "Install" }).click()
  await expect(install).toBeHidden()
  await search.fill("knob")
  await list.getByRole("option", { name: /Knob 15 mm/ }).click()
  await page.getByRole("button", { name: "Insert", exact: true }).click()
  await expect.poll(() => names(page), { timeout: 20_000 }).toEqual(["Knob 15 mm"])
  await page.keyboard.press("Control+z")
  await expect.poll(() => names(page)).toEqual([])
  await page.keyboard.press("Control+y")
  await expect.poll(() => names(page)).toEqual(["Knob 15 mm"])

  // Credits: in the dialog, beside an STL, inside a GLB.
  await menu(page, "Help", "Project Credits…")
  const credits = page.getByRole("dialog", { name: "Project credits" })
  const rows = credits.getByRole("list", { name: "Credits" })
  await expect(rows).toContainText("Knob 15 mm")
  await expect(rows).toContainText("CC-BY-4.0 · Acme Ltd · attribution required")
  await expect(rows).toContainText("Geometry · 1 part")
  await credits.getByRole("button", { name: "Close" }).first().click()
  await expect(credits).toBeHidden()

  await page.getByRole("tab", { name: "Scene" }).click()
  await page.getByRole("tree", { name: "Scene graph" }).getByRole("treeitem").first().click()
  await menu(page, "File", "Export", "STL (.stl)…")
  await expect.poll(() => backend.exportText(page, "Knob.credits.txt")).not.toBeNull()
  const sidecar = (await backend.exportText(page, "Knob.credits.txt")) ?? ""
  expect(sidecar).toContain("Credits for Knob.stl")
  expect(sidecar).toContain("Licence: CC-BY-4.0")
  expect(sidecar).toContain("By: Acme Ltd")
  await menu(page, "File", "Export", "glTF Binary (.glb)…")
  await expect
    .poll(async () => (await backend.exportText(page, "Knob.glb"))?.includes("studiovdCredits"))
    .toBe(true)
  expect(await backend.exportText(page, "Knob.glb")).toContain(
    '"copyright":"(c) 2026 Acme Ltd (CC-BY-4.0)"'
  )

  // Save, empty the library, reopen: the project needs nothing from it.
  await page.keyboard.press("Control+s")
  await expect.poll(() => backend.saved(page, "Untitled.stvd")).not.toBeNull()
  const scene = JSON.parse((await backend.saved(page, "Untitled.stvd")) ?? "{}") as {
    componentDefs: Record<string, { id: string }>
    licenseTexts: Record<string, unknown>
    assets: Record<string, unknown>
  }
  expect(Object.values(scene.componentDefs).map((d) => d.id)).toEqual(["acme/knob-15mm"])
  expect(Object.keys(scene.licenseTexts)).toEqual(["c".repeat(64)])
  expect(Object.keys(scene.assets)).toEqual([assetId])
  await page.evaluate(() => (window as unknown as E2EWindow).__E2E__.clearLibrary())
  await menu(page, "File", /^Close Project/)
  await expect.poll(() => components(page)).toHaveLength(0)
  await page.evaluate(() => (window as unknown as E2EWindow).__E2E__.nextOpen("Untitled.stvd"))
  await page.keyboard.press("Control+o")
  await expect.poll(() => names(page)).toEqual(["Knob 15 mm"])
  await menu(page, "Help", "Project Credits…")
  await expect(credits.getByRole("list", { name: "Credits" })).toContainText("Acme Ltd")
})
