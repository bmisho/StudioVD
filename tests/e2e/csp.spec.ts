import type { Page } from "@playwright/test"
import { importFixture } from "./assemblyHelpers"
import { expect, test } from "./fixtures"
import { enterTestMode } from "./viewportHelpers"

// PLAN 15.1: the production build under the release CSP (tauri.conf.json, served by
// `vite preview`): textured and DRACO GLBs decode (blob: URLs, a blob worker), Rapier and the
// decoders' WebAssembly run, the solver worker starts, and nothing is refused.

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __csp: string[] }
    w.__csp = []
    document.addEventListener("securitypolicyviolation", (e) =>
      w.__csp.push(
        `${e.violatedDirective} ${e.blockedURI} at ${e.sourceFile}:${e.lineNumber}:${e.columnNumber}`
      )
    )
  })
  // The fixture opened the app before this script was added: load it again, watched.
  await page.reload()
  await expect(page.getByRole("menubar", { name: "Main menu" })).toBeVisible()
})

const violations = (page: Page) =>
  page.evaluate(() => (window as unknown as { __csp: string[] }).__csp)

test("the app runs under the release CSP", async ({ page }) => {
  test.setTimeout(120_000)
  const header = await page.evaluate(async () =>
    (await fetch("/")).headers.get("content-security-policy")
  )
  expect(header).toContain("script-src 'self' 'wasm-unsafe-eval'")

  await importFixture(page, "textured.glb")
  await importFixture(page, "sample-draco.glb")
  await enterTestMode(page)
  await page.getByRole("button", { name: "Test Mode" }).click()

  await page.getByRole("menuitem", { name: "Help" }).click()
  await page.getByRole("menuitem", { name: "Examples" }).click()
  await page.getByRole("menuitem", { name: "Lever torque sets servo current" }).press("Enter")
  await page.getByRole("alertdialog").getByRole("button", { name: "Don't Save" }).click()
  await expect(page.getByRole("contentinfo", { name: "Status bar" })).toContainText("Solved", {
    timeout: 30_000,
  })
  expect(await violations(page)).toEqual([])
})
