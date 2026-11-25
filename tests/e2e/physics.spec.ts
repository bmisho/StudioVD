import { expect, test } from "./fixtures"
import {
  angleZDeg,
  enterTestMode,
  hoveredId,
  insertTestRig,
  partPose,
  project,
  waitForViewport,
} from "./viewportHelpers"

// PLAN 3.9-3.10: test mode runs Rapier; a mouse drag swings the hinged leaf until it hits the
// base, and leaving test mode puts every part back at its design pose. The strict physics
// numbers are checked headlessly (src/features/physics/hingeRig.test.ts); this checks the app
// wiring with a real mouse.
test.use({ contextOptions: { reducedMotion: "reduce" } })

/** -(90° + asin(0.5 / 60.5)): the leaf's far edge meets the base's +X face. */
const STOP_DEG = -(90 + (Math.asin(0.5 / 60.5) * 180) / Math.PI)
/** 0.05 mm at the 60.5 mm tip radius, in degrees. */
const TOLERANCE_DEG = ((0.05 / 60.5) * 180) / Math.PI

test("test mode: dragging the leaf into the base stops it at the face", async ({
  page,
}, testInfo) => {
  await page.goto("/")
  await waitForViewport(page)
  const { leaf } = await insertTestRig(page)
  const design = await partPose(page, leaf)
  await page.keyboard.press("Control+1") // front view: the drag plane is the hinge's plane

  await enterTestMode(page)
  const frames = () => page.evaluate(() => window.__STUDIOVD_VIEWPORT__?.framesRendered() ?? 0)
  const before = await frames()
  await expect.poll(frames).toBeGreaterThan(before + 5) // renders continuously

  // Grab the leaf's front face near its free end and pull down and left, into the base.
  const grab = await project(page, [115, 85, 30])
  await page.mouse.move(grab.x, grab.y)
  await page.mouse.down()
  const angles: number[] = []
  for (let i = 1; i <= 24; i++) {
    await page.mouse.move(grab.x - i * 10, grab.y + i * 15)
    angles.push(angleZDeg(await partPose(page, leaf)))
  }
  await expect.poll(async () => angleZDeg(await partPose(page, leaf))).toBeLessThan(STOP_DEG + 0.1)
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(50)
    angles.push(angleZDeg(await partPose(page, leaf)))
  }
  expect(Math.min(...angles)).toBeGreaterThan(STOP_DEG - TOLERANCE_DEG)
  // A page clip, not the element's own screenshot: that waits for the canvas to be "stable"
  // over animation frames, which a GPU-less runner can starve while test mode renders every
  // frame with the button held (CI timed out there, 0.2.1).
  const clip = await page.getByTestId("viewport-canvas").boundingBox()
  if (clip) {
    const shot = await page.screenshot({ clip })
    await testInfo.attach("leaf-at-stop.png", { body: shot, contentType: "image/png" })
  }

  // Released, it stays where it is (damping, no gravity in Rapier).
  await page.mouse.up()
  await page.waitForTimeout(500)
  const rest = angleZDeg(await partPose(page, leaf))
  await page.waitForTimeout(300)
  expect(angleZDeg(await partPose(page, leaf))).toBeCloseTo(rest, 2)

  // Reset to Design Pose restarts the run without leaving test mode.
  await page.getByRole("button", { name: "Reset to Design Pose" }).click()
  await expect.poll(async () => (await partPose(page, leaf)).position).toEqual(design.position)
  await expect(page.getByText("Mode Test")).toBeVisible()

  // Leaving test mode restores the design pose and idles the view again.
  await page.mouse.move(grab.x, grab.y)
  await page.mouse.down()
  await page.mouse.move(grab.x - 100, grab.y + 150, { steps: 10 })
  await page.mouse.up()
  await page.getByRole("button", { name: "Test Mode" }).click()
  await expect(page.getByText("Mode Design")).toBeVisible()
  const restored = await partPose(page, leaf)
  expect(restored.position).toEqual(design.position)
  expect(restored.quaternion).toEqual(design.quaternion)
  await page.waitForTimeout(300)
  const idle = await frames()
  await page.waitForTimeout(500)
  expect(await frames()).toBe(idle)
})

