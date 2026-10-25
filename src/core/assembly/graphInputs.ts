import type { SceneDocument } from "@/core/schema"

type Doc = Pick<SceneDocument, "parts" | "anchors" | "mates">

/** Same keys, and each pair of entries equal by `same` (or the same object). */
function sameRecord<T>(
  a: Readonly<Record<string, T>>,
  b: Readonly<Record<string, T>>,
  same: (x: T, y: T) => boolean
): boolean {
  if (a === b) return true
  const keys = Object.keys(b)
  if (keys.length !== Object.keys(a).length) return false
  for (const key of keys) {
    if (!Object.hasOwn(a, key)) return false
    const [x, y] = [a[key], b[key]]
    if (x !== y && !(x !== undefined && y !== undefined && same(x, y))) return false
  }
  return true
}

/**
 * Whether two documents give the same assembly graph: the mates, each part's pose and
 * grounding, each anchor's part and frame. A rename, a visibility or material change, an
 * anchor's name or tag do not count (immer keeps unchanged poses and frames the same
 * objects), so they cost a comparison, not a graph (~0.4 s on a crafted file at the caps).
 */
export function sameGraphInputs(a: Doc, b: Doc): boolean {
  return (
    a.mates === b.mates &&
    sameRecord(a.parts, b.parts, (x, y) => x.pose === y.pose && x.grounded === y.grounded) &&
    sameRecord(a.anchors, b.anchors, (x, y) => x.partId === y.partId && x.frame === y.frame)
  )
}
