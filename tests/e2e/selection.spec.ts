import type { Page } from "@playwright/test"
import { expect, test } from "./fixtures"
import {
  highlightPixels,
  hoveredId,
  insertTestRig,
  partCenter,
  waitForViewport,
} from "./viewportHelpers"

// PLAN 3.6: hover and click selection in the 3D view, synced with the scene tree.
test.use({ contextOptions: { reducedMotion: "reduce" } })

const row = (page: Page, name: string) => page.getByRole("treeitem", { name })

/** A point on the canvas showing only grid: top-left, away from the parts and gizmos. */
async function emptySpot(page: Page) {
  const box = await page.getByTestId("viewport-canvas").boundingBox()
  if (!box) throw new Error("canvas not visible")
  return { x: box.x + 40, y: box.y + 40 }
}

test.describe("3D selection", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/")
    await waitForViewport(page)
  })

  test("clicks select parts, in sync with the scene tree", async ({ page }) => {
    const { base, leaf } = await insertTestRig(page)
    const b = await partCenter(page, base)
    const l = await partCenter(page, leaf)
    const empty = await emptySpot(page)

    await page.mouse.click(b.x, b.y)
    await expect(row(page, "Base")).toHaveAttribute("aria-selected", "true")
    await expect(row(page, "Leaf")).toHaveAttribute("aria-selected", "false")
    expect(await highlightPixels(page)).toBeGreaterThan(0)

    await page.keyboard.down("Control")
    await page.mouse.click(l.x, l.y)
    await expect(row(page, "Leaf")).toHaveAttribute("aria-selected", "true")
    await expect(row(page, "Base")).toHaveAttribute("aria-selected", "true")
    await page.mouse.click(b.x, b.y)
    await page.keyboard.up("Control")
    await expect(row(page, "Base")).toHaveAttribute("aria-selected", "false")
    await expect(row(page, "Leaf")).toHaveAttribute("aria-selected", "true")

    await page.mouse.click(empty.x, empty.y, { button: "right" })
    await expect(row(page, "Leaf")).toHaveAttribute("aria-selected", "true")
    await page.mouse.click(empty.x, empty.y)
    await expect(row(page, "Leaf")).toHaveAttribute("aria-selected", "false")
    await expect.poll(() => highlightPixels(page)).toBe(0)

    await page.mouse.click(b.x, b.y)
    await expect(row(page, "Base")).toHaveAttribute("aria-selected", "true")
    await page.keyboard.press("Escape")
    await expect(row(page, "Base")).toHaveAttribute("aria-selected", "false")
  })

  test("a press that moves beyond the click slop selects nothing", async ({ page }) => {
    const { base } = await insertTestRig(page)
    const b = await partCenter(page, base)
    await page.mouse.move(b.x, b.y)
    await page.mouse.down()
    await page.mouse.move(b.x + 6, b.y)
    await page.mouse.up()
    await expect(row(page, "Base")).toHaveAttribute("aria-selected", "false")
  })

  test("hover pre-highlights the part under the cursor, not while a button is held", async ({
    page,
  }) => {
    const { base, leaf } = await insertTestRig(page)
    const l = await partCenter(page, leaf)
    const b = await partCenter(page, base)
    const empty = await emptySpot(page)

    await page.mouse.move(l.x, l.y)
    await expect.poll(() => hoveredId(page)).toBe(leaf)
    expect(await highlightPixels(page)).toBeGreaterThan(0)
    await page.mouse.move(empty.x, empty.y)
    await expect.poll(() => hoveredId(page)).toBeNull()
    expect(await highlightPixels(page)).toBe(0)

    await page.mouse.move(b.x, b.y)
    await expect.poll(() => hoveredId(page)).toBe(base)
    await page.mouse.down({ button: "middle" }) // orbit
    await page.mouse.move(b.x + 20, b.y + 10)
    await expect.poll(() => hoveredId(page)).toBeNull()
    await page.mouse.up({ button: "middle" })
  })

  test("a tree selection lights up the part in 3D", async ({ page }) => {
    const { leaf } = await insertTestRig(page)
    await row(page, "Leaf").click()
    await expect(row(page, "Leaf")).toHaveAttribute("aria-selected", "true")
    expect(await highlightPixels(page)).toBeGreaterThan(0)
    expect(await hoveredId(page)).not.toBe(leaf) // lit by the selection, not by hover
  })

  test("the view stays idle after hover and selection", async ({ page }) => {
    const { base } = await insertTestRig(page)
    const b = await partCenter(page, base)
    await page.mouse.click(b.x, b.y)
    await page.waitForTimeout(300)
    const frames = await page.evaluate(() => window.__STUDIOVD_VIEWPORT__?.framesRendered())
    await page.waitForTimeout(600)
    expect(await page.evaluate(() => window.__STUDIOVD_VIEWPORT__?.framesRendered())).toBe(frames)
  })

  test("undo removes the rig and prunes its selection", async ({ page }, testInfo) => {
    const { base } = await insertTestRig(page)
    const b = await partCenter(page, base)
    await page.mouse.click(b.x, b.y)
    await expect(row(page, "Base")).toHaveAttribute("aria-selected", "true")
    const shot = await page.screenshot()
    await testInfo.attach("selection.png", { body: shot, contentType: "image/png" })
    await page.keyboard.press("Control+z")
    await expect(row(page, "Base")).toHaveCount(0)
    await expect(page.getByText("Selected 0")).toBeVisible()
  })
})
