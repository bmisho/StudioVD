import { degToRad } from "@/core/units"
import { useDocumentStore } from "@/store/document/documentStore"
import { bind, block, wire } from "./exampleKit"
import type { PedalParts } from "./pedalWiring"

/** The pot generator's rotation, end stop to end stop (its `turn` mate limits: ±150°). */
const SWEEP = 2 * degToRad(150)

/**
 * The pedal's LED circuit in the schematic: the 9 V battery across the Volume pot, its wiper
 * through 470 Ω into the LED. Turning the Volume knob (the pot's `turn` mate) sets the wiper:
 * clockwise seen from above (a negative angle about the shaft, which points up) turns it up,
 * so −150°…+150° maps onto 1…0. The LED's light comes back as its glow.
 */
export function pedalCircuit(p: PedalParts): void {
  const volume = p.pots[2]
  const turn = volume && Object.hasOwn(volume.mates, "turn") ? volume.mates.turn : undefined
  const lamp = Object.hasOwn(p.led.parts, "led") ? p.led.parts.led : undefined
  if (!turn || !lamp) throw new Error("The pedal is missing parts.")

  const bat = block("electrical.battery@1", 0, 0, { emf: 9 })
  const gnd = block("electrical.ground@1", 0, 192)
  const pot = block("electrical.potentiometer@1", 224, 0, { resistance: 10_000 })
  const res = block("electrical.resistor@1", 448, 0, { resistance: 470 })
  const led = block("electrical.led@1", 672, 0)
  useDocumentStore.getState().renameNode(pot, "Volume")
  wire(bat, "neg", gnd, "gnd")
  wire(bat, "pos", pot, "b")
  wire(pot, "a", gnd, "gnd")
  wire(pot, "wiper", res, "a")
  wire(res, "b", led, "anode")
  wire(led, "cathode", gnd, "gnd")
  bind({
    from: { kind: "mateCoordinate", mate: turn },
    to: { kind: "param", node: pot, param: "position" },
    scale: -1 / SWEEP,
    offset: 0.5,
    min: 0,
    max: 1,
  })
  bind({
    from: { kind: "output", node: led, port: "light", quantity: "value" },
    to: { kind: "glow", part: lamp, color: "red" },
    scale: 10, // 0.1 cd, the LED block's rated intensity, is full glow
    offset: 0,
  })
}
