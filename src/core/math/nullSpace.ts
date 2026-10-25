/**
 * Rank and a null-space basis of a symmetric positive semi-definite matrix (n x n, row-major:
 * a Gram matrix JᵀJ, whose rank and null space are J's), by Cholesky with diagonal pivoting:
 * steps stop when every remaining pivot is at most `tolerance2` (a squared singular value of
 * J: what counts as zero). The basis has n - rank vectors (not orthonormal). O(n³).
 */
export function psdNullSpace(gram: Float64Array, n: number, tolerance2: number) {
  const a = Float64Array.from(gram)
  const l = new Float64Array(n * n)
  const perm = Array.from({ length: n }, (_, i) => i)
  const at = (m: Float64Array, i: number, j: number) => m[i * n + j] ?? 0
  const swap = (m: Float64Array, i: number, j: number) => {
    const t = m[i] ?? 0
    m[i] = m[j] ?? 0
    m[j] = t
  }
  let rank = 0
  for (let k = 0; k < n; k++) {
    let p = k
    for (let i = k + 1; i < n; i++) if (at(a, i, i) > at(a, p, p)) p = i
    if (at(a, p, p) <= tolerance2) break
    if (p !== k) {
      for (let c = 0; c < n; c++) swap(a, k * n + c, p * n + c)
      for (let r = 0; r < n; r++) swap(a, r * n + k, r * n + p)
      for (let c = 0; c < k; c++) swap(l, k * n + c, p * n + c)
      ;[perm[k], perm[p]] = [perm[p] ?? p, perm[k] ?? k]
    }
    const d = Math.sqrt(at(a, k, k))
    l[k * n + k] = d
    for (let i = k + 1; i < n; i++) l[i * n + k] = at(a, i, k) / d
    for (let i = k + 1; i < n; i++)
      for (let j = k + 1; j < n; j++) a[i * n + j] = at(a, i, j) - at(l, i, k) * at(l, j, k)
    rank++
  }
  // With P g Pᵀ = [L11; L21][L11ᵀ L21ᵀ], each free coordinate e_j gives (-L11⁻ᵀ L21ᵀ e_j, e_j).
  const basis: number[][] = []
  for (let j = rank; j < n; j++) {
    const x = new Array<number>(rank).fill(0)
    for (let i = rank - 1; i >= 0; i--) {
      let s = -at(l, j, i)
      for (let m = i + 1; m < rank; m++) s -= at(l, m, i) * (x[m] ?? 0)
      x[i] = s / at(l, i, i)
    }
    const v = new Array<number>(n).fill(0)
    for (let i = 0; i < rank; i++) v[perm[i] ?? i] = x[i] ?? 0
    v[perm[j] ?? j] = 1
    basis.push(v)
  }
  return { rank, basis }
}

/**
 * An orthonormal basis of the span of `vectors` (all of one length) after `start` (itself
 * orthonormal), by modified Gram-Schmidt: a vector whose remainder is at most `tolerance` long
 * adds nothing. Its length is the span's dimension.
 */
export function spanBasis(
  vectors: readonly (readonly number[])[],
  tolerance: number,
  start: readonly (readonly number[])[] = []
): number[][] {
  const basis = start.map((b) => [...b])
  for (const v of vectors) {
    const r = [...v]
    for (const b of basis) {
      let d = 0
      for (let i = 0; i < r.length; i++) d += (r[i] ?? 0) * (b[i] ?? 0)
      for (let i = 0; i < r.length; i++) r[i] = (r[i] ?? 0) - d * (b[i] ?? 0)
    }
    let len2 = 0
    for (const x of r) len2 += x * x
    const len = Math.sqrt(len2)
    if (len > tolerance) basis.push(r.map((x) => x / len))
  }
  return basis
}
