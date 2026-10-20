import type { Page } from "@playwright/test"
import { expect, fixtureFile, queueImportPick, test } from "./fixtures"
import { waitForViewport } from "./viewportHelpers"

// Real camera motion (no reduced motion): the fit after an import flies in over many frames.

/** The camera's distance now, and the one its move ends at. */
const distances = (page: Page) =>
  page.evaluate(() => {
    const c = window.__STUDIOVD_VIEWPORT__?.camera()
    if (!c) return { now: Number.NaN, end: Number.NaN }
    const end = Math.hypot(...c.position.map((p, i) => p - (c.target[i] ?? 0)))
    return { now: c.distance, end }
  })

test("a frame drawn outside the render loop (thumbnail, previews) does not stop a camera move", async ({
  page,
}) => {
  await waitForViewport(page)
  await queueImportPick(page, [fixtureFile("cube.step")])
  await page.keyboard.press("Control+i")
  const dialog = page.getByRole("dialog", { name: "Import" })
  await dialog.getByRole("button", { name: "Import" }).click()
  // Mid-flight: well on the way, still far from the end.
  await page.waitForFunction(() => {
    const c = window.__STUDIOVD_VIEWPORT__?.camera()
    if (!c) return false
    const end = Math.hypot(...c.position.map((p, i) => p - (c.target[i] ?? 0)))
    return end < 100 && c.distance < 500 && c.distance > end + 10
  })
  // Draws and reads a frame outside the loop, as Save's thumbnail and material previews do.
  await page.evaluate(() => window.__STUDIOVD_VIEWPORT__?.pixelAt(0, 0))
  await expect
    .poll(async () => {
      const { now, end } = await distances(page)
      return Math.abs(now - end)
    })
    .toBeLessThan(0.5)
})
