import type { MateId, NodeId } from "@/core/schema"
import { degToRad } from "@/core/units"
import { useDocumentStore } from "@/store/document/documentStore"
import type { Placed } from "./componentKit"
import { bind, block, wire } from "./exampleKit"
import type { PedalParts } from "./pedalWiring"

/** The pot generator's rotation, end stop to end stop (its `turn` mate limits: ±150°). */
const SWEEP = 2 * degToRad(150)
/** The footswitch's plunger counts as pressed past 1 mm (its `press` slide, in metres). */
const PRESSED_PAST_M = 0.001

const mateOf = (p: Placed, key: string): MateId => {
  const id = Object.hasOwn(p.mates, key) ? p.mates[key] : undefined
  if (!id) throw new Error(`The pedal is missing its ${key} mate.`)
  return id
}

/** A row of blocks 288 apart (room for two wires between them); the second row below. */
const COLUMN = 288
const ROW = 176

/**
 * The pedal's indicator circuit in the schematic (a toy: a steady-state solve cannot play
 * audio): the 9 V battery through the latching footswitch into Volume, a divider, then Gain
 * and Tone as variable resistors, 330 Ω and the LED. Each knob turned clockwise (seen from
 * above: a negative angle about the shaft, which points up) brightens the LED; each stamp on
 * the footswitch turns it on or off. A ground at each place one is needed keeps every net
 * on its own lines (0.2.2: shared segments read as one connection).
 */
export function pedalCircuit(p: PedalParts): void {
  const lamp = Object.hasOwn(p.led.parts, "led") ? p.led.parts.led : undefined
  if (!lamp) throw new Error("The pedal is missing its LED.")

  const latch = block("electrical.latchingSwitch@1", 0, 0)
  const bat = block("electrical.battery@1", 0, ROW, { emf: 9 })
  const gndBat = block("electrical.ground@1", COLUMN / 2, 2 * ROW)
  const rename = (id: NodeId, name: string) => useDocumentStore.getState().renameNode(id, name)
  rename(latch, "Footswitch")
  let previous: { node: NodeId; port: string } = { node: latch, port: "b" }
  // Volume divides the supply (its far end grounded); Gain and Tone trim the LED's current.
  const pots = [
    { name: "Volume", pot: p.pots[2], ohms: 10_000 },
    { name: "Gain", pot: p.pots[0], ohms: 1000 },
    { name: "Tone", pot: p.pots[1], ohms: 1000 },
  ]
  for (const [i, { name, pot, ohms }] of pots.entries()) {
    if (!pot) throw new Error(`The pedal is missing its ${name} pot.`)
    const node = block("electrical.potentiometer@1", (i + 1) * COLUMN, 0, { resistance: ohms })
    rename(node, name)
    wire(previous.node, previous.port, node, "a")
    if (i === 0) wire(node, "b", block("electrical.ground@1", 1.5 * COLUMN, ROW), "gnd")
    previous = { node, port: "wiper" }
    bind({
      from: { kind: "mateCoordinate", mate: mateOf(pot, "turn") },
      to: { kind: "param", node, param: "position" },
      scale: 1 / SWEEP,
      offset: 0.5,
      min: 0,
      max: 1,
    })
  }
  const res = block("electrical.resistor@1", 4 * COLUMN, 0, { resistance: 330 })
  const led = block("electrical.led@1", 5 * COLUMN, 0)
  const gndLed = block("electrical.ground@1", 5.5 * COLUMN, ROW)
  wire(previous.node, previous.port, res, "a")
  wire(res, "b", led, "anode")
  wire(led, "cathode", gndLed, "gnd")
  wire(bat, "pos", latch, "a")
  wire(bat, "neg", gndBat, "gnd")

  bind({
    from: { kind: "mateCoordinate", mate: mateOf(p.footswitch, "press") },
    to: { kind: "input", node: latch, port: "press" },
    scale: -0.5 / PRESSED_PAST_M,
    offset: 0,
    min: 0,
    max: 1,
  })
  bind({
    from: { kind: "output", node: led, port: "light", quantity: "value" },
    to: { kind: "glow", part: lamp, color: "red" },
    scale: 60, // about 17 mcd is full glow: the knobs at their centres light it about a fifth
    offset: 0,
  })
}