test("leaving test mode from the keyboard refreshes the hover under a still cursor", async ({
  page,
}) => {
  await page.goto("/")
  await waitForViewport(page)
  const { leaf } = await insertTestRig(page)
  await page.keyboard.press("Control+1")
  await enterTestMode(page)
  const grab = await project(page, [115, 85, 30])
  await page.mouse.move(grab.x, grab.y)
  await page.mouse.down()
  await page.mouse.move(grab.x - 240, grab.y + 360, { steps: 12 })
  await expect.poll(async () => angleZDeg(await partPose(page, leaf))).toBeLessThan(-89)
  await page.mouse.up()
  // Hover the leaf where it hangs now, then leave test mode without touching the mouse.
  const hanging = await project(page, [64.5, 50, 30])
  await page.mouse.move(hanging.x, hanging.y)
  await expect.poll(() => hoveredId(page)).toBe(leaf)
  await page.getByRole("button", { name: "Test Mode" }).focus()
  await page.keyboard.press("Enter")
  await expect(page.getByText("Mode Design")).toBeVisible()
  // The leaf is back on top of the base; nothing is under the cursor any more.
  const pickAtCursor = () =>
    page.evaluate(([x, y]) => window.__STUDIOVD_VIEWPORT__?.pickAt(x, y) ?? null, [
      hanging.x,
      hanging.y,
    ] as const)
  await expect.poll(pickAtCursor).toBeNull()
  await expect.poll(() => hoveredId(page)).toBeNull()
})

// PLAN 10.4, 10.7: the mate shows its live angle while the leaf moves; Apply Pose keeps the
// tested pose as one undo entry, with the hinge still exact (no "Snap again").
test("test mode: the hinge reads live, and Apply Pose keeps the pose", async ({ page }) => {
  await page.goto("/")
  await waitForViewport(page)
  const { leaf } = await insertTestRig(page)
  const design = await partPose(page, leaf)
  await page.keyboard.press("Control+1")
  const tree = page.getByRole("tree", { name: "Scene graph" })
  await tree.getByRole("treeitem", { name: /^Revolute: Base – Leaf/ }).click()
  const inspector = page.getByRole("complementary", { name: "Properties" })

  await enterTestMode(page)
  const grab = await project(page, [115, 85, 30])
  await page.mouse.move(grab.x, grab.y)
  await page.mouse.down()
  await page.mouse.move(grab.x - 30, grab.y - 60, { steps: 12 }) // lift the leaf
  // Hold until it has lifted: the drag spring pulls it up over physics steps, and how many run
  // during the moves depends on the browser's frame rate (WebKit released it at 9.5°).
  await expect
    .poll(async () => angleZDeg(await partPose(page, leaf)), { timeout: 20_000 })
    .toBeGreaterThan(20)
  await page.mouse.up()
  // Damped to rest: on a loaded machine the physics runs slower than real time, so wait for
  // the leaf to stop rather than for a fixed time.
  let last = Infinity
  await expect
    .poll(
      async () => {
        const now = angleZDeg(await partPose(page, leaf))
        const still = Math.abs(now - last) < 0.02
        last = now
        return still
      },
      { intervals: [250], timeout: 20_000 }
    )
    .toBe(true)
  const lifted = angleZDeg(await partPose(page, leaf))
  expect(lifted).toBeGreaterThan(15)
  // The reading follows the leaf (refreshed ten times a second; it may still creep a little).
  const reading = inspector.getByText(/^Now \(test mode\)/).locator("..")
  const shown = async () => Number(/(-?[\d.]+)°/.exec((await reading.textContent()) ?? "")?.[1])
  await expect.poll(async () => Math.abs((await shown()) - lifted)).toBeLessThan(0.5)

  const before = angleZDeg(await partPose(page, leaf))
  await page.getByRole("button", { name: "Apply Pose" }).click()
  await expect(page.getByText("Mode Design")).toBeVisible()
  const kept = await partPose(page, leaf)
  expect(Math.abs(angleZDeg(kept) - before)).toBeLessThan(0.5)
  expect(Math.abs(angleZDeg(kept) - angleZDeg(design))).toBeGreaterThan(15)
  await expect(inspector.getByText(/^Now \(test mode\)/)).toBeHidden()
  await expect(inspector.getByRole("button", { name: "Snap again" })).toBeHidden()

  await page.keyboard.press("Control+z") // one undo entry back to the design pose
  await expect.poll(async () => (await partPose(page, leaf)).quaternion).toEqual(design.quaternion)
})
