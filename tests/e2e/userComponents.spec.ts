import type { Page } from "@playwright/test"
import { expect, test } from "./fixtures"
import type { E2EBackend } from "./tauriMock"
import { waitForViewport } from "./viewportHelpers"

// PLAN 9.7: Save as component writes the selection into My components (one format, one
// validator), where it is inserted like any library component and exported as a pack.
test.use({ contextOptions: { reducedMotion: "reduce" } })

const libraryIds = (page: Page) =>
  page.evaluate(() => (window as unknown as { __E2E__: E2EBackend }).__E2E__.libraryIds())
const exported = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { __E2E__: E2EBackend }).__E2E__.exports().map((x) => x.name)
  )
const components = (page: Page) =>
  page.evaluate(() => window.__STUDIOVD_VIEWPORT__?.components() ?? [])

async function saveAsComponent(page: Page) {
  await page.getByRole("menuitem", { name: "Edit" }).click()
  await page.getByRole("menuitem", { name: "Save as Component…" }).click()
  return page.getByRole("dialog", { name: "Save as component" })
}

test("save a bearing to My components, insert it again and export it", async ({ page }) => {
  test.setTimeout(90_000)
  await waitForViewport(page)
  await page.getByRole("tab", { name: "Library" }).click()
  const list = page.getByRole("listbox", { name: "Components" })
  await page.getByRole("searchbox", { name: "Search components" }).fill("608")
  await list.getByRole("option", { name: /608-2RS/ }).click()
  await page.getByRole("button", { name: "Insert", exact: true }).click()
  await expect.poll(() => components(page), { timeout: 20_000 }).toHaveLength(1)

  // The inserted bearing is selected as its group: Save as component takes both rings.
  let dialog = await saveAsComponent(page)
  await expect(dialog).toContainText("2 parts")
  await expect(dialog).toContainText("1 mate between them")
  await expect(dialog.getByLabel("Name")).toHaveValue("Ball bearing 608-2RS")
  await dialog.getByLabel("Name").fill("My bearing")
  await expect(dialog).toContainText("Saved as u-e2etst/my-bearing")
  await expect(dialog.getByLabel("Version")).toHaveValue("1.0.0")
  await dialog.getByRole("button", { name: "Save to My components" }).click()
  await expect(dialog).toBeHidden()
  expect(await libraryIds(page)).toEqual(["u-e2etst/my-bearing@1.0.0"])

  await page.getByRole("combobox", { name: "Library source" }).click()
  await page.getByRole("option", { name: "My components" }).click()
  const card = list.getByRole("option", { name: /My bearing/ })
  await expect(card).toContainText("User")
  await card.click()
  await page.getByRole("button", { name: "Insert", exact: true }).click()
  await expect
    .poll(async () => (await components(page)).map((c) => `${c.designator} ${c.name}`))
    .toEqual(["BRG1 Ball bearing 608-2RS", "BRG2 My bearing"])
  const [, mine] = await components(page)
  expect(mine?.parts.sort()).toEqual(["inner", "outer"]) // the generator's keys, kept

  // Saving it again suggests the next patch; reusing a saved version is refused.
  dialog = await saveAsComponent(page)
  await expect(dialog.getByLabel("Name")).toHaveValue("My bearing")
  await expect(dialog.getByLabel("Version")).toHaveValue("1.0.1")
  await dialog.getByLabel("Version").fill("1.0.0")
  await expect(dialog.getByRole("alert")).toContainText("already in your library")
  await expect(dialog.getByRole("button", { name: "Save to My components" })).toBeDisabled()
  await dialog.getByRole("button", { name: "Cancel" }).click()
  await expect(dialog).toBeHidden()

  await page.getByRole("button", { name: "Export as a pack…" }).click()
  await expect.poll(() => exported(page)).toEqual(["my-bearing.stvdpack"])
})
