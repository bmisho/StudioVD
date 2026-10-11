import { readFileSync } from "node:fs"
import { test as base, expect, type BrowserContext, type Page } from "@playwright/test"
import { installTauriMockScript, type E2EBackend } from "./tauriMock"

/**
 * The webview never touches the network (CLAUDE.md §6): every test fails if the page, a
 * worker or a WebSocket reaches another origin. Vite's own HMR socket is same-origin.
 */
const offlineGuard = async (
  { context, baseURL }: { context: BrowserContext; baseURL: string | undefined },
  use: (value: undefined) => Promise<void>
) => {
  const origin = new URL(baseURL ?? "http://localhost:1420").origin
  const blocked: string[] = []
  await context.route(
    (url) => url.origin !== origin,
    (route) => {
      blocked.push(route.request().url())
      return route.abort("blockedbyclient")
    }
  )
  await context.routeWebSocket(
    (url) => url.origin.replace(/^ws/, "http") !== origin,
    (ws) => {
      blocked.push(ws.url())
      return ws.close()
    }
  )
  await use(undefined)
  expect(blocked, "the webview makes no network requests (CLAUDE.md §6)").toEqual([])
}

export const test = base.extend<{ offlineGuard: undefined }>({
  offlineGuard: [offlineGuard, { auto: true }],
  page: async ({ page }, use) => {
    await page.addInitScript(installTauriMockScript)
    await page.goto("/")
    await expect(page.getByRole("menubar", { name: "Main menu" })).toBeVisible()
    await use(page)
  },
})

export { expect }

export async function backendCalls(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __E2E__: E2EBackend }).__E2E__.calls)
}

/** A file from tests/fixtures, ready to hand to the mocked backend. */
export function fixtureFile(name: string, as = name): { name: string; base64: string } {
  const bytes = readFileSync(new URL(`../fixtures/${name}`, import.meta.url))
  return { name: as, base64: bytes.toString("base64") }
}

/** The next File › Import dialog returns these files. */
export async function queueImportPick(page: Page, files: { name: string; base64: string }[]) {
  await page.evaluate(
    (f) => (window as unknown as { __E2E__: E2EBackend }).__E2E__.queuePick(f),
    files
  )
}

export async function exportedFiles(page: Page) {
  return page.evaluate(() => (window as unknown as { __E2E__: E2EBackend }).__E2E__.exports())
}

export async function storedAssetIds(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __E2E__: E2EBackend }).__E2E__.assetIds())
}

/** Files dropped on the window (what Rust emits after registering them). */
export async function dropFiles(
  page: Page,
  files: { name: string; base64: string }[],
  skipped: string[] = []
) {
  await page.evaluate(
    ([f, s]) => (window as unknown as { __E2E__: E2EBackend }).__E2E__.drop(f, s),
    [files, skipped] as const
  )
}
