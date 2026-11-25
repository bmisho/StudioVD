import type { Page } from "@playwright/test"
import { expect, test } from "./fixtures"
import { enterTestMode, project } from "./viewportHelpers"

// Phase 13: the examples, end to end (PLAN 13.5, 13.6): 3D measures feed the solver, and the
// solver's results come back into the 3D view.

const tree = (page: Page) => page.getByRole("tree", { name: "Scene graph" })

/**
 * Help › Examples › `name`, then waits until `part` is in the tree. An example builds its
 * parts in the generator worker; on a GPU-less runner under parallel load that and the first
 * render take several seconds (measured 4-7 s with 4 workers), more than an assertion's 5 s.
 */
async function openExample(page: Page, name: string, part: string, dismissPrompt = false) {
  await page.getByRole("menuitem", { name: "Help" }).click()
  await page.getByRole("menuitem", { name: "Examples" }).click()
  await page.getByRole("menuitem", { name }).press("Enter")
  if (dismissPrompt)
    await page.getByRole("alertdialog").getByRole("button", { name: "Don't Save" }).click()
  await expect(tree(page).getByRole("treeitem", { name: part })).toBeVisible({ timeout: 15_000 })
}
const status = (page: Page) => page.getByRole("contentinfo", { name: "Status bar" })

test("lever torque: gravity on the arm sets the servo's current, shown at the hinge", async ({
  page,
}) => {
  await openExample(page, "Lever torque sets servo current", "Arm (1 DOF)")
  await expect(status(page)).toContainText("Solved")
  // A 10 × 5 × 150 mm steel arm: 0.0589 kg at 75 mm, 43 mN·m; the servo draws
  // 10 mA + 1 A × 0.043/0.18 ≈ 250 mA. The label is a DOM element over the 3D view.
  await expect(page.getByText(/^2\d\d(\.\d+)? mA$/)).toBeVisible()
})

test("light path: the sensor reads I/d² across the base", async ({ page }) => {
  await openExample(page, "Light path blocked by a part", "Shutter (1 DOF)")
  // 50 cd over 0.15 m: 50 / 0.0225 = 2222 lx, face on.
  // The label over the 3D view (the sensor block in the schematic shows the same reading).
  await expect(page.getByRole("region", { name: "3D View" }).getByText("2.222 klx")).toBeVisible()
})

test("hinge dimmer and limit switch build, bind and solve", async ({ page }) => {
  await openExample(page, "Hinge dims an LED", "Lid (1 DOF)")
  await expect(status(page)).toContainText("Solved")
  // Closed lid: wiper at 0, the LED is dark.
  await expect(
    page.locator(".react-flow__node").filter({ hasText: "LED 1" }).getByTestId("block-readout")
  ).toHaveText("0 cd")
  // The lid's mate lists its binding.
  await tree(page).getByRole("treeitem", { name: "Lid (1 DOF)" }).click()
  const props = page.getByRole("complementary", { name: "Properties" })
  await expect(props.getByRole("region", { name: "Bindings" })).toBeVisible()

  await openExample(page, "Limit switch cuts a motor", "Flap (1 DOF)", true)
  // The flap rests on the base: contact opens the switch; the motor stands still.
  await expect(status(page)).toContainText("Solved")
})

test("live loop: opening the lid in test mode lights the LED", async ({ page }) => {
  await openExample(page, "Hinge dims an LED", "Lid (1 DOF)")
  await expect(status(page)).toContainText("Solved")
  const reading = page
    .locator(".react-flow__node")
    .filter({ hasText: "LED 1" })
    .getByTestId("block-readout")
  await expect(reading).toHaveText("0 cd")
  await page.keyboard.press("Control+4") // right view: the hinge axis points at the camera
  await enterTestMode(page)
  // Grab the closed lid near its front edge and pull it up: it swings open about the hinge.
  const grab = await project(page, [0, 8, 35])
  await page.mouse.move(grab.x, grab.y)
  await page.mouse.down()
  for (let i = 1; i <= 20; i++) await page.mouse.move(grab.x - i * 3, grab.y - i * 12)
  // The pose buffer → sampler → worker → readout loop: the LED lights while the lid is open.
  await expect.poll(async () => (await reading.textContent()) ?? "0 cd").not.toBe("0 cd")
  await page.mouse.up()
})

/** A light readout ("4.21 mcd", "0 cd") in candela. */
const candela = (text: string | null) => {
  const m = /^([\d.]+) (µ|m)?cd$/.exec(text ?? "")
  return m ? Number(m[1]) * (m[2] === "m" ? 1e-3 : m[2] === "µ" ? 1e-6 : 1) : Number.NaN
}

test("guitar pedal: cut cables, a solved circuit, and the Volume knob sets the LED (PLAN 16.6)", async ({
  page,
}) => {
  test.setTimeout(120_000)
  await openExample(page, "Guitar pedal", "Volume knob")
  // The first solve of the pedal's circuit took over 5 s in WebKit on CI (0.2.1).
  await expect(status(page)).toContainText("Solved", { timeout: 30_000 })
  const connectors = await page.evaluate(() => window.__STUDIOVD_VIEWPORT__?.connectors() ?? [])
  expect(connectors.filter((c) => c.kind === "cable")).toHaveLength(12)
  // Every cable reaches along its route: no "too short" mark in the tree.
  await expect(tree(page).getByRole("treeitem", { name: "Input" })).toBeVisible()
  await expect(tree(page).getByRole("treeitem", { name: /too short/ })).toHaveCount(0)
  // The knob at its centre: the wiper at half, the LED dim but lit.
  const reading = page
    .locator(".react-flow__node")
    .filter({ hasText: "LED 1" })
    .getByTestId("block-readout")
  await expect.poll(async () => candela(await reading.textContent())).toBeGreaterThan(0)
  const before = candela(await reading.textContent())
  // Turn Volume clockwise seen from above (top view: X right, Z down the screen): grab the
  // knob's top right of its axis and pull it down the screen.
  await page.keyboard.press("Control+5")
  await enterTestMode(page)
  const grab = await project(page, [39, 60, -24])
  await page.mouse.move(grab.x, grab.y)
  await page.mouse.down()
  for (let i = 1; i <= 20; i++) await page.mouse.move(grab.x - i, grab.y + i * 3)
  await expect
    .poll(async () => candela(await reading.textContent()), { timeout: 15_000 })
    .toBeGreaterThan(before * 1.5)
  await page.mouse.up()
})
