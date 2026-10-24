/**
 * Numerical rank of a dense matrix (rows of equal length), by Gaussian elimination with
 * partial pivoting: entries below `tolerance` times the largest one count as zero. Copies its
 * input; O(rows · cols · rank).
 */
export function matrixRank(rows: readonly (readonly number[])[], tolerance = 1e-9): number {
  const m = rows.map((r) => [...r])
  const cols = m[0]?.length ?? 0
  let largest = 0
  for (const r of m) for (const v of r) largest = Math.max(largest, Math.abs(v))
  if (largest === 0) return 0
  const eps = tolerance * largest
  let rank = 0
  for (let c = 0; c < cols && rank < m.length; c++) {
    let pivot = rank
    for (let r = rank + 1; r < m.length; r++)
      if (Math.abs(m[r]?.[c] ?? 0) > Math.abs(m[pivot]?.[c] ?? 0)) pivot = r
    const top = m[pivot]
    if (!top || Math.abs(top[c] ?? 0) <= eps) continue
    m[pivot] = m[rank] ?? top
    m[rank] = top
    for (let r = rank + 1; r < m.length; r++) {
      const row = m[r]
      if (!row) continue
      const f = (row[c] ?? 0) / (top[c] ?? 1)
      if (f === 0) continue
      for (let k = c; k < cols; k++) row[k] = (row[k] ?? 0) - f * (top[k] ?? 0)
    }
    rank++
  }
  return rank
}
