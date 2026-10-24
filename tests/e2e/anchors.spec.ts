import type { Page } from "@playwright/test"
import { expect, fixtureFile, queueImportPick, test } from "./fixtures"
import { project, waitForViewport } from "./viewportHelpers"

// PLAN 7.5: anchors on a real STEP part. plate-hole.step: a 40 x 8 x 30 mm plate lying flat
// (y up, its top at world y = 8) with a Ø8 mm through hole centred at x = 5, z = 0. Its asset
// is centred on its box, so part coordinates are world coordinates minus (0, 4, 0).
test.use({ contextOptions: { reducedMotion: "reduce" } })

const anchors = (page: Page) => page.evaluate(() => window.__STUDIOVD_VIEWPORT__?.anchors() ?? [])
const preview = (page: Page) =>
  page.evaluate(() => window.__STUDIOVD_VIEWPORT__?.anchorPreview() ?? null)
/** Each component within `mm` (snaps are exact; a hit on a face is where the cursor is). */
const close = (v: number[] | undefined, w: number[], mm = 1e-3) =>
  w.forEach((x, i) => expect(Math.abs((v?.[i] ?? Infinity) - x)).toBeLessThan(mm))

async function importPlate(page: Page) {
  await waitForViewport(page)
  await queueImportPick(page, [fixtureFile("plate-hole.step")])
  await page.keyboard.press("Control+i")
  const dialog = page.getByRole("dialog", { name: "Import" })
  await dialog.getByRole("button", { name: "Import" }).click()
  await expect(dialog).toBeHidden({ timeout: 30_000 })
  const [plate] = await page.evaluate(() => window.__STUDIOVD_VIEWPORT__?.parts() ?? [])
  const id = plate?.id ?? ""
  await expect
    .poll(() => page.evaluate((i) => window.__STUDIOVD_VIEWPORT__?.partMesh(i)?.loaded, id))
    .toBe(true)
  return id
}

/**
 * Hovers a world point and waits for the preview. Nudges once, so a move is seen, unless
 * `once`: then a single move, which is also what asks for the part's snap features, so the
 * snap can only show up once they arrive with the cursor standing still.
 */
async function hover(page: Page, world: [number, number, number], snap: string, once = false) {
  const p = await project(page, world)
  if (!once) await page.mouse.move(p.x - 1, p.y)
  await page.mouse.move(p.x, p.y)
  await expect.poll(async () => (await preview(page))?.snap).toBe(snap)
  return p
}

test.describe("anchors", () => {
  test.describe.configure({ timeout: 60_000 })

  test("Place Anchor near the hole's rim gives an axial anchor through the hole", async ({
    page,
  }) => {
    const plate = await importPlate(page)
    const toolbar = page.getByRole("toolbar", { name: "Main toolbar" })
    await toolbar.getByRole("button", { name: "Place Anchor" }).click()
    const hint = page.getByRole("status").filter({ hasText: "Place Anchor" })
    await expect(hint).toBeVisible()

    // On the top face just off the rim, the first move over the part: the circle snap must
    // appear when its snap features arrive from the worker, without another move.
    const rim = await hover(page, [9.5, 8, 0], "circle", true)
    await expect(hint).toContainText("Hole Ø8 centre")
    await page.mouse.click(rim.x, rim.y)
    await expect.poll(async () => (await anchors(page)).length).toBe(1)
    const [hole] = await anchors(page)
    expect(hole).toMatchObject({ partId: plate, kind: "axial", name: "Hole Ø8" })
    close(hole?.frame.originMm, [5, 4, 0]) // the hole's centre on the top face
    close(hole?.frame.z, [0, 1, 0], 1e-6) // out of the hole's mouth
    const panel = page.getByRole("complementary", { name: "Properties" })
    await expect(panel.getByRole("textbox", { name: "Name" })).toHaveValue("Hole Ø8")
    await expect(panel.getByRole("combobox", { name: "Kind" })).toHaveText("Axial (an axis)")

    await page.keyboard.press("Control+z")
    await expect.poll(async () => (await anchors(page)).length).toBe(0)
    await page.keyboard.press("Control+y")
    await expect.poll(async () => (await anchors(page)).length).toBe(1)
  })

  test("face and corner snaps, picking an anchor in 3D, deleting it", async ({ page }) => {
    await importPlate(page)
    await page
      .getByRole("toolbar", { name: "Main toolbar" })
      .getByRole("button", {
        name: "Place Anchor",
      })
      .click()
    const face = await hover(page, [-10, 8, -5], "face")
    await page.mouse.click(face.x, face.y)
    const corner = await hover(page, [19.6, 8, 14.6], "corner")
    await page.mouse.click(corner.x, corner.y)
    await expect
      .poll(async () => (await anchors(page)).map((a) => a.kind))
      .toEqual(["planar", "point"])
    const [planar, point] = await anchors(page)
    close(planar?.frame.originMm, [-10, 4, -5], 0.3) // the cursor's whole pixel: ~0.1-0.2 mm
    close(planar?.frame.z, [0, 1, 0], 1e-6)
    close(point?.frame.originMm, [20, 4, 15])
    expect(point?.name).toBe("Vertex")

    // Escape ends the tool and keeps the last anchor selected.
    await page.keyboard.press("Escape")
    await expect(page.getByRole("status").filter({ hasText: "Place Anchor" })).toBeHidden()
    const panel = page.getByRole("complementary", { name: "Properties" })
    await expect(panel.getByRole("textbox", { name: "Name" })).toHaveValue("Vertex")

    // A click on the face anchor's origin selects it; Delete removes it.
    const origin = await project(page, [-10, 8, -5])
    await page.mouse.click(origin.x, origin.y)
    await expect(panel.getByRole("textbox", { name: "Name" })).toHaveValue("Face")
    await page.keyboard.press("Delete")
    await expect.poll(async () => (await anchors(page)).map((a) => a.kind)).toEqual(["point"])
  })
})
