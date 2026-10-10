/**
 * Structural equality for plain JSON-like data (objects, arrays, primitives). Shared
 * sub-trees short-circuit on reference equality, so comparing two immer snapshots of a large
 * document only walks the parts that changed.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]))
  }
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  const rb = b as Record<string, unknown>
  const ra = a as Record<string, unknown>
  return ka.every((k) => Object.hasOwn(rb, k) && deepEqual(ra[k], rb[k]))
}
