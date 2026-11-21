import type { Medium } from "@/core/schema"
import { ATMOSPHERE, density } from "../fluid"
import { effortSource, twoTerminal } from "../stampKit"
import { asBool, num, type Behaviour, type Instance, type Var } from "../types"

// Fluid blocks (PLAN 11.3, §3): pressures are gauge (Pa), flows are mass flows (kg/s).
// Pneumatic results away from equilibrium are indicative: compressibility is simplified.

const P = (port: string): Var => ({ port })
const mediumAt = (c: Instance, port: string): Medium => c.media?.[port] ?? "air"

/** ISO 8778 reference density of air (20 °C, 65 % RH, 1 bar), kg/m³. */
const RHO_ANR = 1.185
/** Critical pressure ratio b of a restriction (ISO 6358 default when unknown). */
const B_CRIT = 0.5

/**
 * Mass flow a → b through a restriction of sonic conductance C (ISO 6358) for air: choked
 * below the critical ratio, elliptic above it, and linear in the last 0.1 % (laminar), where
 * the elliptic law's slope would be infinite. Liquids: ṁ = ρ·C·Δp.
 */
export function restrictionFlow(c: number, medium: Medium, pa: number, pb: number): number {
  if (medium !== "air") return density(medium, (pa + pb) / 2) * c * (pa - pb)
  const [hi, lo] = pa >= pb ? [pa, pb] : [pb, pa]
  const p1 = Math.max(hi + ATMOSPHERE, 1)
  const ratio = Math.max(lo + ATMOSPHERE, 0) / p1
  const elliptic = (r: number) => Math.sqrt(Math.max(0, 1 - ((r - B_CRIT) / (1 - B_CRIT)) ** 2))
  const LAMINAR = 0.999
  const shape =
    ratio <= B_CRIT
      ? 1
      : ratio < LAMINAR
        ? elliptic(ratio)
        : (elliptic(LAMINAR) * (1 - ratio)) / (1 - LAMINAR)
  return Math.sign(pa - pb) * c * p1 * RHO_ANR * shape
}

/** A two-port law by its own finite-difference slope (laws here are smooth enough). */
function nonlinear(
  s: Parameters<NonNullable<Behaviour["stamp"]>>[0],
  a: string,
  b: string,
  f: (pa: number, pb: number) => number
) {
  const [pa, pb] = [s.e(a), s.e(b)]
  const h = Math.max(1, 1e-6 * Math.max(Math.abs(pa), Math.abs(pb)))
  const m = f(pa, pb)
  const g = (f(pa + h, pb) - f(pa - h, pb)) / (2 * h) + 1e-15
  twoTerminal(s, a, b, m, g)
}

const restriction: Behaviour = {
  stamp: (s, c) =>
    nonlinear(s, "a", "b", (pa, pb) =>
      restrictionFlow(num(c, "conductance"), mediumAt(c, "a"), pa, pb)
    ),
}

const valve: Behaviour = {
  stamp: (s, c, r) => {
    const v = r.input("open")
    if (v !== undefined && !asBool(v)) return
    nonlinear(s, "a", "b", (pa, pb) =>
      restrictionFlow(num(c, "conductance"), mediumAt(c, "a"), pa, pb)
    )
  },
}

/** Opens above its cracking pressure (smooth, about 1 g/s per 10 kPa beyond it: estimated). */
const checkValve: Behaviour = {
  stamp: (s, c) => {
    const crack = num(c, "cracking")
    const w = 0.05 * crack + 100
    const G = 1e-7
    nonlinear(s, "inlet", "outlet", (pa, pb) => {
      const x = (pa - pb - crack) / w
      return G * w * (x > 30 ? x : Math.log1p(Math.exp(x)))
    })
  },
}

const pressureSource: Behaviour = {
  grounds: ["ref"],
  branches: () => 1,
  stamp: (s, c) => effortSource(s, "out", "ref", num(c, "pressure"), 0),
}

/**
 * Double-acting cylinder: F = pA·A_cap − pB·A_annulus on the rod; the rod's speed moves mass
 * ρ·A·v into port A and out of port B.
 */
const cylinder: Behaviour = {
  stamp: (s, c) => {
    const bore = num(c, "bore")
    const rod = Math.min(num(c, "rod"), bore)
    const aCap = (Math.PI / 4) * bore * bore
    const aAnn = (Math.PI / 4) * (bore * bore - rod * rod)
    const [pa, pb] = [s.e("portA"), s.e("portB")]
    const v = s.e("rod") - s.e("body")
    const [ma, mb] = [mediumAt(c, "portA"), mediumAt(c, "portB")]
    const [ra, rb] = [density(ma, pa), density(mb, pb)]
    const dra = ma === "air" ? 1.204 / ATMOSPHERE : 0
    const drb = mb === "air" ? 1.204 / ATMOSPHERE : 0
    s.flow("portA", ra * aCap * v, [
      [P("rod"), ra * aCap],
      [P("body"), -ra * aCap],
      [P("portA"), dra * aCap * v],
    ])
    s.flow("portB", -rb * aAnn * v, [
      [P("rod"), -rb * aAnn],
      [P("body"), rb * aAnn],
      [P("portB"), -drb * aAnn * v],
    ])
    const f = pa * aCap - pb * aAnn
    s.flow("rod", -f, [
      [P("portA"), -aCap],
      [P("portB"), aAnn],
    ])
    s.flow("body", f, [
      [P("portA"), aCap],
      [P("portB"), -aAnn],
    ])
  },
}

export const FLUID_BEHAVIOURS: Readonly<Record<string, Behaviour>> = {
  "fluid.pressureSource": pressureSource,
  "fluid.restriction": restriction,
  "fluid.valve": valve,
  "fluid.checkValve": checkValve,
  "fluid.cylinder": cylinder,
}
