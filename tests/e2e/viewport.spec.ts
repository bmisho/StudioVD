import type { Page } from "@playwright/test"
import type { ViewportCameraState } from "../../src/features/viewport/testing/probeTypes"
import { expect, test } from "./fixtures"
import { waitForViewport } from "./viewportHelpers"

// Camera moves are immediate with reduced motion, so their end state can be asserted.
test.use({ contextOptions: { reducedMotion: "reduce" } })

const camera = (page: Page) =>
  page.evaluate(() => window.__STUDIOVD_VIEWPORT__?.camera()) as Promise<ViewportCameraState>

/** Unit direction from the target to the camera. */
function viewDirection(c: ViewportCameraState): [number, number, number] {
  const d = c.position.map((p, i) => p - (c.target[i] ?? 0))
  const length = Math.hypot(...d)
  return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0].map((v) => v / length) as [number, number, number]
}

test.describe("3D viewport", () => {
  test("renders a WebGL2 frame on the theme background", async ({ page }, testInfo) => {
    await waitForViewport(page)
    const sample = await page.evaluate(() => window.__STUDIOVD_VIEWPORT__?.sample())
    expect(sample?.webgl2).toBe(true)
    const [r = 0, g = 0, b = 0] = sample?.topLeft ?? []
    // --viewport-top is #f8fafc; the grid may fade in near the top edge.
    expect(Math.max(Math.abs(r - 248), Math.abs(g - 250), Math.abs(b - 252))).toBeLessThan(8)
    expect(sample?.nonBackgroundFraction).toBeGreaterThan(0.002) // grid, view cube, triad
    const shot = await page.getByTestId("viewport-canvas").screenshot()
    await testInfo.attach("viewport.png", { body: shot, contentType: "image/png" })
  })

  test("idles in design mode: no frames without input", async ({ page }) => {
    await waitForViewport(page)
    await page.waitForTimeout(300)
    const before = await page.evaluate(() => window.__STUDIOVD_VIEWPORT__?.framesRendered())
    await page.waitForTimeout(600)
    expect(await page.evaluate(() => window.__STUDIOVD_VIEWPORT__?.framesRendered())).toBe(before)
  })

  test("switching to orthographic and back keeps the framing", async ({ page }) => {
    await waitForViewport(page)
    const toggle = page.getByRole("button", { name: "Orthographic Projection" })
    const start = await camera(page)
    await toggle.click()
    const ortho = await camera(page)
    expect(ortho.type).toBe("OrthographicCamera")
    expect(ortho.visibleHeight).toBeCloseTo(start.visibleHeight, 6)
    ortho.target.forEach((v, i) => expect(v).toBeCloseTo(start.target[i] ?? NaN, 6))
    await toggle.click()
    const back = await camera(page)
    expect(back.type).toBe("PerspectiveCamera")
    expect(back.distance).toBeCloseTo(start.distance, 6)
  })

  test("standard views and Fit All work from the keyboard", async ({ page }) => {
    await waitForViewport(page)
    await page.keyboard.press("Control+5") // Top
    const top = await camera(page)
    const [, y] = viewDirection(top)
    expect(y).toBeGreaterThan(0.9999)
    await page.keyboard.press("Control+1") // Front
    const [, , z] = viewDirection(await camera(page))
    expect(z).toBeGreaterThan(0.9999)
    await page.keyboard.press("Home") // Fit All keeps the view direction
    const [, , zAfterFit] = viewDirection(await camera(page))
    expect(zAfterFit).toBeGreaterThan(0.9999)
  })

  test("the view cube turns the view without changing target or distance", async ({ page }) => {
    await waitForViewport(page)
    const before = await camera(page)
    const box = await page.getByTestId("viewport-canvas").boundingBox()
    if (!box) throw new Error("canvas not visible")
    // GizmoHelper alignment top-right, margin [72, 72]: click the cube's top face.
    await page.mouse.click(box.x + box.width - 72, box.y + 72 - 18)
    await expect.poll(async () => viewDirection(await camera(page))[1]).toBeGreaterThan(0.999)
    const after = await camera(page)
    expect(after.distance).toBeCloseTo(before.distance, 3)
    after.target.forEach((v, i) => expect(v).toBeCloseTo(before.target[i] ?? NaN, 6))
  })

  test("recovers from a lost graphics context", async ({ page }) => {
    await waitForViewport(page)
    await page.evaluate(() => window.__STUDIOVD_VIEWPORT__?.loseContext())
    await expect(
      page.getByRole("status").filter({ hasText: "Restoring the 3D view" })
    ).toBeVisible()
    await page.evaluate(() => window.__STUDIOVD_VIEWPORT__?.restoreContext())
    await expect(page.getByRole("status").filter({ hasText: "Restoring the 3D view" })).toBeHidden()
    await page.waitForFunction(() => window.__STUDIOVD_VIEWPORT__?.environmentReady() === true)
    const sample = await page.evaluate(() => window.__STUDIOVD_VIEWPORT__?.sample())
    expect(sample?.nonBackgroundFraction).toBeGreaterThan(0.002)
  })
})
