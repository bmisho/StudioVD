import type { Page } from "@playwright/test"
import { expect, fixtureFile, queueImportPick, test } from "./fixtures"
import { partPose, project, waitForViewport } from "./viewportHelpers"

// PLAN 6.7 "visual": what a material does to real rendered pixels (SwiftShader in CI, so
// tolerances, not golden images). Read on the top face of a 10 mm cube in the isometric view,
// away from every edge: the centre is where three faces meet, and the face's own centre lies
// on the hidden back edge, which X-ray shows.

// Camera moves are immediate with reduced motion: every run reads the same view.
test.use({ contextOptions: { reducedMotion: "reduce" } })

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
  await page.keyboard.press("Control+7") // isometric: three faces
  const pose = await partPose(page, id)
  const [px, py, pz] = pose.position // the cube's centre (import centres the geometry)
  const topFace = () => project(page, [px + 2.5, py + 5, pz - 2.5])
  // The view turns over several frames, and frames are drawn on demand: draw them (pixelAt
  // renders one) until the point stays put, or the reads below land on another face or
  // highlight.
  let at = await topFace()
  let still = 0
  await expect
    .poll(async () => {
      await pixelAt(page, at.x, at.y)
      const now = await topFace()
      still = Math.hypot(now.x - at.x, now.y - at.y) < 0.25 ? still + 1 : 0
      at = now
      return still
    })
    .toBeGreaterThanOrEqual(3)
  const { x, y } = at
  expect(
    await page.evaluate(([cx, cy]) => window.__STUDIOVD_VIEWPORT__?.pickAt(cx, cy), [x, y])
  ).toBe(id)
  const panel = page.getByRole("complementary", { name: "Properties" })
  const presets = panel.getByRole("toolbar", { name: "Material presets" })
  const sample = async () => {
    await page.waitForTimeout(300)
    return pixelAt(page, x, y)
  }
  // Selected through the tree, then deselected (Escape), so no highlight covers the pixel.
  const select = () => page.getByRole("treeitem", { name: /^Cube/ }).click()

  // What is behind that pixel: the same pixel with the cube hidden.
  await select()
  const visible = panel.getByRole("switch", { name: "Visible" })
  await visible.click()
  await page.keyboard.press("Escape")
  const background = await sample()
  await select()
  await visible.click()

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
  // By keyboard: a mouse jump can close the submenu on a busy page (see materials.spec.ts).
  await page.getByRole("menuitemradio", { name: "X-Ray", exact: true }).press("Enter")
  const xray = await sample()
  expect(luma(xray)).toBeGreaterThan(luma(opaque) + 30)
})
