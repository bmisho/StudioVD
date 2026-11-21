import { mateCoordinate } from "@/core/physics/mateCoordinate"
import type { Binding, Frame, MateId, SceneDocument } from "@/core/schema"
import type { SimResult } from "@/core/sim/engine/results"
import { quantity } from "@/core/sim/format"
import { mapValue } from "./sample"

// What the 3D view shows of a solve (PLAN 13.1 sinks): per part a glow or a tint, per anchor
// an arrow or a label, per mate a ghost. Derived once per solve, never per frame.

/** Something drawn at a frame of a part (part-local mm). */
export interface Mark {
  key: string
  kind: "arrow" | "label" | "ghost"
  frame: Frame
  /** Arrow: length in mm (signed). Ghost: the commanded coordinate (rad, or mm on a slider). */
  value: number
  text?: string
  /** Ghost: its mate, whether it slides, and its coordinate at the design pose. */
  mate?: MateId
  slides?: boolean
  designCoordinate?: number
}

export interface SimVisuals {
  glow: Record<string, number>
  glowColor: Record<string, string>
  tint: Record<string, number>
  /** Arrows, labels and ghosts by the part they are drawn on. */
  marks: Record<string, Mark[]>
}

export const NO_VISUALS: SimVisuals = { glow: {}, glowColor: {}, tint: {}, marks: {} }

/** A block output's value now, by what the binding reads. */
function outputValue(result: SimResult, b: Binding): number | undefined {
  if (b.from.kind !== "output") return undefined
  const id = `${b.from.node}/${b.from.port}`
  if (b.from.quantity === "value") {
    const v = result.signals[id]
    return typeof v === "number" ? v : typeof v === "boolean" ? Number(v) : undefined
  }
  const port = result.ports[id]
  return port ? (b.from.quantity === "effort" ? port.effort : port.flow) : undefined
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

type Doc = Pick<SceneDocument, "bindings" | "anchors" | "mates" | "parts">

export function visualsOf(doc: Doc, result: SimResult | null): SimVisuals {
  if (!result) return NO_VISUALS
  const out: SimVisuals = { glow: {}, glowColor: {}, tint: {}, marks: {} }
  const mark = (part: string, m: Mark) => (out.marks[part] ??= []).push(m)
  const anchorOf = (id: string) =>
    Object.hasOwn(doc.anchors, id) ? doc.anchors[id as keyof Doc["anchors"]] : undefined
  for (const b of Object.values(doc.bindings)) {
    const raw = outputValue(result, b)
    if (raw === undefined) continue
    const v = mapValue(b, raw)
    const t = b.to
    if (t.kind === "glow") {
      out.glow[t.part] = clamp01(v)
      out.glowColor[t.part] = t.color
    } else if (t.kind === "tint") out.tint[t.part] = clamp01(v)
    else if (t.kind === "arrow" || t.kind === "label") {
      const a = anchorOf(t.anchor)
      if (!a) continue
      mark(a.partId, {
        key: b.id,
        kind: t.kind,
        frame: a.frame,
        value: v,
        ...(t.kind === "label" && { text: quantity(v, t.unit) }),
      })
    } else if (t.kind === "ghost") {
      const mate = Object.hasOwn(doc.mates, t.mate) ? doc.mates[t.mate] : undefined
      const [a, bb] = [mate && anchorOf(mate.anchorA), mate && anchorOf(mate.anchorB)]
      const [pa, pb] = [a && doc.parts[a.partId], bb && doc.parts[bb.partId]]
      if (!mate || !a || !bb || !pa || !pb) continue
      const slides = mate.type === "prismatic"
      mark(bb.partId, {
        key: b.id,
        kind: "ghost",
        frame: bb.frame,
        value: slides ? v * 1000 : v, // the binding maps to m; the part moves in mm
        mate: mate.id,
        slides,
        designCoordinate: mateCoordinate(mate, pa, a, pb, bb),
      })
    }
  }
  return out
}
