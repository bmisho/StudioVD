/** Words naming the part of a fit that goes in, and the part it goes into. */
const MALE = new Set(["shaft", "pin", "bolt", "screw", "boss", "peg", "stud", "plug", "male"])
const FEMALE = new Set(["bore", "hole", "socket", "sleeve", "nut", "recess", "female"])

const words = (tag: string) =>
  tag
    .trim()
    .toLowerCase()
    .split(/[\s_-]+/)
    .filter(Boolean)

/**
 * Whether two anchors' interface tags fit (PLAN 8.2 suggestions): equal tags naming no role
 * (`rail-2020` and `rail-2020`), or one that goes in and one it goes into with the rest equal, in order
 * (`shaft-8mm` and `bore-8mm`, `M3-screw` and `M3-hole`). Case, spaces and `_` versus `-`
 * do not matter; sizes must match exactly (`8mm` is not `8`). An empty tag fits nothing.
 */
export function tagsFit(a: string | undefined, b: string | undefined): boolean {
  const [wa, wb] = [words(a ?? ""), words(b ?? "")]
  if (wa.length === 0 || wb.length === 0) return false
  // Equal tags fit when they name no role: two rails, but not two shafts.
  if (wa.join("-") === wb.join("-")) return !wa.some((w) => MALE.has(w) || FEMALE.has(w))
  const role = (w: string[]) => {
    const male = w.findIndex((x) => MALE.has(x))
    const female = w.findIndex((x) => FEMALE.has(x))
    if (male < 0 === female < 0) return null // neither, or both: no single role
    const at = male >= 0 ? male : female
    return { male: male >= 0, rest: w.filter((_, i) => i !== at).join("-") }
  }
  const [ra, rb] = [role(wa), role(wb)]
  return !!ra && !!rb && ra.male !== rb.male && ra.rest === rb.rest
}
