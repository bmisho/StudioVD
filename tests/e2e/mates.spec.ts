import type { Page } from "@playwright/test"
import { anchors, hover, importFixture } from "./assemblyHelpers"
import { expect, test } from "./fixtures"
import { project } from "./viewportHelpers"

// PLAN 8.2, 8.6: the Mate tool puts pin.step (Ø8 x 20 mm, upright at x = 40, y 0..20) into the
// Ø8 hole of plate-hole.step (top at y = 8, hole at x = 5, z = 0). The plate, imported first,
// is grounded, so the pin is the side that moves.
test.use({ contextOptions: { reducedMotion: "reduce" } })

const mates = (page: Page) => page.evaluate(() => window.__STUDIOVD_VIEWPORT__?.mates() ?? [])
const world = (page: Page, id: string) =>
  page.evaluate((i) => window.__STUDIOVD_VIEWPORT__?.anchorWorld(i) ?? null, id)
const close = (v: number[] | undefined, w: number[], tolerance: number) =>
  w.forEach((x, i) => expect(Math.abs((v?.[i] ?? Infinity) - x)).toBeLessThan(tolerance))

async function clickAt(page: Page, point: [number, number, number]) {
  const p = await project(page, point)
  await page.mouse.click(p.x, p.y)
}

test.describe("mates", () => {
  test.describe.configure({ timeout: 90_000 })

  test("Mate a pin into the plate's hole: revolute, snapped exactly, one undo entry", async ({
    page,
  }) => {
    await importFixture(page, "plate-hole.step")
    await importFixture(page, "pin.step")
    const toolbar = page.getByRole("toolbar", { name: "Main toolbar" })

    // An anchor at the hole's mouth and one at the pin's top end.
    await toolbar.getByRole("button", { name: "Place Anchor" }).click()
    const rim = await hover(page, [9.5, 8, 0], "circle")
    await page.mouse.click(rim.x, rim.y)
    const end = await hover(page, [43.5, 20, 0], "circle")
    await page.mouse.click(end.x, end.y)
    await expect
      .poll(async () => (await anchors(page)).map((a) => a.name))
      .toEqual(["Hole Ø8", "Shaft Ø8"])
    const [hole, pin] = await anchors(page)

    await toolbar.getByRole("button", { name: "Mate" }).click()
    const hint = page.getByRole("status").filter({ hasText: "Mate" })
    await expect(hint).toContainText("Click an anchor")
    await clickAt(page, [5, 8, 0])
    await expect(hint).toContainText("Click an anchor on another part")
    await clickAt(page, [40, 20, 0])
    const panel = page.getByRole("complementary", { name: "Properties" })
    await expect(panel.getByRole("heading", { name: "New Mate" })).toBeVisible()
    await expect(panel.getByRole("combobox", { name: "Type" })).toContainText("Revolute")
    await expect(panel.getByText("Moves Pin.")).toBeVisible() // the plate is grounded

    await panel.getByRole("button", { name: "Apply" }).click()
    await expect.poll(async () => (await mates(page)).map((m) => m.type)).toEqual(["revolute"])
    const [a, b] = [await world(page, hole?.id ?? ""), await world(page, pin?.id ?? "")]
    close(b?.originMm, a?.originMm ?? [], 1e-6) // the pin's end on the hole's mouth
    close(b?.z, [0, 1, 0], 1e-9)
    close(a?.originMm, [5, 8, 0], 1e-3) // the plate did not move

    // The Mates folder lists it; the pin turns in the hole: 1 DOF; the new mate is selected.
    const tree = page.getByRole("tree", { name: "Scene graph" })
    await expect(tree.getByRole("treeitem", { name: /^Revolute: Plate – Pin/ })).toBeVisible()
    await expect(tree.getByRole("treeitem", { name: /^Pin \(1 DOF\)/ })).toBeVisible()
    await expect(panel.getByRole("heading", { name: "Mate" })).toBeVisible()
    await expect(panel.getByText("Mechanism: 1 DOF")).toBeVisible()
    await panel.getByRole("combobox", { name: "Type" }).click()
    await page.getByRole("option", { name: /^Fixed/ }).click()
    await expect(tree.getByRole("treeitem", { name: /^Pin \(0 DOF\)/ })).toBeVisible()

    // Off the Type select (it takes typed keys, as a text field does) before the shortcuts.
    await panel.getByRole("heading", { name: "Mate" }).click()
    await page.keyboard.press("Escape") // ends the tool
    await page.keyboard.press("Control+z") // the type change
    await expect.poll(async () => (await mates(page)).map((m) => m.type)).toEqual(["revolute"])
    await page.keyboard.press("Control+z")
    await expect.poll(async () => (await mates(page)).length).toBe(0)
    close((await world(page, pin?.id ?? ""))?.originMm, [40, 20, 0], 1e-3) // back where it was
  })
})
