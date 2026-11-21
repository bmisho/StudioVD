import { conductance, effortSource, twoTerminal } from "../stampKit"
import { num, type Behaviour, type Instance } from "../types"
import { junction } from "./junction"

// Electrical blocks (PLAN 11.3, 12.3): steady state, so capacitors are open and inductors are
// their winding resistance.

/** Below this a resistance is an ideal short (a branch, not a huge conductance). */
const SHORT = 1e-9

export const rated = (what: string, value: number, unit: string, limit: number) =>
  `${what} ${value.toPrecision(3)} ${unit} is over its ${limit.toPrecision(3)} ${unit} rating.`

/** A source behind a resistance (Norton), or ideal when the resistance is 0. */
const theveninBranches = (c: Instance) => (num(c, "rInternal") > SHORT ? 0 : 1)

const battery: Behaviour = {
  branches: theveninBranches,
  stamp: (s, c) => {
    const [emf, r] = [num(c, "emf"), num(c, "rInternal")]
    if (r > SHORT) {
      const v = s.e("pos") - s.e("neg")
      twoTerminal(s, "pos", "neg", (v - emf) / r, 1 / r)
    } else effortSource(s, "pos", "neg", emf, 0)
  },
}

/** A bench supply: a voltage until its current limit, then that current (state `limited`). */
const supply: Behaviour = {
  branches: () => 1,
  stamp: (s, c) => {
    const i = s.x(0)
    s.flow("pos", i, [[{ branch: 0 }, 1]])
    s.flow("neg", -i, [[{ branch: 0 }, -1]])
    if (c.state.limited === true) s.equation(0, i + num(c, "currentLimit"), [[{ branch: 0 }, 1]])
    else
      s.equation(0, s.e("pos") - s.e("neg") - num(c, "voltage"), [
        [{ port: "pos" }, 1],
        [{ port: "neg" }, -1],
      ])
  },
  settle: (c, r) => {
    const delivered = -r.x(0)
    const v = r.e("pos") - r.e("neg")
    const limited = c.state.limited === true
    const next = limited ? v < num(c, "voltage") : delivered > num(c, "currentLimit") * (1 + 1e-9)
    c.state.limited = next
    return next !== limited
  },
  check: (c) =>
    c.state.limited === true
      ? [
          {
            code: "current-limit",
            severity: "info",
            message: `${c.label} is at its current limit.`,
          },
        ]
      : [],
}

const resistor: Behaviour = {
  stamp: (s, c) => conductance(s, "a", "b", 1 / Math.max(num(c, "resistance"), SHORT)),
  check: (c, r) => {
    const p = (r.e("a") - r.e("b")) * r.flow("a")
    const rating = num(c, "powerRating")
    return rating > 0 && p > rating
      ? [
          {
            code: "rating",
            severity: "warning",
            message: `${c.label}: ${rated("power", p, "W", rating)}`,
          },
        ]
      : []
  },
}

const capacitor: Behaviour = {
  check: (c, r) => {
    const v = Math.abs(r.e("a") - r.e("b"))
    const rating = num(c, "voltageRating")
    return rating > 0 && v > rating
      ? [
          {
            code: "rating",
            severity: "warning",
            message: `${c.label}: ${rated("voltage", v, "V", rating)}`,
          },
        ]
      : []
  },
}

const inductor: Behaviour = {
  branches: (c) => (num(c, "resistance") > SHORT ? 0 : 1),
  stamp: (s, c) => {
    const r = num(c, "resistance")
    if (r > SHORT) conductance(s, "a", "b", 1 / r)
    else effortSource(s, "a", "b", 0, 0)
  },
}

const potentiometer: Behaviour = {
  stamp: (s, c) => {
    const p = Math.min(1, Math.max(0, num(c, "position")))
    // A log (audio) taper is 10 % at mid travel: (10^(2p) − 1) / 99.
    const t = c.params.taper === "log" ? (10 ** (2 * p) - 1) / 99 : p
    const total = num(c, "resistance")
    conductance(s, "a", "wiper", 1 / Math.max(total * t, 1e-3))
    conductance(s, "wiper", "b", 1 / Math.max(total * (1 - t), 1e-3))
  },
}

const diode: Behaviour = {
  stamp: (s, c) => {
    const { i, g } = junction(num(c, "vf"), num(c, "ifRated"), s.e("anode") - s.e("cathode"))
    twoTerminal(s, "anode", "cathode", i, g)
  },
}

const led: Behaviour = {
  ...diode,
  evaluate: (c, r) => {
    const { i } = junction(num(c, "vf"), num(c, "ifRated"), r.e("anode") - r.e("cathode"))
    return { light: (num(c, "intensity") * Math.max(0, i)) / num(c, "ifRated") }
  },
  check: (c, r) => {
    const { i } = junction(num(c, "vf"), num(c, "ifRated"), r.e("anode") - r.e("cathode"))
    const max = num(c, "ifMax")
    return i > max
      ? [
          {
            code: "rating",
            severity: "warning",
            message: `${c.label}: ${rated("current", i, "A", max)}`,
          },
        ]
      : []
  },
}

const voltmeter: Behaviour = {
  evaluate: (_c, r) => ({ reading: r.e("pos") - r.e("neg") }),
}

const ammeter: Behaviour = {
  branches: () => 1,
  stamp: (s) => effortSource(s, "a", "b", 0, 0),
  evaluate: (_c, r) => ({ reading: r.x(0) }),
}

export const ELECTRICAL_BEHAVIOURS: Readonly<Record<string, Behaviour>> = {
  "electrical.battery": battery,
  "electrical.supply": supply,
  "electrical.ground": { grounds: ["gnd"] },
  "electrical.resistor": resistor,
  "electrical.capacitor": capacitor,
  "electrical.inductor": inductor,
  "electrical.potentiometer": potentiometer,
  "electrical.led": led,
  "electrical.diode": diode,
  "electrical.voltmeter": voltmeter,
  "electrical.ammeter": ammeter,
}
