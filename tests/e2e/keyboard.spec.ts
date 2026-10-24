import { expect, test } from "./fixtures"

test.describe("keyboard and focus", () => {
  test("closing About returns focus to the Help menu", async ({ page }) => {
    await page.getByRole("menuitem", { name: "Help" }).click()
    await page.getByRole("menuitem", { name: "About StudioVD" }).click()
    await expect(page.getByRole("dialog", { name: "StudioVD" })).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(page.getByRole("dialog")).toBeHidden()
    await expect(page.getByRole("menuitem", { name: "Help" })).toBeFocused()
  })

  test("F10 moves focus to the menu bar, even from a text field", async ({ page }) => {
    await page.getByRole("button", { name: "New group", exact: true }).click()
    await page.getByLabel("Name").click()
    await page.keyboard.press("F10")
    await expect(page.getByRole("menuitem", { name: "File" })).toBeFocused()
  })

  test("the scene tree works from the keyboard", async ({ page }) => {
    await page.keyboard.press("Control+g") // Group 1
    await page.keyboard.press("Control+g") // Group 2, wrapping the selected Group 1
    const tree = page.getByRole("tree", { name: "Scene graph" })
    const row = (name: string) => tree.getByRole("treeitem", { name })

    await row("Group 2").click()
    await expect(row("Group 2")).toBeFocused()
    await page.keyboard.press("ArrowDown")
    await expect(row("Group 1")).toBeFocused()
    await expect(row("Group 1")).toHaveAttribute("aria-selected", "true")
    await expect(page.getByLabel("Name")).toHaveValue("Group 1") // selection follows focus

    await page.keyboard.press("ArrowLeft") // to the parent
    await expect(row("Group 2")).toBeFocused()
    await page.keyboard.press("ArrowLeft") // collapse
    await expect(row("Group 1")).toBeHidden()
    await page.keyboard.press("ArrowRight") // expand
    await expect(row("Group 1")).toBeVisible()

    await page.keyboard.press("Delete") // bubbles to the command registry
    await expect(row("Group 2")).toBeHidden()
    await expect(row("Group 1")).toHaveAttribute("aria-level", "1") // reparented to the root
  })

  test("the toolbar is one tab stop with arrow-key navigation", async ({ page }) => {
    const toolbar = page.getByRole("toolbar", { name: "Main toolbar" })
    // focus(), not click(): WebKit may not focus a button on click.
    await toolbar.getByRole("button", { name: "Select" }).focus()
    await page.keyboard.press("ArrowRight")
    const anchor = toolbar.getByRole("button", { name: "Place Anchor" })
    await expect(anchor).toBeFocused()
    await page.keyboard.press("Enter")
    await expect(anchor).toHaveAttribute("aria-pressed", "true")

    await page.keyboard.press("ArrowRight")
    const mate = toolbar.getByRole("button", { name: "Mate" })
    await expect(mate).toBeFocused()
    const tip = page.getByRole("tooltip").filter({ hasText: "Mate" })
    await expect(tip).toHaveCount(1)
    await page.keyboard.press("Enter") // one tool at a time
    await expect(mate).toHaveAttribute("aria-pressed", "true")
    await expect(anchor).toHaveAttribute("aria-pressed", "false")

    await page.keyboard.press("Tab") // leaves the toolbar in one step
    const inToolbar = await toolbar.evaluate((el) => el.contains(document.activeElement))
    expect(inToolbar).toBe(false)
  })
})
