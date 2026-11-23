import process from "node:process"
import { defineConfig, devices } from "@playwright/test"

// Chromium approximates WebView2 (Windows); WebKit approximates WebKitGTK (Linux). CI runs
// both (E2E_BROWSERS=chromium,webkit); locally only the installed browsers are used.
const browsers = (process.env.E2E_BROWSERS ?? "chromium").split(",").map((b) => b.trim())
const viewport = { width: 1440, height: 900 }
// CI runners have no GPU. Chromium's implicit software-WebGL fallback is deprecated, so opt
// in to SwiftShader explicitly: WebGL2 then behaves the same on every machine. E2E_GPU=1 (the
// PLAN 15.3 measurement on real hardware) opens a visible window on the machine's own GPU.
const gpu = Boolean(process.env.E2E_GPU)
const chromiumArgs = gpu ? [] : ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
// A sandbox whose preinstalled Chromium is not the build this Playwright downloads points at
// its own binary (E2E_CHROMIUM_PATH=/opt/pw-browsers/chromium); CI installs the pinned build.
const executablePath = process.env.E2E_CHROMIUM_PATH
const launchOptions = { args: chromiumArgs, ...(executablePath && { executablePath }) }
// The release-CSP test runs against a production build (`vite preview`, port 4173).
const CSP_SPEC = /csp\.spec\.ts$/
const PREVIEW = "http://localhost:4173"

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
  webServer: [
    {
      command: "npm run dev",
      url: "http://localhost:1420",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      // A production build served with the release CSP (PLAN 15.1): only csp.spec.ts uses it.
      command:
        "npx vite build --outDir node_modules/.studiovd-csp --emptyOutDir --logLevel warn && npx vite preview --outDir node_modules/.studiovd-csp",
      url: "http://localhost:4173",
      // The production bundle plus the dev probe the helpers read (VITE_E2E_PROBE).
      env: { STUDIOVD_RELEASE_CSP: "1", VITE_E2E_PROBE: "1" },
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
  projects: [
    ...(browsers.includes("chromium")
      ? [
          {
            name: "chromium",
            testIgnore: CSP_SPEC,
            use: { ...devices["Desktop Chrome"], viewport, launchOptions, headless: !gpu },
          },
          {
            name: "chromium-release-csp",
            testMatch: CSP_SPEC,
            use: { ...devices["Desktop Chrome"], viewport, launchOptions, baseURL: PREVIEW },
          },
        ]
      : []),
    ...(browsers.includes("webkit")
      ? [
          {
            name: "webkit",
            testIgnore: CSP_SPEC,
            // Desktop Safari defaults to 2x: four times the software-rendered pixels on CI.
            use: { ...devices["Desktop Safari"], viewport, deviceScaleFactor: 1 },
          },
          {
            name: "webkit-release-csp",
            testMatch: CSP_SPEC,
            use: { ...devices["Desktop Safari"], viewport, deviceScaleFactor: 1, baseURL: PREVIEW },
          },
        ]
      : []),
  ],
})
