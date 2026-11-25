import type { Page } from "@playwright/test"
import { expect, test } from "./fixtures"
import { partCenter, waitForViewport } from "./viewportHelpers"

// Moving what was dropped by dragging it in the 3D view (design mode): along the ground,
// with Shift up and down; one undo entry per drag.
test.use({ contextOptions: { reducedMotion: "reduce" } })

const cubeAt = async (page: Page) => {
  const [cube] = await page.evaluate(() => window.__STUDIOVD_VIEWPORT__?.components() ?? [])
  return cube?.positions.box ?? []
}

async function drag(page: Page, from: { x: number; y: number }, dx: number, dy: number) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 12 })
  await page.mouse.up()
}

test("a dropped component slides along the ground, rises with Shift, and undoes in one step", async ({
  page,
}) => {
  test.setTimeout(90_000)
  await waitForViewport(page)
  await page.getByRole("tab", { name: "Library" }).click()
  const search = page.getByRole("searchbox", { name: "Search components" })
  await search.fill("cube 20")
  await search.press("Enter")
  await expect.poll(() => cubeAt(page), { timeout: 20_000 }).toHaveLength(3)
  const start = await cubeAt(page)
  const partId =
    (await page.evaluate(() => window.__STUDIOVD_VIEWPORT__?.parts() ?? []))[0]?.id ?? ""
  await page.getByRole("tab", { name: "Scene" }).click()
  await page.keyboard.press("Escape") // nothing selected: the drag picks it up by itself

  // Along the ground: the height stays, the cube goes where it was dragged, and it is selected.
  await drag(page, await partCenter(page, partId), 120, 0)
  await expect
    .poll(async () => Math.hypot(...(await cubeAt(page)).map((v, i) => v - (start[i] ?? 0))))
    .toBeGreaterThan(10)
  const slid = await cubeAt(page)
  expect(Math.abs((slid[1] ?? 0) - (start[1] ?? 0))).toBeLessThan(1e-6)
  const panel = page.getByRole("complementary", { name: "Properties" })
  await expect(panel.getByRole("heading", { name: /^Component / })).toBeVisible()

  // With Shift: straight up under the cursor.
  await page.keyboard.down("Shift")
  await drag(page, await partCenter(page, partId), 0, -80)
  await page.keyboard.up("Shift")
  await expect.poll(async () => ((await cubeAt(page))[1] ?? 0) - (slid[1] ?? 0)).toBeGreaterThan(5)
  const raised = await cubeAt(page)
  expect(
    Math.hypot((raised[0] ?? 0) - (slid[0] ?? 0), (raised[2] ?? 0) - (slid[2] ?? 0))
  ).toBeLessThan(1)

  // Each drag is one undo entry.
  await page.keyboard.press("Control+z")
  await expect.poll(() => cubeAt(page)).toEqual(slid)
  await page.keyboard.press("Control+z")
  await expect.poll(() => cubeAt(page)).toEqual(start)
})
