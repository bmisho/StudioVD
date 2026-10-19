import { linearToSrgbHex } from "@/core/materials/physicalParams"
import { MAX_SLOTS, type Vec3 } from "@/core/schema"

/** A material region of a source mesh: its material name and colour, when the source has them. */
export interface SourceSlot {
  /** glTF material or OBJ `usemtl` name; null when the source names none (STEP, STL). */
  name: string | null
  /** Linear RGB 0..1; null for no colour. */
  color: Vec3 | null
}

/** A slot of a stored asset: one contiguous triangle range (inclusive) of the index buffer. */
export interface AssetSlot extends SourceSlot {
  first: number
  last: number
}

const sameColour = (a: Vec3 | null, b: Vec3 | null) =>
  a === b || (a !== null && b !== null && a.every((v, i) => v === b[i]))

/**
 * Collects the slots of one source mesh in order of first appearance. Materials are told apart
 * by name and 8-bit sRGB colour (unnamed ones, from STEP or STL, are named after that colour).
 * Past `MAX_SLOTS`, the rest share one extra slot, which `normalizeSlots` folds and reports.
 */
export function slotCollector() {
  const slots: SourceSlot[] = []
  const byKey = new Map<string, number>()
  const add = (name: string | null, color: Vec3 | null): number => {
    const key = JSON.stringify([name, color ? linearToSrgbHex(color) : null])
    const known = byKey.get(key)
    if (known !== undefined) return known
    if (slots.length > MAX_SLOTS) return MAX_SLOTS
    slots.push({ name, color })
    byKey.set(key, slots.length - 1)
    return slots.length - 1
  }
  return { slots, add }
}

/**
 * Merges slots with the same name and colour, and folds everything past `MAX_SLOTS` into the
 * last one. Returns the kept slots and each triangle's new slot index.
 */
export function normalizeSlots(slots: readonly SourceSlot[], triangleSlots: ArrayLike<number>) {
  const kept: SourceSlot[] = []
  const remap = slots.map((slot) => {
    const same = kept.findIndex((k) => k.name === slot.name && sameColour(k.color, slot.color))
    if (same >= 0) return same
    if (kept.length === MAX_SLOTS) return MAX_SLOTS - 1
    kept.push(slot)
    return kept.length - 1
  })
  const slotOf = Uint16Array.from(triangleSlots, (s) => remap[s] ?? 0)
  return { slots: kept, slotOf, folded: slots.length > kept.length && kept.length === MAX_SLOTS }
}

/** At most `n` UTF-16 units, never splitting a surrogate pair. */
const cut = (s: string, n: number) => {
  const head = s.slice(0, n)
  return /[\ud800-\udbff]$/.test(head) ? head.slice(0, -1) : head
}

/**
 * A source name as a slot name: printable, single-spaced, trimmed, at most 120 characters, and
 * well-formed UTF-16 (the GLB stores it as UTF-8, which has no lone surrogates: the name read
 * back must equal the one in scene.json).
 */
export function cleanSlotName(raw: string): string {
  const printable = [...raw]
    .map((c) => (c < " " || c === "\u007f" ? " " : /^[\ud800-\udfff]$/.test(c) ? "\ufffd" : c))
    .join("")
  return cut(printable.replace(/\s+/g, " ").trim(), 120).trim()
}

/**
 * Display names for the slots of one asset (PLAN 6.1): the source's material name, else the
 * colour as `#RRGGBB` (sRGB), else "Default". Repeats get " (2)", " (3)"...
 */
export function slotNames(slots: readonly SourceSlot[]): string[] {
  const used = new Set<string>()
  return slots.map((slot) => {
    const named = slot.name === null ? "" : cleanSlotName(slot.name)
    const base = named || (slot.color ? linearToSrgbHex(slot.color).toUpperCase() : "") || "Default"
    let name = base
    for (let n = 2; used.has(name); n++) name = `${cut(base, 112).trim()} (${n})`
    used.add(name)
    return name
  })
}

/**
 * Reorders faces (stably) so the triangles of each slot form one range, as one glTF primitive
 * per slot needs. `faceSlot[f]` is the slot of face `f`; a face never spans two slots.
 */
export function groupBySlot(
  indices: Uint32Array,
  faces: readonly { first: number; last: number }[],
  faceSlot: ArrayLike<number>,
  slotCount: number
) {
  const order = faces
    .map((_, f) => f)
    .sort((a, b) => (faceSlot[a] ?? 0) - (faceSlot[b] ?? 0) || a - b)
  const out = new Uint32Array(indices.length)
  const ranges: { first: number; last: number }[] = []
  const slotRanges = Array.from({ length: slotCount }, () => ({ first: -1, last: -1 }))
  let next = 0
  for (const f of order) {
    const face = faces[f]
    if (!face) continue
    const size = face.last - face.first + 1
    out.set(indices.subarray(3 * face.first, 3 * (face.last + 1)), 3 * next)
    ranges.push({ first: next, last: next + size - 1 })
    const range = slotRanges[faceSlot[f] ?? 0]
    if (range) {
      if (range.first < 0) range.first = next
      range.last = next + size - 1
    }
    next += size
  }
  return { indices: out, ranges, slotRanges }
}
