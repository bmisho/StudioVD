import type { Locator, Page } from "@playwright/test"
import { expect, test } from "./fixtures"

// Phase 12: the solver runs in its worker as the schematic changes (PLAN 12.8, 12.9).

async function addBlock(page: Page, name: string) {
  await page.getByRole("button", { name: "Add block" }).click()
  await page.getByRole("textbox", { name: "Search blocks" }).fill(name)
  await page
    .getByRole("listitem")
    .filter({ hasText: new RegExp(`^${name}$`) })
    .first()
    .click()
}

const block = (page: Page, label: string) =>
  page.locator(".react-flow__node").filter({ hasText: label })
const port = (page: Page, label: string, key: string) =>
  block(page, label).locator(`[data-port="${key}"]`)

async function wire(page: Page, from: Locator, to: Locator) {
  const [a, b] = [await from.boundingBox(), await to.boundingBox()]
  if (!a || !b) throw new Error("port not on screen")
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
  await page.mouse.down()
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 })
  await page.mouse.up()
}

test("a battery, a resistor and a voltmeter solve as they are wired", async ({ page }) => {
  await page.getByRole("button", { name: "Maximize Schematic" }).click()
  const status = page.getByRole("contentinfo", { name: "Status bar" })
  for (const name of ["Battery", "Resistor", "Ground", "Voltmeter"]) await addBlock(page, name)
  await wire(page, port(page, "Battery 1", "pos"), port(page, "Resistor 1", "a"))
  await wire(page, port(page, "Resistor 1", "b"), port(page, "Ground 1", "gnd"))
  await wire(page, port(page, "Battery 1", "neg"), port(page, "Ground 1", "gnd"))
  await wire(page, port(page, "Voltmeter 1", "pos"), port(page, "Resistor 1", "a"))
  await wire(page, port(page, "Voltmeter 1", "neg"), port(page, "Ground 1", "gnd"))
  // 9 V behind 1 Ω into 1 kΩ: 9·1000/1001 V.
  const reading = block(page, "Voltmeter 1").getByTestId("block-readout")
  await expect(reading).toHaveText("8.991 V")
  await expect(status).toContainText("Solved")
  await expect(page.locator("[data-flow]").first()).toBeAttached() // current animates

  // A parameter edit solves again.
  await block(page, "Resistor 1").click()
  const props = page.getByRole("complementary", { name: "Properties" })
  const resistance = props.getByRole("textbox", { name: /Resistance/ })
  await resistance.fill("1")
  await resistance.press("Enter")
  await expect(reading).toHaveText("4.5 V")
  await expect(props.getByRole("region", { name: "Operating point" })).toContainText("4.5 A")

  // The 1 Ω resistor now takes 20 W over its 0.25 W rating: a warning, listed in Results.
  await expect(status).toContainText("warnings")
  await page.getByRole("button", { name: "Results" }).click()
  await expect(page.getByRole("list", { name: "Findings" })).toContainText("rating")
  // The battery supplies, the resistor uses: no negative power (0.2.2).
  const table = page.getByRole("table", { name: "Power by block" })
  const cells = (name: string) =>
    table.getByRole("row", { name: new RegExp(name) }).getByRole("cell")
  await expect(cells("Battery 1")).toHaveText(["Battery 1", /\d W$/, ""])
  await expect(cells("Resistor 1")).toHaveText(["Resistor 1", "", /\d W$/])
  await expect(table).not.toContainText(/[-\u2212]/)
})

test("a circuit without ground says what to add", async ({ page }) => {
  await page.getByRole("button", { name: "Maximize Schematic" }).click()
  await addBlock(page, "Battery")
  await addBlock(page, "Resistor")
  await wire(page, port(page, "Battery 1", "pos"), port(page, "Resistor 1", "a"))
  await wire(page, port(page, "Resistor 1", "b"), port(page, "Battery 1", "neg"))
  await expect(page.getByRole("contentinfo", { name: "Status bar" })).toContainText("Errors")
  await page.getByRole("button", { name: "Results" }).click()
  await expect(page.getByRole("list", { name: "Findings" })).toContainText("add a Ground block")
})
