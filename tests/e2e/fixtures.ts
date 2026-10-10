import { test as base, expect, type Page } from "@playwright/test"

/**
 * Replaces the Tauri backend before the app loads (the browser equivalent of `mockIPC`):
 * - `app_info` answers like the real Rust command,
 * - project/import/export commands throw Rust-shaped `notImplemented` errors,
 * - every call is recorded in `window.__E2E_CALLS__`.
 */
async function installTauriMock(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>
    const calls: string[] = []
    const phases: Record<string, string> = {
      project_new: "Creating projects arrives in Phase 5.",
      project_open: "Opening projects arrives in Phase 5.",
      project_save: "Saving projects arrives in Phase 5.",
      project_save_as: "Saving projects arrives in Phase 5.",
      import_files: "Importing CAD files arrives in Phase 4.",
      export_scene: "Exporting the scene arrives in Phase 4.",
    }
    let callbackId = 0
    w.__E2E_CALLS__ = calls
    w.isTauri = true
    w.__TAURI_INTERNALS__ = {
      invoke: (cmd: string) => {
        calls.push(cmd)
        if (cmd === "app_info") {
          return Promise.resolve({
            name: "StudioVD",
            version: "0.1.0",
            tauriVersion: "2.e2e",
            os: "e2e-os",
            arch: "e2e-arch",
          })
        }
        const message = phases[cmd]
        // Tauri rejects with the serialized Rust AppError object, not an Error instance.
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
        if (message) return Promise.reject({ kind: "notImplemented", message })
        return Promise.resolve(null)
      },
      transformCallback: (callback: unknown) => {
        callbackId += 1
        w[`_${callbackId}`] = callback
        return callbackId
      },
      metadata: {
        currentWindow: { label: "main" },
        currentWebview: { windowLabel: "main", label: "main" },
      },
    }
  })
}

export const test = base.extend({
  page: async ({ page }, use) => {
    await installTauriMock(page)
    await page.goto("/")
    await expect(page.getByRole("menubar", { name: "Main menu" })).toBeVisible()
    await use(page)
  },
})

export { expect }

export async function backendCalls(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __E2E_CALLS__: string[] }).__E2E_CALLS__)
}
