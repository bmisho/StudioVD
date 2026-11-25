import type { Locator, Page } from "@playwright/test"
import { expect, exportedFiles, test, type E2EWindow } from "./fixtures"

// Phase 11: the schematic editor, driven like a user would (PLAN 11.9).

async function addBlock(page: Page, name: string) {
  await page.getByRole("button", { name: "Add block" }).click()
  await page.getByRole("textbox", { name: "Search blocks" }).fill(name)
  await page.getByRole("listitem").filter({ hasText: name }).first().click()
}

const block = (page: Page, label: string) =>
  page.locator(".react-flow__node").filter({ hasText: label })
const port = (page: Page, label: string, key: string) =>
  block(page, label).locator(`[data-port="${key}"]`)

/** Drags a wire from one port to another with the mouse. */
async function wire(page: Page, from: Locator, to: Locator, release = true) {
  const [a, b] = [await from.boundingBox(), await to.boundingBox()]
  if (!a || !b) throw new Error("port not on screen")
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
  await page.mouse.down()
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 })
  if (release) await page.mouse.up()
}

test.beforeEach(async ({ page }) => {
  await page.getByRole("button", { name: "Maximize Schematic" }).click()
  await expect(page.getByTestId("schematic-editor")).toBeVisible()
})

test("adds blocks, wires them by the rules, deletes and undoes", async ({ page }) => {
  await addBlock(page, "Battery")
  await addBlock(page, "Resistor")
  await addBlock(page, "Probe")
  await expect(page.locator(".react-flow__node")).toHaveCount(3)

  await wire(page, port(page, "Battery 1", "pos"), port(page, "Resistor 1", "a"))
  await expect(page.locator(".react-flow__edge")).toHaveCount(1)

  // Electrical to data is refused, and the canvas says why while dragging.
  await wire(page, port(page, "Battery 1", "neg"), port(page, "Probe 1", "value"), false)
  await expect(page.getByRole("status").filter({ hasText: "one domain" })).toBeVisible()
  await page.mouse.up()
  await expect(page.locator(".react-flow__edge")).toHaveCount(1)

  // Deleting a block takes its wire; one undo brings both back.
  await block(page, "Resistor 1").click()
  await page.keyboard.press("Delete")
  await expect(page.locator(".react-flow__node")).toHaveCount(2)
  await expect(page.locator(".react-flow__edge")).toHaveCount(0)
  await page.keyboard.press("Control+z")
  await expect(page.locator(".react-flow__node")).toHaveCount(3)
  await expect(page.locator(".react-flow__edge")).toHaveCount(1)
})

test("dragging a block is one undo entry", async ({ page }) => {
  await addBlock(page, "Resistor")
  const node = block(page, "Resistor 1")
  // Its place on the canvas (React Flow's translate, in flow units), not on the screen: the
  // panels can still settle by a few pixels after Maximize, which moves the screen box only.
  const place = () => node.evaluate((el) => (el as HTMLElement).style.transform)
  const start = await place()
  const before = await node.boundingBox()
  if (!before) throw new Error("block not on screen")
  await page.mouse.move(before.x + 40, before.y + 12)
  await page.mouse.down()
  for (let i = 1; i <= 6; i++) await page.mouse.move(before.x + 40 + i * 20, before.y + 12 + i * 8)
  await page.mouse.up()
  await expect.poll(place).not.toBe(start)
  await page.keyboard.press("Control+z")
  await expect.poll(place).toBe(start)
  await expect(node).toHaveCount(1) // the add itself is the entry before
})

test("edits a parameter and a black box, and exports the schematic", async ({ page }) => {
  await addBlock(page, "Resistor")
  const props = page.getByRole("complementary", { name: "Properties" })
  const resistance = props.getByRole("textbox", { name: /Resistance/ })
  await resistance.fill("4.7k")
  await resistance.press("Enter")
  await expect(resistance).toHaveValue("4.7 k")

  await page.getByRole("button", { name: "Black box" }).click()
  await props.getByRole("button", { name: "Edit block…" }).click()
  const dialog = page.getByRole("dialog", { name: "Black box" })
  await dialog.getByRole("button", { name: "Add port" }).click()
  await dialog.getByRole("button", { name: "Add port" }).click()
  const second = dialog.getByRole("group", { name: "Port 2" })
  await second.getByRole("combobox", { name: "Direction" }).click()
  await page.getByRole("option", { name: "Out" }).click()
  await second.getByRole("textbox", { name: "Port key" }).fill("out")
  const behaviour = dialog.getByRole("textbox", { name: "Behaviour" })
  await behaviour.fill("out = in >")
  await expect(dialog.getByRole("status")).toContainText("Line 1")
  await behaviour.fill("out = in > 2 ? 1 : 0")
  await dialog.getByRole("button", { name: "Apply" }).click()
  await expect(dialog).toBeHidden()
  await expect(port(page, "Black box 1", "out")).toBeVisible()

  await page.getByRole("menuitem", { name: "File" }).click()
  await page.getByRole("menuitem", { name: "Export" }).click()
  await page.getByRole("menuitem", { name: "Schematic as SVG (.svg)…" }).click()
  await expect
    .poll(async () => (await exportedFiles(page)).map((f) => f.name))
    .toContain("Untitled schematic.svg")
  const svg = await page.evaluate(() =>
    (window as unknown as E2EWindow).__E2E__.exportText("Untitled schematic.svg")
  )
  expect(svg).toContain("<svg")
  expect(svg).toContain("Black box 1")
  expect(svg).toContain("Resistor 1")
})

test("a left drag on empty canvas selects blocks with a box; a middle drag pans (0.2.1)", async ({
  page,
}) => {
  await addBlock(page, "Battery")
  await addBlock(page, "Resistor")
  await expect(page.locator(".react-flow__node")).toHaveCount(2)
  await page.keyboard.press("Escape")
  const canvas = await page.getByTestId("schematic-editor").boundingBox()
  const boxes = [
    await block(page, "Battery 1").boundingBox(),
    await block(page, "Resistor 1").boundingBox(),
  ]
  if (!canvas || !boxes[0] || !boxes[1]) throw new Error("not on screen")
  const left = Math.min(...boxes.map((b) => b?.x ?? 0)) - 30
  const top = Math.min(...boxes.map((b) => b?.y ?? 0)) - 30
  const right = Math.max(...boxes.map((b) => (b?.x ?? 0) + (b?.width ?? 0))) + 30
  const bottom = Math.max(...boxes.map((b) => (b?.y ?? 0) + (b?.height ?? 0))) + 30
  await page.mouse.move(left, top)
  await page.mouse.down()
  await page.mouse.move(right, bottom, { steps: 10 })
  await page.mouse.up()
  await expect(page.locator(".react-flow__node.selected")).toHaveCount(2)

  const view = () =>
    page.locator(".react-flow__viewport").evaluate((el) => (el as HTMLElement).style.transform)
  const before = await view()
  // Bottom middle: clear of the blocks, the zoom controls (left) and the overview (right).
  const from = { x: canvas.x + canvas.width / 2, y: canvas.y + canvas.height - 40 }
  await page.mouse.move(from.x, from.y)
  await page.mouse.down({ button: "middle" })
  await page.mouse.move(from.x - 100, from.y - 40, { steps: 8 })
  await page.mouse.up({ button: "middle" })
  await expect.poll(view).not.toBe(before)
  await expect(page.locator(".react-flow__node.selected")).toHaveCount(2) // panning keeps it
})
