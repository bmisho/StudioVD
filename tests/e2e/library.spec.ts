import { readFileSync } from "node:fs"
import type { Page } from "@playwright/test"
import { expect, test } from "./fixtures"
import type { E2EBackend } from "./tauriMock"
import { partCenter, project, waitForViewport } from "./viewportHelpers"

// PLAN 9.4, 9.5: the Library tab lists the generators; a card is inserted as one component
// (one undo entry), named by its designator, and selected as its group.
test.use({ contextOptions: { reducedMotion: "reduce" } })

const components = (page: Page) =>
  page.evaluate(() => window.__STUDIOVD_VIEWPORT__?.components() ?? [])

async function openLibrary(page: Page) {
  await waitForViewport(page) // placement reads the 3D view
  await page.getByRole("tab", { name: "Library" }).click()
  return page.getByRole("listbox", { name: "Components" })
}

test.describe("library", () => {
  test.describe.configure({ timeout: 90_000 })

  test("every Eurobox size is in the Library, with its stacking anchors (0.2.1)", async ({
    page,
  }) => {
    const list = await openLibrary(page)
    const search = page.getByRole("searchbox", { name: "Search components" })
    // The list draws only the rows in view: count one footprint's heights instead of all 21.
    await search.fill("eurobox 800")
    await expect(list.getByRole("option")).toHaveText([
      /800 × 600 × 120/,
      /800 × 600 × 220/,
      /800 × 600 × 320/,
      /800 × 600 × 420/,
      /800 × 600 × 520/,
    ])
    await search.fill("eurobox 600 × 400 × 220")
    await list.getByRole("option", { name: /600 × 400 × 220/ }).click()
    await page.getByRole("button", { name: "Insert", exact: true }).click()
    await expect.poll(() => components(page), { timeout: 20_000 }).toHaveLength(1)
    const [box] = await components(page)
    expect(box?.name).toBe("Eurobox 600 × 400 × 220")
    // Its rim and stacking seat carry the same tag: the Mate tool pairs them.
    const anchors = await page.evaluate(() => window.__STUDIOVD_VIEWPORT__?.anchors() ?? [])
    expect(anchors.map((a) => a.name).sort()).toEqual(["Bottom", "Floor", "Rim", "Stacking seat"])
  })

  test("search, insert with Enter and with Insert, undo and redo", async ({ page }) => {
    const list = await openLibrary(page)
    await expect(list.getByRole("option").first()).toBeVisible()
    await page.getByRole("searchbox", { name: "Search components" }).fill("608")
    await expect(list.getByRole("option")).toHaveCount(1)
    await expect(list.getByRole("option")).toContainText("608-2RS")
    await list.focus()
    await page.keyboard.press("Enter")
    await expect.poll(() => components(page), { timeout: 20_000 }).toHaveLength(1)
    const [bearing] = await components(page)
    expect(bearing).toMatchObject({
      designator: "BRG1",
      name: "Ball bearing 608-2RS",
      parts: ["outer", "inner"],
    })
    const tree = page.getByRole("tree", { name: "Scene graph" })
    await page.getByRole("tab", { name: "Scene" }).click()
    await expect(tree.getByRole("treeitem", { name: /BRG1 Ball bearing 608-2RS/ })).toHaveAttribute(
      "aria-selected",
      "true"
    )

    await openLibrary(page)
    await page.getByRole("searchbox", { name: "Search components" }).fill("m3 nut")
    await list.getByRole("option", { name: /M3 nut/ }).click()
    await page.getByRole("button", { name: "Insert", exact: true }).click()
    await expect
      .poll(async () => (await components(page)).map((c) => c.designator))
      .toEqual(["BRG1", "H1"])

    await page.keyboard.press("Control+z")
    await expect
      .poll(async () => (await components(page)).map((c) => c.designator))
      .toEqual(["BRG1"])
    await page.keyboard.press("Control+y")
    await expect
      .poll(async () => (await components(page)).map((c) => c.designator))
      .toEqual(["BRG1", "H1"])
  })

  test("drag a card into the view: a ghost follows, the drop lands on the ground", async ({
    page,
  }) => {
    const list = await openLibrary(page)
    await page.getByRole("searchbox", { name: "Search components" }).fill("cube 20")
    const card = list.getByRole("option", { name: /Cube 20 mm/ })
    await expect(card).toBeVisible() // boundingBox() does not wait for the filtered list
    const from = await card.boundingBox()
    const view = await page.getByTestId("viewport-canvas").boundingBox()
    if (!from || !view) throw new Error("no boxes")
    const drop = await project(page, [0, 0, 0])
    await page.mouse.move(from.x + 20, from.y + 20)
    await page.mouse.down()
    await page.mouse.move(from.x + 60, from.y + 30, { steps: 4 })
    const chip = page.getByRole("status").filter({ hasText: "Cube 20 mm" })
    await expect(chip).toBeVisible()
    await page.mouse.move(drop.x, drop.y, { steps: 10 })
    await expect(chip).toContainText("Drop to insert")
    await page
      .getByTestId("viewport-canvas")
      .screenshot({ path: test.info().outputPath("ghost.png") })
    // Escape cancels: nothing inserted, the chip goes.
    await page.keyboard.press("Escape")
    await expect(chip).toBeHidden()
    await page.mouse.up()
    expect(await components(page)).toEqual([])

    await page.mouse.move(from.x + 20, from.y + 20)
    await page.mouse.down()
    await page.mouse.move(drop.x, drop.y, { steps: 12 })
    await expect(chip).toContainText("Drop to insert")
    await page.mouse.up()
    await expect.poll(() => components(page), { timeout: 20_000 }).toHaveLength(1)
    const [cube] = await components(page)
    // The 20 mm cube rests on the ground under the cursor: centre 10 mm up, near the origin.
    const at = cube?.positions.box ?? []
    expect(Math.abs((at[1] ?? 0) - 10)).toBeLessThan(1e-6)
    expect(Math.hypot(at[0] ?? 9, at[2] ?? 9)).toBeLessThan(3)
  })

  test("a component is picked whole, entered by double-click, edited and unlinked", async ({
    page,
  }) => {
    await openLibrary(page)
    const search = page.getByRole("searchbox", { name: "Search components" })
    await search.fill("m3 × 10 socket")
    await search.press("Enter") // the top result, at once
    await expect.poll(() => components(page), { timeout: 20_000 }).toHaveLength(1)
    const [screw] = await components(page)
    const panel = page.getByRole("complementary", { name: "Properties" })
    await expect(panel.getByRole("heading", { name: "Component H1" })).toBeVisible()

    // A click on the part in the 3D view selects the whole component; a double-click enters it.
    await page.getByRole("tab", { name: "Scene" }).click()
    await page.keyboard.press("Escape")
    const partId =
      (await page.evaluate(() => window.__STUDIOVD_VIEWPORT__?.parts() ?? []))[0]?.id ?? ""
    const at = await partCenter(page, partId)
    await page.mouse.click(at.x, at.y)
    await expect(panel.getByRole("heading", { name: "Component H1" })).toBeVisible()
    await page.mouse.dblclick(at.x, at.y)
    await expect(panel.getByRole("heading", { name: "Component H1" })).toBeHidden()
    await expect(panel.getByRole("heading", { name: "Part" })).toBeVisible()
    await page.mouse.click(5, 5) // outside: leaves the component
    await page.getByRole("treeitem", { name: /H1 Socket head cap screw/ }).click()

    // Edit parameters: 16 mm long, same keys.
    const form = panel.getByRole("form", { name: "Parameters" })
    await form.getByLabel("Length (mm)").fill("16")
    await form.getByRole("button", { name: "Apply" }).click()
    await expect
      .poll(async () => (await components(page))[0]?.name)
      .toBe("Socket head cap screw M3 × 16 (ISO 4762)")
    expect((await components(page))[0]?.parts).toEqual(screw?.parts)
    await page.keyboard.press("Control+z")
    await expect
      .poll(async () => (await components(page))[0]?.name)
      .toBe("Socket head cap screw M3 × 10 (ISO 4762)")

    await panel.getByRole("button", { name: "Unlink" }).click()
    await expect.poll(() => components(page)).toEqual([])
    expect(await page.evaluate(() => window.__STUDIOVD_VIEWPORT__?.parts().length)).toBe(1)
  })

  test("a screw dragged near a nut snaps onto it by their interface tags", async ({ page }) => {
    const list = await openLibrary(page)
    const search = page.getByRole("searchbox", { name: "Search components" })
    await search.fill("m5 nut")
    await search.press("Enter")
    await expect.poll(() => components(page), { timeout: 20_000 }).toHaveLength(1)
    const top = (await page.evaluate(() => window.__STUDIOVD_VIEWPORT__?.anchors() ?? [])).find(
      (a) => a.name === "Top face"
    )
    if (!top) throw new Error("no top anchor")
    const target = await page.evaluate(
      (id) => window.__STUDIOVD_VIEWPORT__?.anchorWorld(id) ?? null,
      top.id
    )
    if (!target) throw new Error("no anchor frame")
    const over = await project(page, target.originMm as [number, number, number])

    await search.fill("m5 × 14 socket")
    // The screw's card itself: right after typing, the list can still show the nut's results,
    // and boundingBox() does not wait for anything.
    const screw = list.getByRole("option").filter({ hasText: "M5 × 14" }).first()
    await expect(screw).toBeVisible()
    const card = await screw.boundingBox()
    if (!card) throw new Error("no card")
    await page.mouse.move(card.x + 20, card.y + 20)
    await page.mouse.down()
    await page.mouse.move(over.x + 3, over.y + 2, { steps: 12 })
    const chip = page.getByRole("status").filter({ hasText: "M5 × 14" })
    await expect(chip).toContainText("Snaps to M5-nut")
    await page.mouse.up()
    await expect.poll(() => components(page)).toHaveLength(2)
    const seat = (await page.evaluate(() => window.__STUDIOVD_VIEWPORT__?.anchors() ?? [])).find(
      (a) => a.name === "Under the head"
    )
    const world = await page.evaluate(
      (id) => window.__STUDIOVD_VIEWPORT__?.anchorWorld(id) ?? null,
      seat?.id ?? ""
    )
    expect(world?.originMm).toHaveLength(3)
    world?.originMm.forEach((v, i) =>
      expect(Math.abs(v - (target.originMm[i] ?? 0))).toBeLessThan(1e-6)
    )
  })

  test("Install from file: an unsigned pack is confirmed, then listed as Unverified", async ({
    page,
  }) => {
    const valid = readFileSync(
      "src/core/schema/testing/fixtures/library/component-asset.valid.json",
      "utf8"
    )
    const parsed = JSON.parse(valid) as { identity: { id: string; version: string; name: string } }
    const { id, version, name } = parsed.identity
    await page.evaluate(
      (m) => (window as unknown as { __E2E__: E2EBackend }).__E2E__.queuePack([m]),
      { id, version, manifest: valid }
    )
    const list = await openLibrary(page)
    await page.getByRole("button", { name: "Install components from a file…" }).click()
    const dialog = page.getByRole("dialog", { name: "Install components" })
    await expect(dialog).toContainText("Unverified")
    await expect(dialog.getByRole("list", { name: "Components in the pack" })).toContainText(name)
    await dialog.getByRole("button", { name: "Install" }).click()
    await expect(dialog).toBeHidden()
    await page.getByRole("combobox", { name: "Library source" }).click()
    await page.getByRole("option", { name: "Installed" }).click()
    await expect(list.getByRole("option", { name: new RegExp(name) })).toContainText("Unverified")
    expect(
      await page.evaluate(() => (window as unknown as { __E2E__: E2EBackend }).__E2E__.libraryIds())
    ).toEqual([`${id}@${version}`])
  })

  test("Install from file refuses a pack with an invalid component", async ({ page }) => {
    const bad = JSON.stringify({
      format: "studiovd-component",
      schemaVersion: 1,
      identity: { id: "official/thing" },
    })
    await page.evaluate(
      (m) => (window as unknown as { __E2E__: E2EBackend }).__E2E__.queuePack([m]),
      { id: "official/thing", version: "1.0.0", manifest: bad }
    )
    await openLibrary(page)
    await page.getByRole("button", { name: "Install components from a file…" }).click()
    const dialog = page.getByRole("dialog", { name: "Install components" })
    await expect(dialog).toContainText("cannot be installed")
    await expect(dialog.getByRole("button", { name: "Install" })).toBeDisabled()
    await dialog.getByRole("button", { name: "Cancel" }).click()
    await expect(dialog).toBeHidden()
  })
})
