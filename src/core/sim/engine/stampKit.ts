import type { Stamper, Var } from "./types"

// The usual elements, stamped in port terms (PLAN 12.3). `a → b` is the flow's direction
// through the block: out of net a into the block, out of the block into net b.

const P = (port: string): Var => ({ port })
const B = (branch: number): Var => ({ branch })

/** A two-terminal law i(v), v = e(a) − e(b), with its slope g = di/dv. */
export function twoTerminal(s: Stamper, a: string, b: string, i: number, g: number): void {
  s.flow(a, i, [
    [P(a), g],
    [P(b), -g],
  ])
  s.flow(b, -i, [
    [P(a), -g],
    [P(b), g],
  ])
}

/** A conductance (resistor, damper, linear restriction). */
export function conductance(s: Stamper, a: string, b: string, g: number): void {
  twoTerminal(s, a, b, g * (s.e(a) - s.e(b)), g)
}

/** A constant flow from a to b through the block (current, torque, force, mass flow). */
export function flowSource(s: Stamper, a: string, b: string, value: number): void {
  s.flow(a, value, [])
  s.flow(b, -value, [])
}

/**
 * An ideal effort source e(a) − e(b) = value (battery, short, held shaft), its flow a → b
 * the branch unknown.
 */
export function effortSource(s: Stamper, a: string, b: string, value: number, branch: number) {
  const i = s.x(branch)
  s.flow(a, i, [[B(branch), 1]])
  s.flow(b, -i, [[B(branch), -1]])
  s.equation(branch, s.e(a) - s.e(b) - value, [
    [P(a), 1],
    [P(b), -1],
  ])
}

/**
 * An ideal transformer (gear, lead screw, a driver's PWM stage): across side 1 is `n` times
 * across side 2, and the flow through side 1 (the branch, a1 → b1) comes out of side 2
 * multiplied by `m` (b2 → a2); with m = n power in equals power out, a smaller m is a loss
 * (efficiency). `r` adds a series resistance: e1 − n·e2 = r·i.
 */
export function transformer(
  s: Stamper,
  side1: readonly [string, string],
  side2: readonly [string, string],
  n: number,
  branch: number,
  r = 0,
  m = n
): void {
  const [a1, b1] = side1
  const [a2, b2] = side2
  const i = s.x(branch)
  s.flow(a1, i, [[B(branch), 1]])
  s.flow(b1, -i, [[B(branch), -1]])
  s.flow(a2, -m * i, [[B(branch), -m]])
  s.flow(b2, m * i, [[B(branch), m]])
  s.equation(branch, s.e(a1) - s.e(b1) - n * (s.e(a2) - s.e(b2)) - r * i, [
    [P(a1), 1],
    [P(b1), -1],
    [P(a2), -n],
    [P(b2), n],
    [B(branch), -r],
  ])
}

/** Smooth on/off between 0 and 1 around `at` with width `w` (gates, check valves). */
export const sigmoid = (v: number, at: number, w: number): number =>
  1 / (1 + Math.exp(-Math.max(-60, Math.min(60, (v - at) / w))))

/** Its slope. */
export const sigmoidSlope = (v: number, at: number, w: number): number => {
  const y = sigmoid(v, at, w)
  return (y * (1 - y)) / w
}
