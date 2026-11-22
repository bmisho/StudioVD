import { readFileSync } from "node:fs"
import type { Page } from "@playwright/test"
import { backendCalls, expect, test } from "./fixtures"

// PLAN 14.4-14.6, 14.9: the online catalog against the mocked backend (signatures, downloads
// and the network are Rust's, tested with cargo): consent before any network use, a refresh
// that lists the catalog, a download with progress installed as Official, packs removed,
// offline mode honoured, the connection test, and the schematic primitives source.
test.use({ contextOptions: { reducedMotion: "reduce" } })

const FIXTURES = "src/core/schema/testing/fixtures/library"
const index = readFileSync(`${FIXTURES}/catalog.valid.json`, "utf8")
const manifest = readFileSync(`${FIXTURES}/component-asset.valid.json`, "utf8")
const PACK = "f".repeat(64)

async function publish(page: Page) {
  await page.evaluate(
    ({ index, holds }) =>
      (
        window as unknown as {
          __E2E_CATALOG__: { publish: (i: string, h: Record<string, unknown[]>) => void }
        }
      ).__E2E_CATALOG__.publish(index, holds),
    { index, holds: { [PACK]: [{ id: "acme/knob-15mm", version: "2.1.0-beta.1", manifest }] } }
  )
}

async function source(page: Page, name: string) {
  await page.getByRole("tab", { name: "Library" }).click()
  await page.getByRole("combobox", { name: "Library source" }).click()
  await page.getByRole("option", { name }).click()
  return page.getByRole("listbox", { name: "Components" })
}

test("consent, refresh, download with progress, install as Official, remove", async ({ page }) => {
  await publish(page)
  const list = await source(page, "Online catalog")
  const bar = page.getByRole("status").filter({ hasText: "Refresh to browse" })
  await expect(bar).toBeVisible()
  await page.getByRole("button", { name: "Refresh the catalog" }).click()
  // Nothing goes out before the user agrees; the dialog names the host.
  const consent = page.getByRole("alertdialog", { name: "Use the network?" })
  await expect(consent.getByRole("list", { name: "Hosts" })).toContainText("catalog.example")
  expect(await backendCalls(page)).not.toContain("catalog_refresh")
  await consent.getByRole("button", { name: "Allow" }).click()
  const card = list.getByRole("option", { name: /Knob 15 mm/ })
  // The only card is the active one; not insertable yet, so its option is aria-disabled.
  await expect(card).toHaveAttribute("aria-disabled", "true")
  const details = page.getByLabel("Component details")
  await expect(details).toContainText("Download its pack (90 kB)")
  await details.getByRole("button", { name: /Download pack/ }).click()
  await expect(details.getByRole("progressbar")).toBeVisible()
  await expect(page.getByText("Installed 1 component from Knob 15 mm")).toBeVisible()
  await expect(details.getByRole("button", { name: "Insert" })).not.toHaveAttribute(
    "aria-disabled",
    "true"
  )
  expect(
    await page.evaluate(() =>
      (window as unknown as { __E2E__: { libraryIds(): string[] } }).__E2E__.libraryIds()
    )
  ).toEqual(["acme/knob-15mm@2.1.0-beta.1"])

  await page.getByRole("button", { name: "Packs…" }).click()
  const packs = page.getByRole("dialog", { name: "Packs" })
  const row = packs.getByRole("listitem", { name: "All knobs" })
  await expect(row).toContainText("Installed")
  await row.getByRole("button", { name: "Remove" }).click()
  await expect(row).toContainText("Not installed")
  await expect(packs).toContainText("Library 2.0 MB")
})

test("offline mode stops network use; the connection test asks for consent first", async ({
  page,
}) => {
  await publish(page)
  await page.getByRole("menuitem", { name: "Edit" }).click()
  await page.getByRole("menuitem", { name: "Network Settings…" }).click()
  const settings = page.getByRole("dialog", { name: "Network settings" })
  await settings.getByRole("switch", { name: /Offline mode/ }).click()
  await expect(settings.getByRole("switch", { name: /Offline mode/ })).toBeChecked()
  await page.keyboard.press("Escape")
  await expect(settings).toBeHidden()
  await source(page, "Online catalog")
  await expect(page.getByRole("status").filter({ hasText: "Offline mode is on." })).toBeVisible()
  await page.getByRole("button", { name: "Refresh the catalog" }).click()
  await expect(page.getByText("Offline mode is on").first()).toBeVisible()
  expect(await backendCalls(page)).not.toContain("catalog_refresh")

  await page.getByRole("button", { name: "Network settings…" }).click()
  await settings.getByRole("switch", { name: /Offline mode/ }).click()
  await expect(settings.getByRole("switch", { name: /Offline mode/ })).not.toBeChecked()
  await settings.getByRole("button", { name: "Test connection" }).click()
  await page
    .getByRole("alertdialog", { name: "Use the network?" })
    .getByRole("button", { name: "Allow" })
    .click()
  await expect(settings.getByRole("list", { name: "Connection test" })).toContainText(
    "catalog.example answered"
  )
})

test("a schematic primitive from the Library lands in the schematic", async ({ page }) => {
  const list = await source(page, "Schematic primitives")
  await page.getByRole("searchbox", { name: "Search components" }).fill("resistor")
  await expect(list.getByRole("option").first()).toContainText("Resistor")
  await page.getByRole("searchbox", { name: "Search components" }).press("Enter")
  await expect(page.locator(".react-flow__node").filter({ hasText: "Resistor 1" })).toBeVisible()
})
