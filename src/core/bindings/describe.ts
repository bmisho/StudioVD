import { mateTypeLabel } from "@/core/assembly/mateNames"
import type { Binding, MateId, SceneDocument } from "@/core/schema"

// Bindings said in words (PLAN 13.3): "Hinge 1 angle → Potentiometer 1 · Wiper position".

type Doc = Pick<SceneDocument, "parts" | "anchors" | "mates" | "schematic">

const nameOf = (
  record: Record<string, { name?: string; label?: string } | undefined>,
  id: string
) => {
  const e = Object.hasOwn(record, id) ? record[id] : undefined
  return e?.name ?? e?.label ?? "?"
}

/** "Revolute: Base – Leaf" (mates have no names of their own). */
export function mateName(doc: Doc, id: MateId): string {
  const mate = Object.hasOwn(doc.mates, id) ? doc.mates[id] : undefined
  if (!mate) return "?"
  const partOf = (anchor: string) => {
    const a = Object.hasOwn(doc.anchors, anchor)
      ? doc.anchors[anchor as keyof Doc["anchors"]]
      : undefined
    return a ? nameOf(doc.parts, a.partId) : "?"
  }
  return `${mateTypeLabel(mate.type)}: ${partOf(mate.anchorA)} – ${partOf(mate.anchorB)}`
}

const SOURCE: Record<Binding["from"]["kind"], string> = {
  mateCoordinate: "position",
  gravityLoad: "gravity load",
  mass: "mass",
  contact: "contact",
  distance: "distance",
  range: "range",
  light: "light",
  output: "output",
}

export function describeSource(doc: Doc, b: Binding): string {
  const f = b.from
  const { nodes } = doc.schematic
  switch (f.kind) {
    case "mateCoordinate":
    case "gravityLoad":
      return `${mateName(doc, f.mate)} ${SOURCE[f.kind]}`
    case "mass":
      return `${nameOf(doc.parts, f.part)} mass`
    case "contact":
      return `${nameOf(doc.parts, f.a)} touching ${nameOf(doc.parts, f.b)}`
    case "distance":
      return `${nameOf(doc.anchors, f.a)} to ${nameOf(doc.anchors, f.b)}`
    case "range":
      return `Range from ${nameOf(doc.anchors, f.anchor)}`
    case "light":
      return `Light ${nameOf(doc.anchors, f.emitter)} → ${nameOf(doc.anchors, f.sensor)}`
    case "output":
      return `${nameOf(nodes, f.node)} · ${f.port}${f.quantity === "value" ? "" : ` ${f.quantity}`}`
  }
}

export function describeTarget(doc: Doc, b: Binding): string {
  const t = b.to
  const { nodes } = doc.schematic
  switch (t.kind) {
    case "param":
      return `${nameOf(nodes, t.node)} · ${t.param}`
    case "input":
      return `${nameOf(nodes, t.node)} · ${t.port}`
    case "glow":
      return `${nameOf(doc.parts, t.part)} glows ${t.color}`
    case "tint":
      return `${nameOf(doc.parts, t.part)} tint`
    case "arrow":
      return `Arrow at ${nameOf(doc.anchors, t.anchor)}`
    case "label":
      return `Label at ${nameOf(doc.anchors, t.anchor)}`
    case "ghost":
      return `${mateName(doc, t.mate)} ghost`
  }
}
