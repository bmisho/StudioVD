/**
 * Kåsa least-squares circle fit in 2D (PLAN §2: hole/shaft axis position and radius).
 * Minimises Σ (x² + y² + D x + E y + F)², a linear problem, on points shifted to their mean
 * for conditioning. Returns null for fewer than 3 points or (near-)collinear input.
 * Kåsa is biased low for short noisy arcs; CAD tessellations are exact points on the arc.
 */
export interface Circle {
  cx: number
  cy: number
  r: number
  /** Root-mean-square radial residual, same unit as the input. */
  rms: number
}

export function fitCircle(xs: ArrayLike<number>, ys: ArrayLike<number>): Circle | null {
  const n = Math.min(xs.length, ys.length)
  if (n < 3) return null
  let mx = 0
  let my = 0
  for (let i = 0; i < n; i++) {
    mx += xs[i] ?? 0
    my += ys[i] ?? 0
  }
  mx /= n
  my /= n
  // Normal equations for [D, E, F] with z = x² + y²: A^T A p = -A^T z, rows [x, y, 1].
  let sxx = 0
  let sxy = 0
  let syy = 0
  let sx = 0
  let sy = 0
  let sxz = 0
  let syz = 0
  let sz = 0
  for (let i = 0; i < n; i++) {
    const x = (xs[i] ?? 0) - mx
    const y = (ys[i] ?? 0) - my
    const z = x * x + y * y
    sxx += x * x
    sxy += x * y
    syy += y * y
    sx += x
    sy += y
    sxz += x * z
    syz += y * z
    sz += z
  }
  const sol = solve3([sxx, sxy, sx, sxy, syy, sy, sx, sy, n], [-sxz, -syz, -sz])
  if (!sol) return null
  const [d, e, f] = sol
  const cx = -d / 2
  const cy = -e / 2
  const r2 = cx * cx + cy * cy - f
  if (!(r2 > 0)) return null
  const r = Math.sqrt(r2)
  let sse = 0
  for (let i = 0; i < n; i++) {
    const dr = Math.hypot((xs[i] ?? 0) - mx - cx, (ys[i] ?? 0) - my - cy) - r
    sse += dr * dr
  }
  return { cx: cx + mx, cy: cy + my, r, rms: Math.sqrt(sse / n) }
}

/** Solves a 3x3 system (row-major) by Cramer's rule; null if singular. */
function solve3(m: number[], b: number[]): [number, number, number] | null {
  const at = (i: number) => m[i] ?? 0
  const det3 = (c0: number[], c1: number[], c2: number[]) =>
    (c0[0] ?? 0) * ((c1[1] ?? 0) * (c2[2] ?? 0) - (c2[1] ?? 0) * (c1[2] ?? 0)) -
    (c1[0] ?? 0) * ((c0[1] ?? 0) * (c2[2] ?? 0) - (c2[1] ?? 0) * (c0[2] ?? 0)) +
    (c2[0] ?? 0) * ((c0[1] ?? 0) * (c1[2] ?? 0) - (c1[1] ?? 0) * (c0[2] ?? 0))
  const c0 = [at(0), at(3), at(6)]
  const c1 = [at(1), at(4), at(7)]
  const c2 = [at(2), at(5), at(8)]
  const det = det3(c0, c1, c2)
  const scale = Math.max(...m.map(Math.abs), 1e-300)
  if (Math.abs(det) < 1e-12 * scale ** 3) return null
  return [det3(b, c1, c2) / det, det3(c0, b, c2) / det, det3(c0, c1, b) / det]
}
