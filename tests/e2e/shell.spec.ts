import { backendCalls, expect, test } from "./fixtures"

test.describe("application shell", () => {
  test("shows every region of the layout", async ({ page }) => {
    for (const name of ["File", "Edit", "View", "Help"]) {
      await expect(page.getByRole("menuitem", { name })).toBeVisible()
    }
    await expect(page.getByRole("toolbar", { name: "Main toolbar" })).toBeVisible()
    await expect(page.getByRole("tab", { name: "Scene" })).toBeVisible()
    await expect(page.getByRole("region", { name: "3D View" })).toBeVisible()
    await expect(page.getByRole("region", { name: "Schematic" })).toBeVisible()
    await expect(page.getByRole("complementary", { name: "Properties" })).toBeVisible()
    await expect(page.getByRole("contentinfo", { name: "Status bar" })).toBeVisible()
  })

  test("resizes the left sidebar by dragging its handle", async ({ page }) => {
    const tablist = page.getByRole("tablist")
    const before = (await tablist.boundingBox())?.width ?? 0
    const handle = page.locator('[data-slot="resizable-handle"]').first()
    const box = await handle.boundingBox()
    expect(box).not.toBeNull()
    if (!box) return
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + 100, box.y + box.height / 2, { steps: 10 })
    await page.mouse.up()
    const after = (await tablist.boundingBox())?.width ?? 0
    expect(after - before).toBeGreaterThan(80)
    expect(after - before).toBeLessThan(120)
  })

  test("stacks the 3D view above the schematic", async ({ page }) => {
    const viewport = page.getByRole("region", { name: "3D View" })
    const schematic = page.getByRole("region", { name: "Schematic" })
    const side = { v: await viewport.boundingBox(), s: await schematic.boundingBox() }
    expect(side.s?.x ?? 0).toBeGreaterThan(side.v?.x ?? 0)

    await page.getByRole("button", { name: "Stack 3D and Schematic Vertically" }).click()
    const stacked = { v: await viewport.boundingBox(), s: await schematic.boundingBox() }
    expect(stacked.s?.y ?? 0).toBeGreaterThan(stacked.v?.y ?? 0)
    expect(Math.abs((stacked.s?.x ?? 0) - (stacked.v?.x ?? 0))).toBeLessThan(2)
  })

  test("maximizes a pane without unmounting the other", async ({ page }) => {
    const viewport = page.getByRole("region", { name: "3D View" })
    const normal = (await viewport.boundingBox())?.width ?? 0
    await page.getByRole("button", { name: "Maximize 3D View" }).click()
    await expect(page.getByRole("button", { name: "Restore 3D View" })).toBeVisible()
    const maximized = (await viewport.boundingBox())?.width ?? 0
    expect(maximized).toBeGreaterThan(normal * 1.4)
    await expect(page.getByTestId("schematic-placeholder")).toBeAttached()
    await page.getByRole("button", { name: "Restore 3D View" }).click()
    await expect(page.getByRole("region", { name: "Schematic" })).toBeVisible()
  })

  test("hides and shows the properties panel from the View menu", async ({ page }) => {
    await page.getByRole("menuitem", { name: "View" }).click()
    await page.getByRole("menuitemcheckbox", { name: "Properties Panel" }).click()
    await expect(page.getByRole("complementary", { name: "Properties" })).toBeHidden()
    await page.getByRole("menuitem", { name: "View" }).click()
    await page.getByRole("menuitemcheckbox", { name: "Properties Panel" }).click()
    await expect(page.getByRole("complementary", { name: "Properties" })).toBeVisible()
  })
})

