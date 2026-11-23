import type { Page } from "@playwright/test"
import { expect, fixtureFile, queueImportPick, test, type E2EWindow } from "./fixtures"
import { insertTestRig, partCenter, waitForViewport } from "./viewportHelpers"

// Phase 6 end to end against the mocked backend: material slots from a coloured STEP file,
// display modes, assigning and editing materials.

const parts = (page: Page) => page.evaluate(() => window.__STUDIOVD_VIEWPORT__?.parts() ?? [])
const partLook = (page: Page, id: string) =>
  page.evaluate((i) => window.__STUDIOVD_VIEWPORT__?.partLook(i) ?? null, id)
const savedScene = (page: Page, name: string) =>
  page.evaluate((n) => (window as unknown as E2EWindow).__E2E__.savedScene(n), name)
const pickAt = (page: Page, x: number, y: number) =>
  page.evaluate(([px, py]) => window.__STUDIOVD_VIEWPORT__?.pickAt(px, py) ?? null, [x, y])

async function importColouredCube(page: Page): Promise<string> {
  await waitForViewport(page)
  await queueImportPick(page, [fixtureFile("cube-colours.step")])
  await page.keyboard.press("Control+i")
  const dialog = page.getByRole("dialog", { name: "Import" })
  await dialog.getByRole("button", { name: "Import" }).click()
  // The outcome, not the "Imported 1 part" toast: that one hides after a few seconds, and on a
  // GPU-less runner the new part's first render can hold the page for about as long (WebKit
  // CI once never saw it). A failure names the toasts shown, say "The project is busy".
  try {
    await expect(dialog).toBeHidden({ timeout: 30_000 })
    await expect.poll(async () => (await parts(page)).length, { timeout: 15_000 }).toBe(1)
  } catch (e) {
    const toasts = await page.locator("[data-sonner-toast]").allInnerTexts()
    throw new Error(`the import did not finish; toasts: ${JSON.stringify(toasts)}`, { cause: e })
  }
  const [cube] = await parts(page)
  if (!cube) throw new Error("no part imported")
  // Loaded: one material per slot (grey body, red and blue faces).
  await expect.poll(async () => (await partLook(page, cube.id))?.materials.length).toBe(3)
  return cube.id
}

async function displayStyle(page: Page, name: string) {
  await page.getByRole("menuitem", { name: "View" }).click()
  await page.getByRole("menuitem", { name: "Display Style" }).click()
  // By keyboard: a mouse jump to the item can cross the parent menu's other items and close
  // the submenu first when the page is busy (it did, under parallel E2E load).
  await page.getByRole("menuitemradio", { name, exact: true }).press("Enter")
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

  test("wireframe keeps the faces of a part drawn as its bounding box", async ({ page }) => {
    await waitForViewport(page)
    await insertTestRig(page)
    await page.keyboard.press("Control+s") // untitled: Save As
    await expect.poll(() => savedScene(page, "Untitled.stvd")).not.toBeNull()
    // The same project listing slots its geometry lacks (a hand-edited or hostile file): the
    // GLBs load, disagree with it, and the parts keep their bounding boxes for good.
    const scene = JSON.parse((await savedScene(page, "Untitled.stvd")) ?? "{}") as {
      assets: Record<string, { slots?: string[] }>
    }
    for (const asset of Object.values(scene.assets)) asset.slots = ["Body", "Trim"]
    await page.evaluate((text) => {
      const backend = (window as unknown as E2EWindow).__E2E__
      backend.putProject("edited.stvd", text)
      backend.nextOpen("edited.stvd")
    }, JSON.stringify(scene))
    const [part] = await parts(page)
    const id = part?.id ?? "" // the same ids: the same scene, opened again
    const loaded = () => page.evaluate((i) => window.__STUDIOVD_VIEWPORT__?.partMesh(i)?.loaded, id)
    expect(await loaded()).toBe(true)
    await page.keyboard.press("Control+o")
    await expect.poll(loaded).toBe(false)
    await displayStyle(page, "Wireframe")
    await expect.poll(() => partLook(page, id)).toMatchObject({ edgeSegments: 0 })
    expect((await partLook(page, id))?.facesVisible).toBe(true) // not invisible yet pickable
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

  test("presets, editing, a texture and dragging a preset onto a part", async ({ page }) => {
    const warnings: string[] = []
    page.on("console", (m) => {
      if (m.type() === "warning" || m.type() === "error") warnings.push(m.text())
    })
    const id = await importColouredCube(page)
    const centre = await partCenter(page, id)
    await page.mouse.click(centre.x, centre.y)
    const panel = page.getByRole("complementary", { name: "Properties" })
    const names = async () => (await partLook(page, id))?.materials.map((m) => m.name)

    // A preset applies to the selection; every slot follows the part's material.
    const presets = panel.getByRole("toolbar", { name: "Material presets" })
    await presets.getByRole("button", { name: "Steel", exact: true }).click()
    await expect.poll(names).toEqual(["Steel", "Steel", "Steel"])
    await expect(panel.getByRole("combobox", { name: "Material" })).toHaveText("Steel")

    // Editing the shared material: one undo entry per committed edit.
    const hex = panel.getByRole("textbox", { name: "Colour", exact: true })
    await hex.fill("#ff0000")
    await hex.press("Enter")
    await expect.poll(async () => (await partLook(page, id))?.materials[0]?.color).toBe("#ff0000")
    await page.keyboard.press("Control+z")
    await expect
      .poll(async () => (await partLook(page, id))?.materials[0]?.color)
      .not.toBe("#ff0000")

    // A colour image: chosen through Rust (mocked), stored once, drawn without errors.
    await page.evaluate(
      (file) => (window as unknown as E2EWindow).__E2E__.queueTexture(file),
      fixtureFile("checker.png")
    )
    const image = panel.getByRole("group", { name: "Colour image" })
    await image.getByRole("button", { name: "Choose image…" }).click()
    await expect(image.getByText(/^Image [0-9a-f]{8}$/)).toBeVisible()
    expect(
      await page.evaluate(() => (window as unknown as E2EWindow).__E2E__.textureIds().length)
    ).toBe(1)

    // Dragging a preset tile onto the part gives that part the preset.
    const copper = presets.getByRole("button", { name: "Copper", exact: true })
    await copper.scrollIntoViewIfNeeded() // the editor below scrolled the panel
    const box = await copper.boundingBox()
    if (!box) throw new Error("no Copper tile")
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(centre.x, centre.y, { steps: 8 })
    await page.mouse.up()
    await expect.poll(names).toEqual(["Copper", "Copper", "Copper"])
    expect(warnings.filter((w) => /texture|not loaded|shader/i.test(w))).toEqual([])
  })
})
