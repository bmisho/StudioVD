/** Words naming the part of a fit that goes in, and the part it goes into. */
const MALE = new Set(["shaft", "pin", "bolt", "screw", "boss", "peg", "stud", "plug", "male"])
const FEMALE = new Set(["bore", "hole", "socket", "sleeve", "nut", "recess", "female"])

const words = (tag: string) =>
  tag
    .trim()
    .toLowerCase()
    .split(/[\s_-]+/)
    .filter(Boolean)

/** What a tag names: the part that goes in (male) or the part it goes into, and the rest. */
function role(w: readonly string[]) {
  const male = w.findIndex((x) => MALE.has(x))
  const female = w.findIndex((x) => FEMALE.has(x))
  if (male < 0 === female < 0) return null // neither, or both: no single role
  const at = male >= 0 ? male : female
  return { male: male >= 0, rest: w.filter((_, i) => i !== at).join("-") }
}

/**
 * A tag's fit keys: `own` describes it, `fits` the tag of what fits it, so two tags fit
 * exactly when one's `fits` is the other's `own` (an index lookup instead of a scan). Null
 * for a tag that fits nothing (empty, or naming both roles).
 */
export function fitKeys(tag: string | undefined): { own: string; fits: string } | null {
  const w = words(tag ?? "")
  if (w.length === 0) return null
  const r = role(w)
  if (r) return { own: `${r.male ? "m" : "f"}:${r.rest}`, fits: `${r.male ? "f" : "m"}:${r.rest}` }
  if (w.some((x) => MALE.has(x) || FEMALE.has(x))) return null
  const key = `=:${w.join("-")}`
  return { own: key, fits: key }
}

/**
 * Whether two anchors' interface tags fit (PLAN 8.2 suggestions): equal tags naming no role
 * (`rail-2020` and `rail-2020`; two shafts do not fit), or one that goes in and one it goes
 * into with the rest equal, in order (`shaft-8mm` and `bore-8mm`, `M3-screw` and `M3-hole`).
 * Case, spaces and `_` versus `-` do not matter; sizes must match exactly (`8mm` is not `8`).
 * An empty tag fits nothing.
 */
export function tagsFit(a: string | undefined, b: string | undefined): boolean {
  const [ka, kb] = [fitKeys(a), fitKeys(b)]
  return !!ka && !!kb && ka.fits === kb.own
}
