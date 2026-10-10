import type { Locator } from "@playwright/test"
import { expect, test } from "./fixtures"

const width = async (locator: Locator) => (await locator.boundingBox())?.width ?? 0

test.describe("layout persistence", () => {
  test("panel toggles never remount the 3D pane or lose sizes and tabs", async ({ page }) => {
    // Phase 3 puts a WebGL canvas here: a remount would destroy its context.
    const viewportNode = await page.getByTestId("viewport-placeholder").elementHandle()
    const tablist = page.getByRole("tablist")

    const handle = page.locator('[data-slot="resizable-handle"]').first()
    const box = await handle.boundingBox()
    if (!box) throw new Error("left sidebar handle not visible")
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + 80, box.y + box.height / 2, { steps: 8 })
    await page.mouse.up()
    const dragged = await width(tablist)
    await page.getByRole("tab", { name: "Library" }).click()

    const view = (item: string) => async () => {
      await page.getByRole("menuitem", { name: "View" }).click()
      await page.getByRole("menuitemcheckbox", { name: item }).click()
    }
    const steps = [
      view("Properties Panel"),
      view("Properties Panel"),
      view("Stack 3D and Schematic Vertically"),
      view("Maximize 3D View"),
      view("Maximize 3D View"),
      view("Stack 3D and Schematic Vertically"),
      view("Scene & Library Panel"),
      view("Scene & Library Panel"),
    ]
    for (const step of steps) await step()

    expect(await viewportNode?.evaluate((el) => el.isConnected)).toBe(true)
    await expect(page.getByRole("tab", { name: "Library" })).toHaveAttribute(
      "aria-selected",
      "true"
    )
    expect(Math.abs((await width(tablist)) - dragged)).toBeLessThan(2)
  })

  test("restoring a maximized pane after re-orienting keeps the split ratio", async ({ page }) => {
    await page.getByRole("button", { name: "Maximize 3D View" }).click()
    await page.getByRole("button", { name: "Stack 3D and Schematic Vertically" }).click()
    await page.getByRole("button", { name: "Restore 3D View" }).click()

    const v = await page.getByRole("region", { name: "3D View" }).boundingBox()
    const s = await page.getByRole("region", { name: "Schematic" }).boundingBox()
    const share = (v?.height ?? 0) / ((v?.height ?? 0) + (s?.height ?? 1))
    expect(share).toBeGreaterThan(0.55) // default split is 60/40
    expect(share).toBeLessThan(0.65)
  })

  test("dragging a sidebar shut keeps the View menu in sync", async ({ page }) => {
    const handle = page.locator('[data-slot="resizable-handle"]').first()
    const box = await handle.boundingBox()
    if (!box) throw new Error("left sidebar handle not visible")
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x - 260, box.y + box.height / 2, { steps: 10 })
    await page.mouse.up()
    await expect(page.getByRole("tablist")).toBeHidden()

    await page.getByRole("menuitem", { name: "View" }).click()
    const item = page.getByRole("menuitemcheckbox", { name: "Scene & Library Panel" })
    await expect(item).toHaveAttribute("aria-checked", "false")
    await item.click() // re-opens it
    await expect(page.getByRole("tablist")).toBeVisible()
  })
})
