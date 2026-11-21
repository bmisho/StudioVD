import { effortSource, flowSource, transformer, twoTerminal } from "../stampKit"
import { num, type Behaviour, type Instance, type Reader } from "../types"

// Mechanical blocks (PLAN 11.3): rotational ports carry ω and τ, linear ports v and F. In
// steady state a spring is still (its two ends move together) and carries whatever force
// the rest puts through it.

/** Forward unless the last solve found power flowing back (state `back`). */
const efficiency = (c: Instance, eta: number) =>
  c.state.back === true ? 1 / Math.max(eta, 1e-6) : eta

/** Power into side 1 of a transformer branch: which way it flows decides the efficiency. */
function settleDirection(c: Instance, r: Reader, a: string, b: string): boolean {
  const back = (r.e(a) - r.e(b)) * r.x(0) < 0
  const was = c.state.back === true
  c.state.back = back
  return back !== was
}

/** Gear pair: ω_in = ratio·ω_out, τ_out = ratio·η·τ_in. */
const gear: Behaviour = {
  branches: () => 1,
  stamp: (s, c) => {
    const n = num(c, "ratio")
    const eta = Math.min(1, Math.max(num(c, "efficiency"), 1e-6))
    transformer(s, ["input", "frame"], ["output", "frame"], n, 0, 0, n * efficiency(c, eta))
  },
  settle: (c, r) => num(c, "efficiency") < 1 && settleDirection(c, r, "input", "frame"),
}

/**
 * Lead screw: v = lead·ω/2π, F = 2π·η·τ/lead driving; back-driven with η_b = 2 − 1/η
 * (zero or less: self-locking, the screw holds the nut).
 */
const leadScrew: Behaviour = {
  branches: () => 2,
  stamp: (s, c) => {
    const n = (2 * Math.PI) / Math.max(num(c, "lead"), 1e-9)
    const eta = Math.min(1, Math.max(num(c, "efficiency"), 1e-6))
    const back = c.state.back === true
    const etaBack = 2 - 1 / eta
    const locked = back && etaBack <= 0
    const m = back ? n / Math.max(etaBack, 1e-6) : n * eta
    transformer(s, ["screw", "frame"], ["nut", "body"], n, 0, 0, locked ? n : m)
    // Branch 1: a self-locking screw holds the nut still against its body.
    if (locked) effortSource(s, "nut", "body", 0, 1)
    else s.equation(1, s.x(1), [[{ branch: 1 }, 1]])
  },
  settle: (c, r) => num(c, "efficiency") < 1 && settleDirection(c, r, "screw", "frame"),
}

const spring: Behaviour = {
  branches: (c) => (num(c, "stiffness") > 0 ? 1 : 0),
  stamp: (s, c) => {
    if (num(c, "stiffness") > 0) effortSource(s, "a", "b", 0, 0)
    else flowSource(s, "a", "b", num(c, "preload"))
  },
  evaluate: (c, r): Record<string, number> =>
    num(c, "stiffness") > 0
      ? { deflection: (r.x(0) - num(c, "preload")) / num(c, "stiffness") }
      : {},
}

/** Viscous damping plus Coulomb friction, smoothed with tanh (undefined at rest otherwise). */
const friction: Behaviour = {
  stamp: (s, c) => {
    const v = s.e("a") - s.e("b")
    const [d, fc] = [num(c, "damping"), num(c, "coulomb")]
    const V0 = 1e-3
    const t = Math.tanh(v / V0)
    twoTerminal(s, "a", "b", d * v + fc * t, d + (fc * (1 - t * t)) / V0 + 1e-9)
  },
}

/** A torque on an axis against its frame (gravity from 3D arrives through bindings). */
const load: Behaviour = {
  stamp: (s, c) => flowSource(s, "frame", "axis", num(c, "torque")),
}

export const MECHANICAL_BEHAVIOURS: Readonly<Record<string, Behaviour>> = {
  "mechanical.groundRotational": { grounds: ["frame"] },
  "mechanical.groundTranslational": { grounds: ["frame"] },
  "mechanical.gear": gear,
  "mechanical.leadScrew": leadScrew,
  "mechanical.spring": spring,
  "mechanical.friction": friction,
  "mechanical.load": load,
}
