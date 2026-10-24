import type { Page } from "@playwright/test"
import { expect, fixtureFile, queueImportPick } from "./fixtures"
import { project, waitForViewport } from "./viewportHelpers"

// Shared by the anchor and mate specs (PLAN 7.5, 8.6): STEP fixtures with known geometry.

export const anchors = (page: Page) =>
  page.evaluate(() => window.__STUDIOVD_VIEWPORT__?.anchors() ?? [])
export const preview = (page: Page) =>
  page.evaluate(() => window.__STUDIOVD_VIEWPORT__?.anchorPreview() ?? null)

/** Imports one fixture file and waits for its mesh; returns the new part's id. */
export async function importFixture(page: Page, file: string) {
  await waitForViewport(page)
  const before = await page.evaluate(() => window.__STUDIOVD_VIEWPORT__?.parts().length ?? 0)
  await queueImportPick(page, [fixtureFile(file)])
  await page.keyboard.press("Control+i")
  const dialog = page.getByRole("dialog", { name: "Import" })
  await dialog.getByRole("button", { name: "Import" }).click()
  await expect(dialog).toBeHidden({ timeout: 30_000 })
  const parts = await page.evaluate(() => window.__STUDIOVD_VIEWPORT__?.parts() ?? [])
  const id = parts[before]?.id ?? ""
  await expect
    .poll(() => page.evaluate((i) => window.__STUDIOVD_VIEWPORT__?.partMesh(i)?.loaded, id))
    .toBe(true)
  return id
}

/**
 * Hovers a world point and waits for the Place Anchor preview. Nudges once, so a move is
 * seen, unless `once`: then a single move, which is also what asks for the part's snap
 * features, so the snap can only show up once they arrive with the cursor standing still.
 */
export async function hover(
  page: Page,
  world: [number, number, number],
  snap: string,
  once = false
) {
  const p = await project(page, world)
  if (!once) await page.mouse.move(p.x - 1, p.y)
  await page.mouse.move(p.x, p.y)
  await expect.poll(async () => (await preview(page))?.snap).toBe(snap)
  return p
}
