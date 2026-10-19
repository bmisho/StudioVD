import type { Page } from "@playwright/test"
import { expect, fixtureFile, queueImportPick, test } from "./fixtures"
import { partCenter, waitForViewport } from "./viewportHelpers"

// PLAN 6.7 "visual": what a material does to real rendered pixels (SwiftShader in CI, so
// tolerances, not golden images). Read at the centre of a 10 mm cube, isometric view.

type RGB = [number, number, number]
const pixelAt = async (page: Page, x: number, y: number): Promise<RGB> => {
  const rgb = await page.evaluate(
    ([px, py]) => window.__STUDIOVD_VIEWPORT__?.pixelAt(px, py),
    [x, y]
  )
  if (!rgb) throw new Error("no pixel")
  return rgb
}
const luma = ([r, g, b]: RGB) => 0.2126 * r + 0.7152 * g + 0.0722 * b

test("materials change the rendered pixels as their values say", async ({ page }) => {
  test.setTimeout(60_000)
  await waitForViewport(page)
  await queueImportPick(page, [fixtureFile("cube.step")])
  await page.keyboard.press("Control+i")
  const dialog = page.getByRole("dialog", { name: "Import" })
  await dialog.getByRole("button", { name: "Import" }).click()
  await expect(dialog).toBeHidden({ timeout: 30_000 })
  const [cube] = await page.evaluate(() => window.__STUDIOVD_VIEWPORT__?.parts() ?? [])
  const id = cube?.id ?? ""
  await expect
    .poll(() => page.evaluate((i) => window.__STUDIOVD_VIEWPORT__?.partMesh(i)?.loaded, id))
    .toBe(true)
  await page.keyboard.press("Control+7") // isometric: three faces, the centre on a face
  // Select through the tree so no highlight covers the pixels read in the viewport.
  await page.getByRole("treeitem", { name: /^Cube/ }).click()
  const { x, y } = await partCenter(page, id)
  const background = await pixelAt(page, x + 400, y - 300)
  const panel = page.getByRole("complementary", { name: "Properties" })
  const presets = panel.getByRole("toolbar", { name: "Material presets" })
  await page.keyboard.press("Escape") // deselect: no tint over the part
  const sample = async () => {
    await page.waitForTimeout(300)
    return pixelAt(page, x, y)
  }
  const select = () => page.getByRole("treeitem", { name: /^Cube/ }).click()

  // Copper: warm, red over blue.
  await select()
  await presets.getByRole("button", { name: "Copper", exact: true }).click()
  await page.keyboard.press("Escape")
  const copper = await sample()
  expect(copper[0]).toBeGreaterThan(copper[2] + 20)

  // A pure red colour: red dominates after tone mapping.
  await select()
  const hex = panel.getByRole("textbox", { name: "Colour", exact: true })
  await hex.fill("#ff0000")
  await hex.press("Enter")
  const metal = panel.getByRole("textbox", { name: "Metalness" })
  await metal.fill("0")
  await metal.press("Enter")
  await page.keyboard.press("Escape")
  const red = await sample()
  expect(red[0]).toBeGreaterThan(150)
  expect(Math.max(red[1], red[2])).toBeLessThan(red[0] / 2)

  // Nearly transparent: close to the background behind it.
  await select()
  const opacity = panel.getByRole("textbox", { name: "Opacity" })
  await opacity.fill("0.1")
  await opacity.press("Enter")
  await page.keyboard.press("Escape")
  const faint = await sample()
  expect(Math.abs(luma(faint) - luma(background))).toBeLessThan(
    Math.abs(luma(red) - luma(background)) / 2
  )

  // X-ray: faces seen head-on are faint, so the centre is lighter than shaded red.
  await select()
  await opacity.fill("1")
  await opacity.press("Enter")
  await page.keyboard.press("Escape")
  const opaque = await sample()
  await page.getByRole("menuitem", { name: "View" }).click()
  await page.getByRole("menuitem", { name: "Display Style" }).click()
  await page.getByRole("menuitemradio", { name: "X-Ray", exact: true }).click()
  const xray = await sample()
  expect(luma(xray)).toBeGreaterThan(luma(opaque) + 30)
})
