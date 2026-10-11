import type { Vec3 } from "@/core/schema"

/** Symmetric 3x3 matrix as [a00, a01, a02, a11, a12, a22]. */
export type Sym3 = [number, number, number, number, number, number]

export interface Eigen3 {
  /** Descending: values[0] >= values[1] >= values[2]. */
  values: Vec3
  /** Unit eigenvectors, vectors[i] belongs to values[i]. */
  vectors: [Vec3, Vec3, Vec3]
}

/**
 * Eigen-decomposition of a symmetric 3x3 matrix by cyclic Jacobi rotations. Converges to
 * machine precision in a handful of sweeps for any symmetric input; no special cases for
 * repeated eigenvalues (their vectors are then any orthonormal basis of the eigenspace).
 */
export function eigenSymmetric3(m: Sym3): Eigen3 {
  const a = [
    [m[0], m[1], m[2]],
    [m[1], m[3], m[4]],
    [m[2], m[4], m[5]],
  ]
  const v = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ]
  const get = (r: number[][], i: number, j: number) => r[i]?.[j] ?? 0
  const set = (r: number[][], i: number, j: number, x: number) => {
    const row = r[i]
    if (row) row[j] = x
  }
  for (let sweep = 0; sweep < 50; sweep++) {
    const off = get(a, 0, 1) ** 2 + get(a, 0, 2) ** 2 + get(a, 1, 2) ** 2
    if (off < 1e-30) break
    for (const [p, q] of [
      [0, 1],
      [0, 2],
      [1, 2],
    ] as const) {
      const apq = get(a, p, q)
      if (Math.abs(apq) < 1e-300) continue
      const theta = (get(a, q, q) - get(a, p, p)) / (2 * apq)
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1))
      const c = 1 / Math.sqrt(t * t + 1)
      const s = t * c
      for (let k = 0; k < 3; k++) {
        const akp = get(a, k, p)
        const akq = get(a, k, q)
        set(a, k, p, c * akp - s * akq)
        set(a, k, q, s * akp + c * akq)
      }
      for (let k = 0; k < 3; k++) {
        const apk = get(a, p, k)
        const aqk = get(a, q, k)
        set(a, p, k, c * apk - s * aqk)
        set(a, q, k, s * apk + c * aqk)
      }
      for (let k = 0; k < 3; k++) {
        const vkp = get(v, k, p)
        const vkq = get(v, k, q)
        set(v, k, p, c * vkp - s * vkq)
        set(v, k, q, s * vkp + c * vkq)
      }
    }
  }
  const pairs = [0, 1, 2]
    .map((i) => ({
      value: get(a, i, i),
      vector: [get(v, 0, i), get(v, 1, i), get(v, 2, i)] as Vec3,
    }))
    .sort((x, y) => y.value - x.value)
  const [p0, p1, p2] = pairs as [(typeof pairs)[0], (typeof pairs)[0], (typeof pairs)[0]]
  return { values: [p0.value, p1.value, p2.value], vectors: [p0.vector, p1.vector, p2.vector] }
}
