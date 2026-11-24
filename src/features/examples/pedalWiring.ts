import type { WireColourKey } from "@/core/connectors/wireSpecs"
import type { AnchorId } from "@/core/schema"
import { at, cable, type Placed } from "./componentKit"

/** The guitar pedal's placed components (PLAN 16.6). */
export interface PedalParts {
  pots: readonly Placed[] // Gain, Tone, Volume
  input: Placed
  output: Placed
  dc: Placed
  footswitch: Placed
  led: Placed
  battery: Placed
  board: Placed
  clips: readonly Placed[] // on the front wall: right, left
}

type Lay = "arc" | "wave" | "coil"
interface Run {
  name: string
  route: readonly AnchorId[]
  colour: WireColourKey
  slack?: number
  lay?: Lay
  pair?: boolean
}

/**
 * The pedal's wiring: a true-bypass 3PDT (pole A switches the output, B the input, C the
 * LED), the battery's negative through the input jack's switch lug, DC and battery into the
 * board, and the Volume pot on the board. Each cable is cut longer than its route (25 % by
 * default), and the spare is laid as the cable says: arcs, a wave, or a coil.
 */
export function wirePedal(p: PedalParts): void {
  const [, , volume] = p.pots
  const [right, left] = p.clips
  if (!volume || !right || !left) throw new Error("The pedal is missing parts.")
  const fs = (n: number) => at(p.footswitch, `lug${n}`)
  const pad = (n: number) => at(p.board, `pad${n}`)
  const through = (c: Placed) => at(c, "cable")
  const runs: Run[] = [
    {
      name: "Input",
      route: [at(p.input, "lug1"), through(right), fs(5)],
      colour: "yellow",
      slack: 1.1,
    },
    {
      name: "Output",
      route: [fs(2), through(left), at(p.output, "lug1")],
      colour: "orange",
      slack: 1.1,
      pair: true,
    },
    { name: "Effect in", route: [fs(6), pad(5)], colour: "white", lay: "wave" },
    { name: "Effect out", route: [pad(6), fs(3)], colour: "grey", slack: 1.15 },
    { name: "LED +", route: [pad(7), at(p.led, "anode")], colour: "red" },
    { name: "LED −", route: [at(p.led, "cathode"), fs(7)], colour: "black" },
    {
      name: "Battery +",
      route: [at(p.battery, "red"), pad(8)],
      colour: "red",
      slack: 1.8,
      lay: "coil",
    },
    {
      name: "Battery −",
      route: [at(p.battery, "black"), at(p.input, "lug3")],
      colour: "black",
      slack: 1.15,
    },
    { name: "DC 9 V", route: [at(p.dc, "lug2"), pad(3)], colour: "red", slack: 1.08 },
    { name: "DC ground", route: [at(p.dc, "lug1"), pad(4)], colour: "black", slack: 1.08 },
    { name: "Volume CCW", route: [at(volume, "lug1"), pad(2)], colour: "brown", slack: 1.05 },
    { name: "Volume wiper", route: [at(volume, "lug2"), pad(1)], colour: "green", slack: 1.05 },
  ]
  for (const r of runs) cable(r.name, r.route, r.colour, r.slack, r.lay, r.pair)
}
