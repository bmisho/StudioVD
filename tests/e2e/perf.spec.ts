import type { Page } from "@playwright/test"
import { expect, test } from "./fixtures"
import { enterTestMode, waitForViewport } from "./viewportHelpers"

// PLAN 15.3: a measurement, not a check (STUDIOVD_PERF=1 runs it). A 200-part assembly of about
// 2.2 M triangles inserted from the Library: insert-to-drawn time, frame times while orbiting,
// and in test mode (the parts are stacked where they landed, so test mode starts with many
// overlaps: a worst case for its start). Headless runs render with SwiftShader on the CPU, so the numbers are a worst case
// to compare commits by; the target (60 fps orbit on an integrated GPU) is checked on hardware.
test.skip(!process.env.STUDIOVD_PERF, "a measurement: run with STUDIOVD_PERF=1")

/** Frame intervals (ms) the page sees while `act` runs: median and 95th percentile. */
async function frameTimes(page: Page, act: () => Promise<void>) {
  await page.evaluate(() => {
    const w = window as unknown as { __ft: number[]; __ftRun: boolean }
    w.__ft = []
    w.__ftRun = true
    let last = performance.now()
    const tick = (now: number) => {
      w.__ft.push(now - last)
      last = now
      if (w.__ftRun) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  await act()
  const ft = await page.evaluate(() => {
    const w = window as unknown as { __ft: number[]; __ftRun: boolean }
    w.__ftRun = false
    return w.__ft.slice(1)
  })
  const sorted = [...ft].sort((a, b) => a - b)
  const at = (q: number) => Math.round(sorted[Math.floor(q * (sorted.length - 1))] ?? 0)
  return { frames: ft.length, medianMs: at(0.5), p95Ms: at(0.95) }
}

/** Inserts `count` of the Library's top result for `query` (Enter places it mid-view). */
async function insertMany(page: Page, query: string, count: number) {
  const search = page.getByRole("searchbox", { name: "Search components" })
  await search.fill(query)
  for (let i = 0; i < count; i++) await search.press("Enter")
}

test("200 parts, 2.2 M triangles: load, orbit and test-mode frame times", async ({ page }) => {
  test.setTimeout(900_000)
  await waitForViewport(page)
  await page.getByRole("tab", { name: "Library" }).click()
  const start = Date.now()
  // 70 lead screws (28 800 triangles each) and 130 spur gears (1 408 each).
  await insertMany(page, "T8x8 300", 70)
  await insertMany(page, "module 1 12 teeth", 130)
  const drawn = () =>
    page.evaluate(() => {
      const v = window.__STUDIOVD_VIEWPORT__
      const parts = v?.parts() ?? []
      return parts.filter((p) => v?.partMesh(p.id)?.loaded === true).length
    })
  await expect.poll(drawn, { timeout: 600_000, intervals: [1000] }).toBe(200)
  const loadMs = Date.now() - start

  await page.keyboard.press("f")
  const box = await page.getByTestId("viewport-canvas").boundingBox()
  if (!box) throw new Error("no view")
  const [cx, cy] = [box.x + box.width / 2, box.y + box.height / 2]
  const orbit = await frameTimes(page, async () => {
    await page.mouse.move(cx, cy)
    await page.mouse.down({ button: "middle" })
    for (let i = 0; i < 120; i++) await page.mouse.move(cx + Math.sin(i / 10) * 200, cy + i)
    await page.mouse.up({ button: "middle" })
  })
  await enterTestMode(page)
  const testMode = await frameTimes(page, () => page.waitForTimeout(3000))
  console.log(
    `PERF ${JSON.stringify({ parts: 200, triangles: 2_199_040, loadMs, orbit, testMode })}`
  )
})
