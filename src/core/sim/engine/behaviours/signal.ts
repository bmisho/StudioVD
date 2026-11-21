import { sigmoid, sigmoidSlope, twoTerminal } from "../stampKit"
import { asBool, asNumber, num, type Behaviour } from "../types"

// Light and data blocks (PLAN 11.3, §3): signals go from an output to inputs. Light values
// are luminous intensity (cd) out of emitters; a sensor reads illuminance (lx), which is the
// intensity over the distance squared: 1 m until 3D supplies the distance (Phase 13).

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

const emitter: Behaviour = {
  evaluate: (c, r) => {
    const level = r.input("level")
    return { light: num(c, "intensity") * (level === undefined ? 1 : clamp01(asNumber(level))) }
  },
}

const sensor: Behaviour = {
  evaluate: (_c, r) => ({ reading: asNumber(r.input("light")) }),
}

const attenuator: Behaviour = {
  evaluate: (c, r) => ({ out: asNumber(r.input("in")) * clamp01(num(c, "transmission")) }),
}

const constant: Behaviour = { evaluate: (c) => ({ out: num(c, "value") }) }

/** A > B, with a hysteresis band around B (state `high`). */
const comparator: Behaviour = {
  evaluate: (c, r) => {
    const [a, b, h] = [asNumber(r.input("a")), asNumber(r.input("b")), num(c, "hysteresis") / 2]
    const high = c.state.high === true ? a > b - h : a > b + h
    c.state.high = high
    return { out: high }
  },
}

const LOGIC: Readonly<Record<string, (a: boolean, b: boolean) => boolean>> = {
  and: (a, b) => a && b,
  or: (a, b) => a || b,
  xor: (a, b) => a !== b,
  nand: (a, b) => !(a && b),
  nor: (a, b) => !(a || b),
}

const logic: Behaviour = {
  evaluate: (c, r) => {
    const op = LOGIC[String(c.params.op)] ?? LOGIC.and
    return { out: op?.(asBool(r.input("a")), asBool(r.input("b"))) ?? false }
  },
}

const not: Behaviour = { evaluate: (_c, r) => ({ out: !asBool(r.input("a")) }) }

/** A display draws its supply current once powered (above about 2.5 V). */
const display: Behaviour = {
  stamp: (s, c) => {
    const v = s.e("vcc") - s.e("gnd")
    const i0 = num(c, "current")
    twoTerminal(s, "vcc", "gnd", i0 * sigmoid(v, 2.5, 0.2), i0 * sigmoidSlope(v, 2.5, 0.2))
  },
}

/** A board pin into a circuit: Thevenin source of duty·high behind its output resistance. */
const pinOutput: Behaviour = {
  stamp: (s, c, r) => {
    const duty = clamp01(asNumber(r.input("level")))
    const rOut = Math.max(num(c, "rOut"), 1e-3)
    const v = s.e("out") - s.e("gnd")
    twoTerminal(s, "out", "gnd", (v - duty * num(c, "high")) / rOut, 1 / rOut)
  },
  check: (c, r) => {
    const i = Math.abs(r.flow("out"))
    const max = num(c, "maxCurrent")
    return max > 0 && i > max
      ? [
          {
            code: "rating",
            severity: "warning",
            message: `${c.label}: ${(i * 1000).toPrecision(3)} mA is over the pin's ${(max * 1000).toPrecision(3)} mA.`,
          },
        ]
      : []
  },
}

/** A voltage as ADC counts: round(V/Vref·(2^bits − 1)), clamped (high impedance). */
const analogInput: Behaviour = {
  evaluate: (c, r) => {
    const top = 2 ** Math.round(num(c, "bits")) - 1
    const counts = Math.round(((r.e("in") - r.e("gnd")) / Math.max(num(c, "vref"), 1e-9)) * top)
    return { counts: Math.min(top, Math.max(0, counts)) }
  },
}

export const SIGNAL_BEHAVIOURS: Readonly<Record<string, Behaviour>> = {
  "data.pinOutput": pinOutput,
  "data.analogInput": analogInput,
  "light.emitter": emitter,
  "light.sensor": sensor,
  "light.attenuator": attenuator,
  "data.constant": constant,
  "data.comparator": comparator,
  "data.logic": logic,
  "data.not": not,
  "data.display": display,
  "data.probe": {},
}
