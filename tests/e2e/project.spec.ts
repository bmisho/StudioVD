import type { Page } from "@playwright/test"
import { expect, fixtureFile, queueImportPick, test, type E2EWindow } from "./fixtures"
import { waitForViewport } from "./viewportHelpers"

// Callbacks passed to page.evaluate run in the page: they cannot call helpers from this file.
// PLAN 5.3-5.7 against the mocked backend (tauriProjectMock.ts): the webview's half of
// New/Open/Save, the close guard, recovery and launch files. Zip I/O is tested in Rust.

const windowDirty = (page: Page) =>
  page.evaluate(() => (window as unknown as E2EWindow).__E2E__.windowDirty())
const windowClosed = (page: Page) =>
  page.evaluate(() => (window as unknown as E2EWindow).__E2E__.windowClosed())
const autosave = (page: Page) =>
  page.evaluate(() => (window as unknown as E2EWindow).__E2E__.autosave())
const saved = (page: Page, name: string) =>
  page.evaluate((n) => (window as unknown as E2EWindow).__E2E__.savedScene(n), name)
const status = (page: Page) => page.getByRole("status").filter({ hasText: "Project" })

async function newGroup(page: Page) {
  await page.getByRole("menuitem", { name: "Edit" }).click()
  await page.getByRole("menuitem", { name: /^New Group/ }).click()
}

async function fileMenu(page: Page, item: RegExp) {
  await page.getByRole("menuitem", { name: "File" }).click()
  await page.getByRole("menuitem", { name: item }).click()
}

async function importSample(page: Page) {
  await queueImportPick(page, [fixtureFile("sample.glb")])
  await page.keyboard.press("Control+i")
  const dialog = page.getByRole("dialog", { name: "Import" })
  await dialog.getByRole("button", { name: "Import" }).click()
  await expect(page.getByText(/^Imported \d+ parts? from 1 file$/)).toBeVisible({ timeout: 30_000 })
}

/** An empty but valid scene.json named `name`. */
const emptyScene = (name: string) =>
  JSON.stringify({
    format: "studiovd",
    schemaVersion: 1,
    appVersion: "0.1.0",
    units: { length: "mm" },
    project: { name },
    ...Object.fromEntries(
      ["assets", "textures", "materials", "groups", "parts", "anchors", "mates", "couplings"].map(
        (k) => [k, {}]
      )
    ),
    schematic: { nodes: {}, edges: {}, blockDefs: {} },
    bindings: {},
    componentDefs: {},
    components: {},
    licenseTexts: {},
    simulation: { gravity: [0, -9.81, 0], maxIterations: 100, tolerance: 1e-9 },
  })

test.describe("projects", () => {
  test.describe.configure({ timeout: 60_000 })

  test("import, save, reopen: the same document comes back", async ({ page }) => {
    await waitForViewport(page)
    await importSample(page)
    await expect(status(page)).toContainText("Unsaved changes")
    await page.keyboard.press("Control+s") // untitled: Save As
    await expect(status(page)).toContainText("Saved")
    const first = await saved(page, "Untitled.stvd")
    expect(first).not.toBeNull()
    expect(
      await page.evaluate(() =>
        (window as unknown as E2EWindow).__E2E__.thumbnailBytes("Untitled.stvd")
      )
    ).toBeGreaterThan(0)

    await fileMenu(page, /^Close Project/)
    const tree = page.getByRole("tree", { name: "Scene graph" })
    await expect(tree.getByRole("treeitem")).toHaveCount(0)

    await page.evaluate(() => (window as unknown as E2EWindow).__E2E__.nextOpen("Untitled.stvd"))
    await page.keyboard.press("Control+o")
    await expect(tree.getByRole("treeitem").first()).toBeVisible()
    await expect(status(page)).toContainText("No changes")
    // Saving the reopened project again writes exactly the same scene.
    await page.evaluate(() => (window as unknown as E2EWindow).__E2E__.nextSaveAs("copy.stvd"))
    await page.keyboard.press("Control+Shift+s")
    await expect.poll(() => saved(page, "copy.stvd")).not.toBeNull()
    expect(JSON.parse((await saved(page, "copy.stvd")) ?? "")).toEqual(JSON.parse(first ?? ""))
  })

  test("closing with unsaved changes asks first", async ({ page }) => {
    await newGroup(page)
    await expect.poll(() => windowDirty(page)).toBe(true)
    await page.evaluate(() => (window as unknown as E2EWindow).__E2E__.requestClose())
    const prompt = page.getByRole("alertdialog", { name: "Save changes to Untitled?" })
    await expect(prompt).toBeVisible()
    await expect(prompt.getByRole("button", { name: "Save", exact: true })).toBeFocused()
    await prompt.getByRole("button", { name: "Cancel" }).click()
    expect(await windowClosed(page)).toBe(false)

    await page.evaluate(() => (window as unknown as E2EWindow).__E2E__.requestClose())
    await prompt.getByRole("button", { name: "Don't Save" }).click()
    await expect.poll(() => windowClosed(page)).toBe(true)
  })

  test("a damaged file is refused and the open project stays", async ({ page }) => {
    await page.evaluate(() => {
      sessionStorage.setItem(
        "e2e-seed",
        JSON.stringify({ disk: { "bad.stvd": '{"format":"studiovd","schemaVersion":1}' } })
      )
    })
    await page.reload()
    await newGroup(page)
    await page.evaluate(() => (window as unknown as E2EWindow).__E2E__.nextOpen("bad.stvd"))
    await page.keyboard.press("Control+o")
    await expect(page.getByText("Could not open bad.stvd")).toBeVisible()
    await expect(page.getByRole("tree", { name: "Scene graph" }).getByText("Group")).toBeVisible()
  })

  test("a crashed session's work is offered and restored as unsaved", async ({ page }) => {
    await page.evaluate((scene) => {
      sessionStorage.setItem(
        "e2e-seed",
        JSON.stringify({ recovery: [{ token: "r0", title: "Robot arm", scene }] })
      )
    }, emptyScene("Robot arm"))
    await page.reload()
    const dialog = page.getByRole("dialog", { name: "Recover unsaved work" })
    await expect(dialog.getByText("Robot arm")).toBeVisible()
    await dialog.getByRole("button", { name: "Restore" }).click()
    await expect(dialog).toBeHidden()
    await expect(status(page)).toContainText("Unsaved changes")
  })

  test("a .stvd from the command line or a second launch opens", async ({ page }) => {
    await page.evaluate((scene) => {
      sessionStorage.setItem(
        "e2e-seed",
        JSON.stringify({ disk: { "launched.stvd": scene }, launch: "launched.stvd" })
      )
    }, emptyScene("Launched"))
    await page.reload()
    await expect(page.getByText("Launched")).toBeVisible()
    await expect(status(page)).toContainText("No changes")
  })

  test("unsaved changes are autosaved, and undoing them removes the autosave", async ({ page }) => {
    await newGroup(page)
    await expect.poll(() => autosave(page), { timeout: 10_000 }).not.toBeNull()
    await expect(status(page)).toContainText("autosaved")
    await page.keyboard.press("Escape")
    await page.keyboard.press("Control+z")
    await expect.poll(() => autosave(page)).toBeNull()
    await expect(status(page)).toContainText("No changes")
  })
})
