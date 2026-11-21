import { describe, expect, it } from "vitest"
import { simulate } from "./simulate"
import { schematic } from "./testing"

// A board in a circuit (PLAN 11.5, 12.5): a voltage read as counts, a program deciding, a pin
// driving an LED, all in one coupled solve.

function rig(position: number) {
  const b = schematic()
  const bat = b.block("electrical.battery@1", { emf: 5, rInternal: 0 })
  const gnd = b.block("electrical.ground@1")
  const pot = b.block("electrical.potentiometer@1", { position })
  const adc = b.block("data.analogInput@1")
  const uno = b.block("mcu.arduinoUno@1")
  const pin = b.block("data.pinOutput@1")
  const res = b.block("electrical.resistor@1", { resistance: 150 })
  const led = b.block("electrical.led@1")
  b.wire(bat, "neg", gnd, "gnd")
  // Position is measured from A: A on ground, B on 5 V, so the wiper reads position × 5 V.
  b.wire(pot, "a", gnd, "gnd")
  b.wire(bat, "pos", pot, "b")
  b.wire(pot, "wiper", adc, "in")
  b.wire(adc, "gnd", gnd, "gnd")
  b.wire(adc, "counts", uno, "A0")
  b.wire(uno, "D13", pin, "level")
  b.wire(pin, "gnd", gnd, "gnd")
  b.wire(pin, "out", res, "a")
  b.wire(res, "b", led, "anode")
  b.wire(led, "cathode", gnd, "gnd")
  const def = b.doc.schematic.blockDefs[b.doc.schematic.nodes[uno]?.blockDefId ?? ("" as never)]
  if (def) def.behaviour = "D13 = A0 > 512 ? 1 : 0"
  return { r: simulate(b.doc), adc, uno, led }
}

describe("a board in the loop", () => {
  it("lights the LED once the wiper passes half way", () => {
    const low = rig(0.3)
    expect(low.r.signals[`${low.adc}/counts`]).toBe(Math.round(0.3 * 1023))
    expect(low.r.signals[`${low.uno}/D13`]).toBe(0)
    expect(low.r.ports[`${low.led}/anode`]?.flow ?? 1).toBeLessThan(1e-6)
    const high = rig(0.7)
    expect(high.r.signals[`${high.uno}/D13`]).toBe(1)
    // 5 V behind 25 Ω + 150 Ω into a red LED: about (5 − 2)/175 A.
    expect(high.r.ports[`${high.led}/anode`]?.flow).toBeGreaterThan(0.015)
    expect(high.r.diagnostics).toEqual([])
  })
})
