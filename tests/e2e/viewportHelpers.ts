import type { Page } from "@playwright/test"
import type { ClientPoint, PartPoseState } from "../../src/features/viewport/testing/probeTypes"
import { expect } from "./fixtures"

/** Waits until the 3D view renders with its environment map (first frames done). */
export async function waitForViewport(page: Page) {
  await expect(page.getByTestId("viewport-canvas").locator("canvas")).toHaveAttribute(
    "data-engine",
    /^three\.js r\d+$/,
    { timeout: 20_000 }
  )
  await page.waitForFunction(() => window.__STUDIOVD_VIEWPORT__?.environmentReady() === true)
}

/** Help > Insert Physics Test Rig; returns the part ids once both parts are on screen. */
export async function insertTestRig(page: Page): Promise<{ base: string; leaf: string }> {
  await page.getByRole("menuitem", { name: "Help" }).click()
  await page.getByRole("menuitem", { name: "Insert Physics Test Rig" }).click()
  const parts = await page.evaluate(() => window.__STUDIOVD_VIEWPORT__?.parts() ?? [])
  const id = (name: string) => parts.find((p) => p.name === name)?.id ?? ""
  const ids = { base: id("Base"), leaf: id("Leaf") }
  await expect.poll(() => projectPart(page, ids.leaf)).not.toBeNull()
  return ids
}

export const projectPart = (page: Page, id: string) =>
  page.evaluate((i) => window.__STUDIOVD_VIEWPORT__?.projectPart(i) ?? null, id)

export async function partCenter(page: Page, id: string): Promise<ClientPoint> {
  const p = await projectPart(page, id)
  if (!p) throw new Error(`part ${id} is not on screen`)
  return p
}

export const project = (page: Page, point: [number, number, number]) =>
  page.evaluate((p) => window.__STUDIOVD_VIEWPORT__?.project(p), point) as Promise<ClientPoint>

export const highlightPixels = (page: Page) =>
  page.evaluate(() => window.__STUDIOVD_VIEWPORT__?.highlightPixels() ?? 0)

export const hoveredId = (page: Page) =>
  page.evaluate(() => window.__STUDIOVD_VIEWPORT__?.hoveredId() ?? null)

export const partPose = (page: Page, id: string) =>
  page.evaluate((i) => window.__STUDIOVD_VIEWPORT__?.partPose(i), id) as Promise<PartPoseState>

/** Rotation about +Z in degrees, for a pose that only turns about Z (the rig's hinge). */
export function angleZDeg(pose: PartPoseState): number {
  const [, , z, w] = pose.quaternion
  return (2 * Math.atan2(z, w) * 180) / Math.PI
}

/** Clicks the toolbar's Test Mode button and waits until parts can be dragged. */
export async function enterTestMode(page: Page) {
  await page.getByRole("button", { name: "Test Mode" }).click()
  await expect(page.getByText("Mode Test")).toBeVisible()
  await page.waitForFunction(() => window.__STUDIOVD_VIEWPORT__?.dragReady() === true)
}
