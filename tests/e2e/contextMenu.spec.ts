import type { Page } from "@playwright/test"
import { expect, test } from "./fixtures"
import { insertTestRig, partCenter, waitForViewport } from "./viewportHelpers"

// PLAN 15.4: Help › Keyboard Shortcuts lists what the registry answers; right clicks open one
// context menu in the tree, the 3D view and the schematic, acting on what was clicked; a
// right DRAG (some presets orbit with it) never opens it.

const menu = (page: Page) => page.getByRole("menu", { name: "Context menu" })

test("F1 lists the keyboard shortcuts", async ({ page }) => {
  await page.keyboard.press("F1")
  const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts" })
  const file = dialog.getByRole("region", { name: "File" })
  await expect(file).toContainText("Save")
  await expect(file).toContainText("Ctrl+S")
  await expect(dialog).toContainText("SolidWorks")
  await page.keyboard.press("Escape")
  await expect(dialog).toBeHidden()
})

test("right clicks in the tree and the 3D view act on what was clicked", async ({ page }) => {
  await waitForViewport(page)
  const { leaf } = await insertTestRig(page)
  const tree = page.getByRole("tree", { name: "Scene graph" })
  const row = tree.getByRole("treeitem", { name: /^Leaf/ })

  await row.click({ button: "right" })
  await menu(page).getByRole("menuitem", { name: "Hide/Show" }).click()
  await expect(menu(page)).toBeHidden()
  await expect(row.locator('[title="Show"]')).toHaveCount(1)
  await row.click({ button: "right" })
  await menu(page).getByRole("menuitem", { name: "Hide/Show" }).click()
  await expect(row.locator('[title="Hide"]')).toHaveCount(1)

  // A right drag in the 3D view is a gesture, not a click: no menu.
  const at = await partCenter(page, leaf)
  await page.mouse.move(at.x, at.y)
  await page.mouse.down({ button: "right" })
  await page.mouse.move(at.x + 60, at.y + 30, { steps: 5 })
  await page.mouse.up({ button: "right" })
  await expect(menu(page)).toBeHidden()

  // A right click on the leaf selects it and offers Delete.
  await page.keyboard.press("Escape") // clear the tree's selection
  const still = await partCenter(page, leaf)
  await page.mouse.click(still.x, still.y, { button: "right" })
  await expect(row).toHaveAttribute("aria-selected", "true")
  await menu(page).getByRole("menuitem", { name: "Delete" }).click()
  await expect(row).toBeHidden()
  await page.keyboard.press("Control+z")
  await expect(row).toBeVisible()
})

test("a right click on a schematic block offers Delete", async ({ page }) => {
  await page.getByRole("button", { name: "Maximize Schematic" }).click()
  await page.getByRole("button", { name: "Add block" }).click()
  await page.getByRole("listitem").filter({ hasText: "Resistor" }).first().click()
  const block = page.locator(".react-flow__node").filter({ hasText: "Resistor 1" })
  await expect(block).toBeVisible()
  await block.click({ button: "right" })
  await menu(page).getByRole("menuitem", { name: "Delete" }).click()
  await expect(block).toBeHidden()
})
