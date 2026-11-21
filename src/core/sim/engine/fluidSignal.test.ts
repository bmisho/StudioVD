import { describe, expect, it } from "vitest"
import { restrictionFlow } from "./behaviours/fluid"
import { simulate } from "./simulate"
import { schematic } from "./testing"

// Known answers (PLAN 12.10): fluid power, signals and programs.

describe("fluid known answers", () => {
  it("a cylinder at 6 bar pushes F = p·A on its held rod", () => {
    const b = schematic()
    const src = b.block("fluid.pressureSource@1", { pressure: 6e5, medium: "air" })
    const cyl = b.block("fluid.cylinder@1", { bore: 0.016, rod: 0.006 })
    const frame = b.block("mechanical.groundTranslational@1")
    b.wire(src, "out", cyl, "portA")
    b.wire(cyl, "rod", frame, "frame")
    b.wire(cyl, "body", frame, "frame")
    const r = simulate(b.doc)
    const area = (Math.PI / 4) * 0.016 ** 2
    expect(r.converged).toBe(true)
    expect(r.ports[`${cyl}/rod`]?.flow).toBeCloseTo(-6e5 * area, 6) // ≈ 120.6 N into the rod
  })

  it("air through a restriction: choked below the critical ratio, zero at no difference", () => {
    const C = 1e-9 // m³/(s·Pa)
    const choked = restrictionFlow(C, "air", 6e5, 0) // 7 bar abs into 1 bar abs: ratio 0.14
    expect(choked).toBeCloseTo(C * (6e5 + 101_325) * 1.185, 12)
    expect(restrictionFlow(C, "air", 0, 6e5)).toBeCloseTo(-choked, 12)
    expect(restrictionFlow(C, "air", 1000, 1000)).toBe(0)
    // Liquids: linear in the pressure difference, ρ·C·Δp.
    expect(restrictionFlow(C, "water", 2e5, 0)).toBeCloseTo(998.2 * C * 2e5, 12)
  })
})

describe("signals", () => {
  it("evaluates in dependency order: constants into a comparator into a NOT", () => {
    const b = schematic()
    const a = b.block("data.constant@1", { value: 3 })
    const ref = b.block("data.constant@1", { value: 2 })
    const cmp = b.block("data.comparator@1")
    const not = b.block("data.not@1")
    const probe = b.block("data.probe@1")
    b.wire(not, "out", probe, "value") // wired "backwards" in creation order on purpose
    b.wire(cmp, "out", not, "a")
    b.wire(a, "out", cmp, "a")
    b.wire(ref, "out", cmp, "b")
    const r = simulate(b.doc)
    expect(r.signals[`${cmp}/out`]).toBe(true)
    expect(r.signals[`${not}/out`]).toBe(false)
    expect(r.signals[`${probe}/value`]).toBe(false)
  })

  it("an H-bridge at half duty puts half its supply across a motor", () => {
    const b = schematic()
    const bat = b.block("electrical.battery@1", { emf: 12, rInternal: 0 })
    const gnd = b.block("electrical.ground@1")
    const duty = b.block("data.constant@1", { value: 0.5 })
    const hb = b.block("driver.hBridge@1", { rOn: 0 })
    const load = b.block("electrical.resistor@1", { resistance: 10 })
    b.wire(bat, "neg", gnd, "gnd")
    b.wire(bat, "pos", hb, "vm")
    b.wire(hb, "gnd", gnd, "gnd")
    b.wire(duty, "out", hb, "in1")
    b.wire(hb, "out1", load, "a")
    b.wire(load, "b", hb, "out2")
    const r = simulate(b.doc)
    expect(r.ports[`${load}/a`]?.effort).toBeCloseTo(6, 8)
    // Averaged switching keeps power: 3.6 W out of the battery.
    expect(r.supplied).toBeCloseTo(3.6, 8)
  })

  it("a black box's program reads a terminal and sets an output and a current", () => {
    const b = schematic()
    const bat = b.block("electrical.battery@1", { emf: 5, rInternal: 0 })
    const gnd = b.block("electrical.ground@1")
    b.wire(bat, "neg", gnd, "gnd")
    const def = Object.values(b.doc.schematic.blockDefs)[0]
    if (!def) throw new Error("no def")
    const boxDef = {
      id: "00000000-0000-4000-8000-0000000000aa" as typeof def.id,
      name: "Sensor",
      ports: [
        {
          key: "vin",
          name: "Vin",
          domain: "electrical" as const,
          direction: "terminal" as const,
          unit: "V",
        },
        {
          key: "gnd",
          name: "GND",
          domain: "electrical" as const,
          direction: "terminal" as const,
          unit: "V",
        },
        {
          key: "high",
          name: "High",
          domain: "data" as const,
          direction: "out" as const,
          unit: "",
          payload: "bool" as const,
        },
      ],
      params: [],
    }
    b.doc.schematic.blockDefs[boxDef.id] = {
      ...boxDef,
      behaviour: "high = vin > 2.5\nI_vin = 0.12",
    }
    const box = "00000000-0000-4000-8000-0000000000ab" as keyof typeof b.doc.schematic.nodes
    b.doc.schematic.nodes[box] = {
      id: box,
      blockDefId: boxDef.id,
      position: { x: 0, y: 0 },
      label: "Sensor",
      paramValues: {},
    }
    b.wire(bat, "pos", box, "vin")
    b.wire(box, "gnd", gnd, "gnd")
    const r = simulate(b.doc)
    expect(r.signals[`${box}/high`]).toBe(true)
    expect(r.ports[`${box}/vin`]?.flow).toBeCloseTo(0.12, 12)
    expect(r.ports[`${box}/gnd`]?.flow).toBeCloseTo(-0.12, 12)
  })
})
