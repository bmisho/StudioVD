import { conductance } from "../stampKit"
import { asBool, flag, num, type Behaviour, type Instance, type Reader } from "../types"
import { rated } from "./electrical"

// Switching elements (PLAN 11.3): contacts and protection, each with its memory.

/** Closed by its input when something drives it, else by its parameter. */
const closed = (c: Instance, r: Reader) => {
  const v = r.input("closed")
  return v === undefined ? flag(c, "closed") : asBool(v)
}

const switchBlock: Behaviour = {
  stamp: (s, c, r) => {
    if (closed(c, r)) conductance(s, "a", "b", 1 / Math.max(num(c, "rOn"), 1e-6))
  },
}

/** Closed now: what the last press left it at, else its starting state (state `on`). */
const latched = (c: Instance) =>
  c.state.on === undefined ? flag(c, "closed") : c.state.on === true

/**
 * A latching push switch toggles on each press: the moment its input goes from released to
 * pressed (state `pressed` remembers which it was in the last solve). Held down it stays put.
 */
const latchingSwitch: Behaviour = {
  stamp: (s, c) => {
    if (latched(c)) conductance(s, "a", "b", 1 / Math.max(num(c, "rOn"), 1e-6))
  },
  settle: (c, r) => {
    const pressed = asBool(r.input("press"))
    const was = c.state.pressed === true
    c.state.pressed = pressed
    if (!pressed || was) return false
    c.state.on = !latched(c)
    return true
  },
}

/** A fuse conducts until it carries more than its rating; then it stays blown (state). */
const fuse: Behaviour = {
  // About 0.1 Ω at 1 A, less for bigger fuses (estimated: datasheets give cold resistance).
  stamp: (s, c) => {
    if (c.state.blown !== true) conductance(s, "a", "b", num(c, "rating") / 0.1)
  },
  settle: (c, r) => {
    if (c.state.blown === true || Math.abs(r.flow("a")) <= num(c, "rating")) return false
    c.state.blown = true
    c.state.blownAt = Math.abs(r.flow("a"))
    return true
  },
  check: (c) =>
    c.state.blown === true
      ? [
          {
            code: "blown",
            severity: "warning",
            message: `${c.label} has blown: ${rated("current", Number(c.state.blownAt), "A", num(c, "rating"))}`,
          },
        ]
      : [],
}

/** Contacts follow the coil with pick-up and drop-out (state `on`). */
const relay: Behaviour = {
  stamp: (s, c) => {
    conductance(s, "coilPos", "coilNeg", 1 / Math.max(num(c, "coilResistance"), 1e-3))
    conductance(s, "com", c.state.on === true ? "no" : "nc", 1 / 0.05)
  },
  settle: (c, r) => {
    const v = Math.abs(r.e("coilPos") - r.e("coilNeg"))
    const on = c.state.on === true
    const next = on ? v > num(c, "dropOut") : v >= num(c, "pickUp")
    c.state.on = next
    return next !== on
  },
}

export const SWITCHING_BEHAVIOURS: Readonly<Record<string, Behaviour>> = {
  "electrical.switch": switchBlock,
  "electrical.latchingSwitch": latchingSwitch,
  "electrical.fuse": fuse,
  "electrical.relay": relay,
}
