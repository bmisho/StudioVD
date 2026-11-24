import type { Page } from "@playwright/test"
import { expect, exportedFiles, test, type E2EWindow } from "./fixtures"
import { project, waitForViewport } from "./viewportHelpers"

// PLAN 9.6: a GT2 belt drawn round two pulleys from their belt-line anchors.
test.use({ contextOptions: { reducedMotion: "reduce" } })

const probe = <T>(page: Page, fn: string, arg?: unknown) =>
  page.evaluate(
    ([f, a]) =>
      (window.__STUDIOVD_VIEWPORT__ as unknown as Record<string, (x?: unknown) => unknown>)[f]?.(a),
    [fn, arg] as const
  ) as Promise<T>

async function dragCardTo(page: Page, query: string, point: [number, number, number]) {
  await page.getByRole("searchbox", { name: "Search components" }).fill(query)
  const option = page.getByRole("listbox", { name: "Components" }).getByRole("option").first()
  await expect(option).toBeVisible() // boundingBox() does not wait for the filtered list
  const card = await option.boundingBox()
  if (!card) throw new Error("no card")
  const to = await project(page, point)
  await page.mouse.move(card.x + 20, card.y + 20)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 12 })
  await expect(page.getByRole("status").filter({ hasText: "Drop to insert" })).toBeVisible()
  await page.mouse.up()
}

const anchorPoint = async (page: Page, id: string) => {
  const world = await probe<{ originMm: [number, number, number] } | null>(page, "anchorWorld", id)
  if (!world) throw new Error("no anchor")
  return project(page, world.originMm)
}

/**
 * Two GT2 pulleys from the Library and their two belt-line anchors selected (the anchors'
 * Properties then offer belts, tubes, springs and cables between them).
 */
async function twoBeltAnchorsSelected(page: Page) {
  await waitForViewport(page)
  await page.getByRole("tab", { name: "Library" }).click()
  await dragCardTo(page, "20 teeth bore 5", [-30, 0, 0])
  await expect.poll(() => probe<unknown[]>(page, "components"), { timeout: 20_000 }).toHaveLength(1)
  await dragCardTo(page, "36 teeth bore 8", [30, 0, 0])
  await expect.poll(() => probe<unknown[]>(page, "components")).toHaveLength(2)
  await page.keyboard.press("Escape")
  await page.getByTestId("viewport-canvas").click({ position: { x: 5, y: 5 } })
  await page.keyboard.press("f") // fit: the pulleys large enough to pick their anchors apart
  await page.waitForTimeout(300)

  const anchors = await probe<{ id: string; name: string | null; partId: string }[]>(
    page,
    "anchors"
  )
  const belts = anchors.filter((a) => a.name === "Belt line")
  expect(belts).toHaveLength(2)
  const [a, b] = belts as [(typeof belts)[0], (typeof belts)[0]]
  const partAt = (id: string) => probe<{ x: number; y: number } | null>(page, "projectPart", id)

  // Select the first pulley, then its belt anchor; add the second pulley, its anchor, and
  // take the second pulley out again: two anchors selected.
  let p = await partAt(a.partId)
  if (!p) throw new Error("pulley off screen")
  await page.mouse.click(p.x, p.y + 25)
  let at = await anchorPoint(page, a.id)
  await page.mouse.click(at.x, at.y)
  p = await partAt(b.partId)
  if (!p) throw new Error("pulley off screen")
  await page.keyboard.down("Control")
  await page.mouse.click(p.x, p.y + 25)
  at = await anchorPoint(page, b.id)
  await page.mouse.click(at.x, at.y)
  await page.mouse.click(p.x, p.y + 25)
  await page.keyboard.up("Control")

  const panel = page.getByRole("complementary", { name: "Properties" })
  await expect(panel.getByRole("heading", { name: "Connect 2 anchors" })).toBeVisible()
  return { panel, a, b }
}

