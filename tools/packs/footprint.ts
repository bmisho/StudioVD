import { child, children, num, parseSExpr, type SExpr } from "./sexpr"

/** A pad of a KiCad footprint, in footprint millimetres (KiCad's +y points down the board). */
export interface Pad {
  number: string
  kind: "thru_hole" | "smd" | "connect" | "np_thru_hole"
  x: number
  y: number
  /** Drill diameter for through-hole pads. */
  drillMm?: number
}

/** A 3D model a footprint places: its path as written and its offset (mm, KiCad's 3D axes). */
export interface FootprintModel {
  path: string
  offset: [number, number, number]
  hidden: boolean
}

/** What a footprint says about its pads and where its 3D models go. */
export interface Footprint {
  name: string
  description: string
  pads: Pad[]
  models: FootprintModel[]
}

const PAD_KINDS = ["thru_hole", "smd", "connect", "np_thru_hole"] as const

const xyz = (model: SExpr[], name: string): [number, number, number] => {
  const v = child(child(model, name) ?? [], "xyz")
  return [num(v, 1, `${name} x`), num(v, 2, `${name} y`), num(v, 3, `${name} z`)]
}

/**
 * Reads a `.kicad_mod`. Models may be moved (`offset`, mm along KiCad's 3D axes: +y up the
 * board, +z up from it) but not turned or scaled: KiCad's libraries do that, and a rotation's
 * axis order is not something to guess. Anything else is refused.
 */
export function readFootprint(text: string): Footprint {
  const root = parseSExpr(text)
  if (!Array.isArray(root) || root[0] !== "footprint" || typeof root[1] !== "string")
    throw new Error("not a KiCad footprint")
  const descr = child(root, "descr")?.[1]
  const pads: Pad[] = children(root, "pad").map((p) => {
    const [, number, kind] = p
    if (typeof number !== "string" || !PAD_KINDS.includes(kind as Pad["kind"]))
      throw new Error(`pad ${String(number)} has an unknown kind`)
    const at = child(p, "at")
    const drill = child(p, "drill")
    // `(drill 0.9)`, `(drill oval 1 2)`, or only `(drill (offset x y))` on SMD pads.
    const drillMm =
      drill && typeof drill[1] === "string" && drill[1] !== "oval"
        ? num(drill, 1, "drill")
        : undefined
    return {
      number,
      kind: kind as Pad["kind"],
      x: num(at, 1, `pad ${number} x`),
      y: num(at, 2, `pad ${number} y`),
      ...(drillMm !== undefined && { drillMm }),
    }
  })
  const models = children(root, "model").map((m): FootprintModel => {
    const path = m[1]
    if (typeof path !== "string") throw new Error("a model has no path")
    const [rotate, scale] = [xyz(m, "rotate"), xyz(m, "scale")]
    if (rotate.some((v) => v !== 0) || scale.some((v) => v !== 1))
      throw new Error(`${path}: rotation or scale other than KiCad's default`)
    return { path, offset: xyz(m, "offset"), hidden: child(m, "hide")?.[1] === "yes" }
  })
  return {
    name: root[1],
    description: typeof descr === "string" ? descr : "",
    pads,
    models,
  }
}

/**
 * A footprint point in the scene frame of its 3D model once imported (mm, Y up): KiCad
 * models are Z-up with +y up the board, footprints have +y down the board, and imports turn
 * Z-up sources Y-up with (x, y, z) → (x, z, −y). So the board point (x, y) is (x, 0, y).
 */
export const boardPoint = (x: number, y: number): [number, number, number] => [x, 0, y]

/** A model offset (KiCad 3D axes, Z-up) as a scene translation: (x, y, z) → (x, z, −y). */
export const sceneOffset = ([x, y, z]: readonly number[]): [number, number, number] => [
  x ?? 0,
  z ?? 0,
  -(y ?? 0),
]
