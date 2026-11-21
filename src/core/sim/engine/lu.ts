// Dense LU with partial pivoting (PLAN 12.3): fine at schematic scale (a few hundred
// unknowns); sparse only if benchmarks ask for it.

/** A square matrix, row-major. */
export interface Matrix {
  n: number
  a: Float64Array
}

export const matrix = (n: number): Matrix => ({ n, a: new Float64Array(n * n) })

/**
 * Solves A x = b in place: A is overwritten by its factors, b by x. Rows are scaled by their
 * largest entry first, so a pressure row in Pa and a current row in A pivot fairly. Returns
 * the index of a row with no usable pivot (a singular system), or -1.
 */
export function solveInPlace(m: Matrix, b: Float64Array): number {
  const { n, a } = m
  for (let i = 0; i < n; i++) {
    let max = 0
    for (let j = 0; j < n; j++) max = Math.max(max, Math.abs(a[i * n + j] ?? 0))
    if (max === 0) return i
    const s = 1 / max
    for (let j = 0; j < n; j++) a[i * n + j] = (a[i * n + j] ?? 0) * s
    b[i] = (b[i] ?? 0) * s
  }
  const perm = new Int32Array(n)
  for (let i = 0; i < n; i++) perm[i] = i
  for (let k = 0; k < n; k++) {
    let p = k
    let best = Math.abs(a[k * n + k] ?? 0)
    for (let i = k + 1; i < n; i++) {
      const v = Math.abs(a[i * n + k] ?? 0)
      if (v > best) [best, p] = [v, i]
    }
    // Rows are scaled to 1. Only a vanishing pivot is singular here: two nets joined by a
    // contact and held only by gmin are near-singular (1e-14) yet well posed. Steps that come
    // out absurd are caught by the caller.
    if (best < 1e-30) return perm[k] ?? k
    if (p !== k) {
      for (let j = 0; j < n; j++) {
        const t = a[k * n + j] ?? 0
        a[k * n + j] = a[p * n + j] ?? 0
        a[p * n + j] = t
      }
      const tb = b[k] ?? 0
      b[k] = b[p] ?? 0
      b[p] = tb
      const tp = perm[k] ?? k
      perm[k] = perm[p] ?? p
      perm[p] = tp
    }
    const pivot = a[k * n + k] ?? 1
    for (let i = k + 1; i < n; i++) {
      const f = (a[i * n + k] ?? 0) / pivot
      if (f === 0) continue
      a[i * n + k] = f
      for (let j = k + 1; j < n; j++) a[i * n + j] = (a[i * n + j] ?? 0) - f * (a[k * n + j] ?? 0)
      b[i] = (b[i] ?? 0) - f * (b[k] ?? 0)
    }
  }
  for (let i = n - 1; i >= 0; i--) {
    let sum = b[i] ?? 0
    for (let j = i + 1; j < n; j++) sum -= (a[i * n + j] ?? 0) * (b[j] ?? 0)
    b[i] = sum / (a[i * n + i] ?? 1)
  }
  return -1
}
