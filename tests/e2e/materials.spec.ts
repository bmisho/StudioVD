import type { Page } from "@playwright/test"
import { expect, fixtureFile, queueImportPick, test } from "./fixtures"
import { partCenter, waitForViewport } from "./viewportHelpers"

// Phase 6 end to end against the mocked backend: material slots from a coloured STEP file,
// display modes, assigning and editing materials.

const parts = (page: Page) => page.evaluate(() => window.__STUDIOVD_VIEWPORT__?.parts() ?? [])
const partLook = (page: Page, id: string) =>
  page.evaluate((i) => window.__STUDIOVD_VIEWPORT__?.partLook(i) ?? null, id)
const pickAt = (page: Page, x: number, y: number) =>
  page.evaluate(([px, py]) => window.__STUDIOVD_VIEWPORT__?.pickAt(px, py) ?? null, [x, y])

async function importColouredCube(page: Page): Promise<string> {
  await waitForViewport(page)
  await queueImportPick(page, [fixtureFile("cube-colours.step")])
  await page.keyboard.press("Control+i")
  const dialog = page.getByRole("dialog", { name: "Import" })
  await dialog.getByRole("button", { name: "Import" }).click()
  await expect(page.getByText("Imported 1 part from 1 file")).toBeVisible({ timeout: 30_000 })
  await expect(dialog).toBeHidden({ timeout: 15_000 })
  const [cube] = await parts(page)
  if (!cube) throw new Error("no part imported")
  // Loaded: one material per slot (grey body, red and blue faces).
  await expect.poll(async () => (await partLook(page, cube.id))?.materials.length).toBe(3)
  return cube.id
}

async function displayStyle(page: Page, name: string) {
  await page.getByRole("menuitem", { name: "View" }).click()
  await page.getByRole("menuitem", { name: "Display Style" }).click()
  await page.getByRole("menuitemradio", { name, exact: true }).click()
}

test.describe("materials", () => {
  test.describe.configure({ timeout: 60_000 })

  test("display styles: edges, wireframe (still pickable) and X-ray", async ({ page }) => {
    const id = await importColouredCube(page)
    expect((await partLook(page, id))?.edgeSegments).toBe(0)

    await displayStyle(page, "Shaded with Edges")
    // The cube's 12 edges, computed in the asset worker on first use.
    await expect.poll(async () => (await partLook(page, id))?.edgeSegments).toBe(12)
    expect((await partLook(page, id))?.facesVisible).toBe(true)

    await displayStyle(page, "Wireframe")
    await expect.poll(async () => (await partLook(page, id))?.facesVisible).toBe(false)
    const centre = await partCenter(page, id)
    expect(await pickAt(page, centre.x, centre.y)).toBe(id)

    await displayStyle(page, "X-Ray")
    await expect
      .poll(async () => (await partLook(page, id))?.materials.map((m) => m.name))
      .toEqual(["XRay", "XRay", "XRay"])

    await displayStyle(page, "Shaded")
    await expect.poll(async () => (await partLook(page, id))?.edgeSegments).toBe(0)
  })

  test("the slots of a coloured STEP part are listed with their own materials", async ({
    page,
  }) => {
    const id = await importColouredCube(page)
    const centre = await partCenter(page, id)
    await page.mouse.click(centre.x, centre.y)
    const panel = page.getByRole("complementary", { name: "Properties" })
    await expect(panel.getByRole("combobox", { name: "Material" })).toHaveText("Imported colours")
    for (const slot of ["#999999", "#FF0000", "#0000FF"])
      await expect(panel.getByRole("combobox", { name: slot })).toHaveText("Part material")
  })
})