test.describe("commands and the backend", () => {
  test("File > Save reaches the backend and reports the phase", async ({ page }) => {
    await page.getByRole("menuitem", { name: "File" }).click()
    await page.getByRole("menuitem", { name: /^Save\s*Ctrl\+S$/ }).click()
    await expect(page.getByText("Saving projects arrives in Phase 5.")).toBeVisible()
    expect(await backendCalls(page)).toContain("project_save")
  })

  test("Ctrl+I opens the file picker in the backend", async ({ page }) => {
    await page.keyboard.press("Control+i")
    await expect.poll(() => backendCalls(page)).toContain("pick_import_files")
    // The mocked picker returns no files (cancelled): no dialog opens.
    await expect(page.getByRole("dialog", { name: "Import" })).toBeHidden()
  })

  test("Help > About reads app info over IPC", async ({ page }) => {
    await page.getByRole("menuitem", { name: "Help" }).click()
    await page.getByRole("menuitem", { name: "About StudioVD" }).click()
    const dialog = page.getByRole("dialog", { name: "StudioVD" })
    await expect(dialog.getByText("2.e2e")).toBeVisible()
    await expect(dialog.getByText("e2e-os (e2e-arch)")).toBeVisible()
  })
})

test.describe("document editing", () => {
  test("rename with the real mouse is one undo entry; redo restores it", async ({ page }) => {
    await page.getByRole("button", { name: "New group", exact: true }).click()
    const tree = page.getByRole("tree", { name: "Scene graph" })
    await expect(tree.getByText("Group 1")).toBeVisible()

    const name = page.getByLabel("Name")
    await name.click()
    await name.press("Control+a")
    await name.pressSequentially("Gearbox")
    await expect(tree.getByText("Gearbox")).toBeVisible() // live while typing
    await name.press("Enter")

    await page.keyboard.press("Control+z")
    await expect(tree.getByText("Group 1")).toBeVisible()
    await page.keyboard.press("Control+Shift+z")
    await expect(tree.getByText("Gearbox")).toBeVisible()
    await page.keyboard.press("Control+z")
    await page.keyboard.press("Control+z")
    await expect(page.getByRole("tree", { name: "Scene graph" })).toBeHidden()
  })

  test("Delete removes the selected group; typing Delete in a field does not", async ({ page }) => {
    await page.getByRole("button", { name: "New group", exact: true }).click()
    const name = page.getByLabel("Name")
    await name.click()
    await name.press("End")
    await name.press("Delete") // edits text, must not delete the group
    await name.press("Enter")
    await page.getByRole("tree").getByText("Group 1").click()
    await page.keyboard.press("Delete")
    await expect(page.getByRole("tree", { name: "Scene graph" })).toBeHidden()
  })
})

test.describe("keyboard ownership", () => {
  test("Escape closes a menu, then leaves the menu bar; the selection survives", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "New group", exact: true }).click()
    await page.getByRole("tree").getByText("Group 1").click()
    const status = page.getByRole("contentinfo", { name: "Status bar" })
    await expect(status).toContainText("Selected 1")

    await page.getByRole("menuitem", { name: "File" }).click()
    await page.getByRole("menuitem", { name: "Export" }).hover()
    await expect(page.getByRole("menu")).toHaveCount(2)
    await page.keyboard.press("Escape") // Radix closes the whole menu stack
    await expect(page.getByRole("menu")).toHaveCount(0)
    // Radix returns focus to the trigger in a timeout after the menu unmounts.
    await expect(page.getByRole("menuitem", { name: "File" })).toBeFocused()
    await page.keyboard.press("Escape") // focus is on the File trigger: only leave the bar
    await expect(status).toContainText("Selected 1")
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true)
  })

  test("shortcuts keep working right after a mouse menu action", async ({ page }) => {
    await page.getByRole("menuitem", { name: "Edit" }).click()
    await page.getByRole("menuitem", { name: /^New Group/ }).click()
    await expect(page.getByRole("tree").getByText("Group 1")).toBeVisible()
    await page.keyboard.press("Delete") // focus was returned to the Edit trigger
    await expect(page.getByRole("tree", { name: "Scene graph" })).toBeHidden()
  })
})
