import process from "node:process"
import { defineConfig, devices } from "@playwright/test"

// Chromium approximates WebView2 (Windows); WebKit approximates WebKitGTK (Linux). CI runs
// both (E2E_BROWSERS=chromium,webkit); locally only the installed browsers are used.
const browsers = (process.env.E2E_BROWSERS ?? "chromium").split(",").map((b) => b.trim())
const viewport = { width: 1440, height: 900 }
// CI runners have no GPU. Chromium's implicit software-WebGL fallback is deprecated, so opt
// in to SwiftShader explicitly: WebGL2 then behaves the same on every machine.
const chromiumArgs = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0, // a flaky E2E test is a bug to fix, not to retry
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:1420",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:1420",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    ...(browsers.includes("chromium")
      ? [
          {
            name: "chromium",
            use: { ...devices["Desktop Chrome"], viewport, launchOptions: { args: chromiumArgs } },
          },
        ]
      : []),
    ...(browsers.includes("webkit")
      ? [
          {
            name: "webkit",
            // Desktop Safari defaults to 2x: four times the software-rendered pixels on CI.
            use: { ...devices["Desktop Safari"], viewport, deviceScaleFactor: 1 },
          },
        ]
      : []),
  ],
})
