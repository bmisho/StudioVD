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
  ties: readonly Placed[] // zip ties on mounts on the front wall: right, left
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
 * board, and the three pots on the board. Each cable is cut a little longer than its route and
 * the spare laid in gentle arcs (0.2.2: waves and coils looked unreal and dipped into parts).
 */
export function wirePedal(p: PedalParts): void {
  const [gain, tone, volume] = p.pots
  const [right, left] = p.ties
  if (!gain || !tone || !volume || !right || !left) throw new Error("The pedal is missing parts.")
  const fs = (n: number) => at(p.footswitch, `lug${n}`)
  const pad = (n: number) => at(p.board, `pad${n}`)
  const through = (c: Placed) => at(c, "cable")
  const runs: Run[] = [
    { name: "Input", route: [at(p.input, "lug1"), through(right), fs(5)], colour: "yellow" },
    {
      name: "Output",
      route: [fs(2), through(left), at(p.output, "lug1")],
      colour: "orange",
      pair: true,
    },
    { name: "Effect in", route: [fs(6), pad(5)], colour: "white" },
    { name: "Effect out", route: [pad(6), fs(3)], colour: "grey" },
    { name: "LED +", route: [pad(7), at(p.led, "anode")], colour: "red" },
    { name: "LED −", route: [at(p.led, "cathode"), fs(7)], colour: "black" },
    { name: "Battery +", route: [at(p.battery, "red"), pad(8)], colour: "red", slack: 1.1 },
    { name: "Battery −", route: [at(p.battery, "black"), at(p.input, "lug3")], colour: "black" },
    { name: "DC 9 V", route: [at(p.dc, "lug2"), pad(3)], colour: "red" },
    { name: "DC ground", route: [at(p.dc, "lug1"), pad(4)], colour: "black" },
    { name: "Volume CCW", route: [at(volume, "lug1"), pad(2)], colour: "brown" },
    { name: "Volume wiper", route: [at(volume, "lug2"), pad(1)], colour: "green" },
    { name: "Tone CCW", route: [at(tone, "lug1"), pad(9)], colour: "brown" },
    { name: "Tone wiper", route: [at(tone, "lug2"), pad(10)], colour: "green" },
    { name: "Gain CCW", route: [at(gain, "lug1"), pad(11)], colour: "brown" },
    { name: "Gain wiper", route: [at(gain, "lug2"), pad(12)], colour: "green" },
  ]
  for (const r of runs) cable(r.name, r.route, r.colour, r.slack ?? 1.05, r.lay, r.pair)
}
