import type { Page } from "@playwright/test"
import { expect, test } from "./fixtures"
import { insertTestRig, partPose, project, projectPart, waitForViewport } from "./viewportHelpers"

// PLAN 4.7 (scene graph operations) and 4.8 (transform gizmo), on the physics test rig.
test.use({ contextOptions: { reducedMotion: "reduce" } })

const tree = (page: Page) => page.getByRole("tree", { name: "Scene graph" })
const row = (page: Page, name: string) => tree(page).getByRole("treeitem", { name })
const parts = (page: Page) => page.evaluate(() => window.__STUDIOVD_VIEWPORT__?.parts() ?? [])
const gizmoAxis = (page: Page) =>
  page.evaluate(() => window.__STUDIOVD_VIEWPORT__?.gizmoAxis() ?? null)

test.describe("scene graph operations", () => {
  test.beforeEach(async ({ page }) => {
    await waitForViewport(page)
  })

  test("hide/show and isolate change what is drawn, not what exists", async ({ page }) => {
    const { base, leaf } = await insertTestRig(page)
    await row(page, "Leaf").click()
    await page.keyboard.press("h")
    await expect(row(page, "Leaf")).toContainText("(hidden)")
    await expect.poll(() => projectPart(page, leaf)).toBeNull()
    await page.keyboard.press("h")
    await expect.poll(() => projectPart(page, leaf)).not.toBeNull()

    await page.keyboard.press("i") // isolate the leaf: the base is not drawn
    await expect.poll(() => projectPart(page, base)).toBeNull()
    await page.keyboard.press("i")
    await expect.poll(() => projectPart(page, base)).not.toBeNull()
    expect(await parts(page)).toHaveLength(2)
  })

  test("rename, ground and delete a part, each one undo step", async ({ page }) => {
    await insertTestRig(page)
    await row(page, "Leaf").click()
    const name = page.getByLabel("Name")
    await name.click()
    await name.press("Control+a")
    await name.pressSequentially("Lid")
    await name.press("Enter")
    await expect(row(page, "Lid")).toBeVisible()
    await page.getByRole("switch", { name: "Grounded" }).click()
    await expect(row(page, "Lid")).toContainText("(grounded)")

    await row(page, "Lid").click()
    await page.keyboard.press("Delete")
    await expect(row(page, "Lid")).toBeHidden()
    expect((await parts(page)).map((p) => p.name)).toEqual(["Base"])
    await page.keyboard.press("Control+z") // the part and its hinge come back
    await expect(row(page, "Lid")).toBeVisible()
    await page.keyboard.press("Control+z") // grounding undone
    await expect(row(page, "Lid")).not.toContainText("(grounded)")
    await page.keyboard.press("Control+z") // rename undone
    await expect(row(page, "Leaf")).toBeVisible()
  })

  test("the move gizmo drags a part along X as one undo step", async ({ page }) => {
    const { leaf } = await insertTestRig(page)
    await row(page, "Leaf").click()
    const start = (await partPose(page, leaf)).position
    // Walk along the screen direction of world +X from the part's origin over the X handle;
    // past the leaf's edge only empty space lies behind the handle.
    const o = await project(page, start)
    const x = await project(page, [start[0] + 10, start[1], start[2]])
    const len = Math.hypot(x.x - o.x, x.y - o.y)
    const dir = { x: (x.x - o.x) / len, y: (x.y - o.y) / len }
    const onHandle: { x: number; y: number; empty: boolean }[] = []
    for (let d = 10; d <= 200; d += 4) {
      const p = { x: o.x + dir.x * d, y: o.y + dir.y * d }
      await page.mouse.move(p.x, p.y)
      if ((await gizmoAxis(page)) !== "X") continue
      const behind = await page.evaluate(
        ([px, py]) => window.__STUDIOVD_VIEWPORT__?.pickAt(px, py),
        [p.x, p.y] as const
      )
      onHandle.push({ ...p, empty: behind === null })
    }
    const grip = onHandle[0]
    const overEmpty = onHandle.find((p) => p.empty)
    if (!grip || !overEmpty)
      throw new Error(`X handle not found clear of the part: ${JSON.stringify(onHandle)}`)

    // A plain click on a handle is not a click on empty space: the selection stays.
    await page.mouse.click(overEmpty.x, overEmpty.y)
    await expect(row(page, "Leaf")).toHaveAttribute("aria-selected", "true")

    await page.mouse.move(grip.x, grip.y)
    await page.mouse.down()
    for (let i = 1; i <= 10; i++) {
      await page.mouse.move(grip.x + dir.x * 6 * i, grip.y + dir.y * 6 * i)
    }
    await page.mouse.up()

    const moved = (await partPose(page, leaf)).position
    expect(moved[0]).toBeGreaterThan(start[0] + 5)
    expect(moved[1]).toBeCloseTo(start[1], 3) // constrained to X
    expect(moved[2]).toBeCloseTo(start[2], 3)
    await expect(row(page, "Leaf")).toHaveAttribute("aria-selected", "true")

    await page.keyboard.press("Control+z")
    await expect.poll(async () => (await partPose(page, leaf)).position).toEqual(start)
  })
})
