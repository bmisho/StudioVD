import { describe, expect, it } from "vitest"
import { BlockDefSchema, newId, type BlockDefId } from "@/core/schema"
import { blockDefOf, findModel, modelKey, MODELS } from "./registry"

describe("the built-in block library (PLAN 11.3)", () => {
  it("every model is a valid block definition, with a unique id", () => {
    expect(new Set(MODELS.map(modelKey)).size).toBe(MODELS.length)
    for (const m of MODELS) {
      const parsed = BlockDefSchema.safeParse(blockDefOf(m, newId<BlockDefId>()))
      expect(parsed.success, `${modelKey(m)}: ${parsed.error?.message ?? ""}`).toBe(true)
    }
  })

  it("holds what the plan lists, one or more per kind", () => {
    const ids = MODELS.map((m) => m.id)
    for (const id of [
      "electrical.battery",
      "electrical.ground",
      "electrical.resistor",
      "electrical.led",
      "electrical.relay",
      "electromech.dcMotor",
      "electromech.servo",
      "electromech.stepper",
      "driver.hBridge",
      "driver.stepper",
      "mechanical.gear",
      "mechanical.leadScrew",
      "fluid.cylinder",
      "light.sensor",
      "data.logic",
      "mcu.arduinoUno",
      "mcu.pico",
    ])
      expect(ids).toContain(id)
    expect(MODELS.length).toBeGreaterThanOrEqual(40)
  })

  it("defaults standing in for datasheet values say so, and sit within their bounds", () => {
    const vf = findModel("electrical.led@1")?.params.find((p) => p.key === "vf")
    expect(vf?.source).toMatchObject({ kind: "estimated", confidence: "low" })
    for (const m of MODELS)
      for (const p of m.params)
        if (p.kind === "number" && typeof p.default === "number") {
          if (p.min !== undefined)
            expect(p.default, `${m.id}.${p.key}`).toBeGreaterThanOrEqual(p.min)
          if (p.max !== undefined) expect(p.default, `${m.id}.${p.key}`).toBeLessThanOrEqual(p.max)
        }
  })

  it("mechanical ports name a reference the block has", () => {
    for (const m of MODELS)
      for (const p of m.ports)
        if (p.reference)
          expect(
            m.ports.map((x) => x.key),
            `${m.id}.${p.key}`
          ).toContain(p.reference)
  })
})