test("a belt round two pulleys, from their belt-line anchors", async ({ page }) => {
  test.setTimeout(90_000)
  const { panel, a, b } = await twoBeltAnchorsSelected(page)
  await panel.getByRole("button", { name: "Belt" }).click()
  await expect
    .poll(() => probe<{ kind: string; ends: string[] }[]>(page, "connectors"))
    .toEqual([
      expect.objectContaining({
        kind: "belt",
        ends: expect.arrayContaining([a.id, b.id]),
      }),
    ])
  await expect(panel.getByRole("heading", { name: "Belt" })).toBeVisible()
  await page.getByRole("tab", { name: "Scene" }).click()
  await expect(page.getByRole("treeitem", { name: /Connectors/ })).toBeVisible()
  await page.getByTestId("viewport-canvas").screenshot({ path: test.info().outputPath("belt.png") })
  await page.keyboard.press("Control+z")
  await expect.poll(() => probe<unknown[]>(page, "connectors")).toEqual([])
})

test("a cable of a set length between two lugs: spare, too short, undo (PLAN 16.3)", async ({
  page,
}) => {
  test.setTimeout(90_000)
  const { panel } = await twoBeltAnchorsSelected(page)
  await panel.getByRole("button", { name: "Cable" }).click()
  await expect(panel.getByRole("heading", { name: "Cable" })).toBeVisible()
  await expect(panel.getByText(/^Route [\d.]+ mm, [\d.]+ mm spare\.$/)).toBeVisible()
  const length = panel.getByRole("textbox", { name: "Length (mm)" })
  await length.fill("5")
  await length.press("Enter")
  await expect(panel.getByRole("alert")).toContainText("Too short by")
  await expect
    .poll(() => probe<{ kind: string; lengthMm?: number }[]>(page, "connectors"))
    .toEqual([expect.objectContaining({ kind: "cable", lengthMm: 5 })])
  await panel.getByRole("button", { name: "Fit to route + 10%" }).click()
  await expect(panel.getByRole("alert")).toBeHidden()
  // Red insulation (one shared "Wire (red)" material) and a 22 AWG hook-up wire size.
  await panel.getByRole("button", { name: "Red" }).click()
  await expect(panel.getByRole("button", { name: "Red" })).toHaveAttribute("aria-pressed", "true")
  await panel.getByRole("combobox", { name: "Hook-up wire size" }).click()
  await page.getByRole("option", { name: "22 AWG (Ø1.46 mm)" }).click()
  await expect(panel.getByRole("textbox", { name: "Diameter (mm)" })).toHaveValue("1.46")
  // Through a clip (PLAN 16.7): one from the Library in front, its cable anchor added as a
  // waypoint. The route grows past the cut length (warned) until it is fitted again.
  await page.getByRole("tab", { name: "Library" }).click()
  await dragCardTo(page, "Cable clip for Ø2", [0, 0, 25])
  await expect.poll(() => probe<unknown[]>(page, "components")).toHaveLength(3)
  await page.getByRole("tab", { name: "Scene" }).click()
  await page.getByRole("treeitem", { name: /^Cable/ }).click()
  await panel.getByRole("combobox", { name: "Add waypoint" }).click()
  await page.getByRole("option", { name: /^Clip · Cable through$/ }).click()
  await expect(panel.getByRole("region", { name: "Waypoints" })).toContainText(
    "1. Clip · Cable through"
  )
  await expect(panel.getByRole("alert")).toContainText("Too short by")
  await panel.getByRole("button", { name: "Fit to route + 10%" }).click()
  await expect(panel.getByRole("alert")).toBeHidden()
  await page
    .getByTestId("viewport-canvas")
    .screenshot({ path: test.info().outputPath("cable.png") })
  // The cut list: its colour, size and length, as CSV.
  await page.getByRole("menuitem", { name: "File" }).click()
  await page.getByRole("menuitem", { name: "Export" }).click()
  await page.getByRole("menuitem", { name: "Cable Cut List (.csv)…" }).click()
  await expect
    .poll(async () => (await exportedFiles(page)).map((f) => f.name))
    .toContain("Untitled cut list.csv")
  const csv = await page.evaluate(() =>
    (window as unknown as E2EWindow).__E2E__.exportText("Untitled cut list.csv")
  )
  expect(csv).toMatch(
    /^Cable,Colour,Diameter \(mm\),Wires,Length \(mm\),Waypoints,Note\r\nCable,Wire \(red\),1\.46,1,\d+,1,\r\n$/
  )
  // Eight undo steps: fit, waypoint, clip, size, colour, fit, the length typed, the cable.
  for (let i = 0; i < 8; i++) await page.keyboard.press("Control+z")
  await expect.poll(() => probe<unknown[]>(page, "connectors")).toEqual([])
})
