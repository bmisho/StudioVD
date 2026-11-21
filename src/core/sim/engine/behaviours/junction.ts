// A p-n junction from one datasheet point (PLAN §3 numerics): i = Is·(exp(v/(n·Vt)) − 1) with
// n = 2 and Is fitted so that i(vf) = if. Above the voltage where it would carry 1000 × its
// rated current the law continues as a straight line with the same slope, which keeps Newton
// steps from overflowing (the role of SPICE's junction-voltage limiting) and leaves every
// operating point below that untouched.

/** Ideality factor used for every fitted junction. */
const N = 2
/** kT/q at 300 K, V. */
const VT = 0.025852
const NVT = N * VT

export interface JunctionPoint {
  /** Current a → k, A. */
  i: number
  /** di/dv, S. */
  g: number
}

export function junction(vf: number, ifRated: number, v: number): JunctionPoint {
  const is = ifRated / Math.expm1(vf / NVT)
  const vLin = NVT * Math.log((1000 * ifRated) / is + 1)
  if (v <= vLin) {
    const ex = Math.exp(v / NVT)
    return { i: is * (ex - 1), g: (is * ex) / NVT + 1e-12 }
  }
  const gLin = (is * Math.exp(vLin / NVT)) / NVT
  const iLin = is * Math.expm1(vLin / NVT)
  return { i: iLin + gLin * (v - vLin), g: gLin }
}
