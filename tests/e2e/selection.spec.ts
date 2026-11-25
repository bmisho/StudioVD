import type { Page } from "@playwright/test"
import { expect, test } from "./fixtures"
import {
  highlightPixels,
  hoveredId,
  insertTestRig,
  partCenter,
  partPose,
  project,
  waitForViewport,
} from "./viewportHelpers"

// PLAN 3.6: hover and click selection in the 3D view, synced with the scene tree.
test.use({ contextOptions: { reducedMotion: "reduce" } })

/** A tree row by its name, not another row that mentions it (a mate: "Revolute: Base – Leaf"). */
const row = (page: Page, name: string) =>
  page.getByRole("treeitem", {
    name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}( \\(|$)`),
  })

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

  test("a left drag over empty space selects with a box (0.2.1)", async ({ page }) => {
    // The rig, a maximized view redrawn at full size and four drags: past 30 s on a GPU-less
    // runner beside a WebKit worker (CI, 0.2.1).
    test.setTimeout(60_000)
    await insertTestRig(page)
    // Room around the parts: the split 3D view is narrow beside the schematic.
    await page.getByRole("button", { name: "Maximize 3D View" }).click()
    await page.waitForTimeout(300)
    const canvas = await page.getByTestId("viewport-canvas").boundingBox()
    if (!canvas) throw new Error("canvas not visible")
    const boxDrag = async (from: { x: number; y: number }, to: { x: number; y: number }) => {
      await page.mouse.move(from.x, from.y)
      await page.mouse.down()
      await page.mouse.move(to.x, to.y, { steps: 10 })
      await expect(page.getByTestId("box-select")).toBeVisible()
      await page.mouse.up()
      await expect(page.getByTestId("box-select")).toBeHidden()
    }
    // Rightward round everything: a window, both parts entirely inside it (the leaf reaches
    // close to the canvas's right edge in this view).
    await page.keyboard.press("Escape")
    await expect(row(page, "Base")).toHaveAttribute("aria-selected", "false")
    const empty = await emptySpot(page)
    await boxDrag(empty, { x: canvas.x + canvas.width - 6, y: canvas.y + canvas.height - 40 })
    await expect(row(page, "Base")).toHaveAttribute("aria-selected", "true")
    await expect(row(page, "Leaf")).toHaveAttribute("aria-selected", "true")

    // A box over the leaf's right half only (the leaf spans x 61..121 mm, y 81..89; the base
    // ends at x 60), between two empty points: above the leaf, and right of everything.
    // Dragged rightward it holds nothing whole; dragged leftward it catches what it touches.
    await page.keyboard.press("Escape") // no gizmo in the way of the next presses
    const above = await project(page, [100, 140, 0])
    const right = await project(page, [220, 60, 0])
    for (const p of [above, right]) {
      expect(p.x).toBeGreaterThan(canvas.x)
      expect(p.x).toBeLessThan(canvas.x + canvas.width)
    }
    await boxDrag(above, right)
    await expect(row(page, "Leaf")).toHaveAttribute("aria-selected", "false")
    await expect(row(page, "Base")).toHaveAttribute("aria-selected", "false")
    await boxDrag(right, above)
    await expect(row(page, "Leaf")).toHaveAttribute("aria-selected", "true")
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

    // A right click on empty space keeps the selection and opens the context menu (15.4);
    // close it first, or the next click only dismisses the menu.
    await page.mouse.click(empty.x, empty.y, { button: "right" })
    const menu = page.getByRole("menu", { name: "Context menu" })
    await expect(menu).toBeVisible()
    await expect(row(page, "Leaf")).toHaveAttribute("aria-selected", "true")
    await page.keyboard.press("Escape")
    await expect(menu).toBeHidden()
    await expect(row(page, "Leaf")).toHaveAttribute("aria-selected", "true") // Escape closed only the menu
    await page.mouse.click(empty.x, empty.y)
    await expect(row(page, "Leaf")).toHaveAttribute("aria-selected", "false")
    await expect.poll(() => highlightPixels(page)).toBe(0)

    await page.mouse.click(b.x, b.y)
    await expect(row(page, "Base")).toHaveAttribute("aria-selected", "true")
    await page.keyboard.press("Escape")
    await expect(row(page, "Base")).toHaveAttribute("aria-selected", "false")
  })

  test("a press that moves beyond the click slop, short of a drag, does nothing", async ({
    page,
  }) => {
    const { base } = await insertTestRig(page)
    const before = await partPose(page, base)
    const b = await partCenter(page, base)
    await page.mouse.move(b.x, b.y)
    await page.mouse.down()
    await page.mouse.move(b.x + 3, b.y) // past the 2 px click slop, short of the 4 px drag
    await page.mouse.up()
    await expect(row(page, "Base")).toHaveAttribute("aria-selected", "false")
    expect(await partPose(page, base)).toEqual(before)
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

  test("a hovered part keeps its outline over a selected part behind it", async ({ page }) => {
    const { leaf } = await insertTestRig(page) // the leaf overlaps the base on screen
    const l = await partCenter(page, leaf)
    const empty = await emptySpot(page)
    await page.mouse.move(l.x, l.y)
    await expect.poll(() => hoveredId(page)).toBe(leaf)
    const leafAlone = await highlightPixels(page)
    await page.mouse.move(empty.x, empty.y)
    await expect.poll(() => hoveredId(page)).toBeNull()
    await row(page, "Base").click()
    const baseAlone = await highlightPixels(page)
    await page.mouse.move(l.x, l.y)
    await expect.poll(() => hoveredId(page)).toBe(leaf)
    // Each outline is masked by its own silhouette only (once the base's masked the leaf's).
    expect(await highlightPixels(page)).toBeGreaterThan(baseAlone + 0.8 * leafAlone)
  })

  test("a selected part seen through glass keeps its outline", async ({ page }) => {
    await insertTestRig(page) // the leaf is in front of the base's right edge, near its top
    const panel = page.getByRole("complementary", { name: "Properties" })
    await row(page, "Leaf").click()
    const presets = panel.getByRole("toolbar", { name: "Material presets" })
    await presets.getByRole("button", { name: "Glass", exact: true }).click()
    /** Most blue (b - r) across the base's back right edge where the glass leaf covers it. */
    const blueAcrossEdge = async () => {
      const points = []
      for (const y of [70, 76]) {
        const p = await project(page, [60, y, -30])
        for (let dx = -4; dx <= 10; dx++) points.push({ x: p.x + dx, y: p.y })
      }
      // One frame for all points: with glass, a frame takes a second on CI's SwiftShader.
      const rgb = await page.evaluate((ps) => window.__STUDIOVD_VIEWPORT__?.pixelsAt(ps), points)
      if (!rgb) throw new Error("no frame")
      return Math.max(...rgb.map(([r, , b]) => b - r))
    }
    await page.keyboard.press("Escape")
    expect(await blueAcrossEdge()).toBeLessThan(50) // the slate base and the grid, refracted
    await row(page, "Base").click()
    // Refracted from the half-size glass pass: blurred, so bluish rather than the exact token.
    expect(await blueAcrossEdge()).toBeGreaterThan(70)
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
