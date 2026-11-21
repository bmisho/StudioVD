import {
  BindingSchema,
  newId,
  type AnchorId,
  type Binding,
  type BindingId,
  type BlockDef,
  type ComponentBinding,
  type ComponentManifest,
  type MateId,
  type NodeId,
  type PartId,
} from "@/core/schema"

// A component's own bindings (PLAN 13.2): its manifest's templates with its keys replaced by
// the ids the insertion gave them. A slot waits for the user; a template that names what this
// app's block does not have is left out.

export interface InsertedIds {
  parts: Readonly<Record<string, PartId>>
  anchors: Readonly<Record<string, AnchorId>>
  mates: Readonly<Record<string, MateId>>
  /** Its schematic block and that block's definition, when it has one. */
  node?: NodeId
  def?: BlockDef
}

const id = <T>(record: Readonly<Record<string, T>>, key: string): T | undefined =>
  Object.hasOwn(record, key) ? record[key] : undefined

/** One template as a scene binding; `slotPart` fills a contact slot. Null if it cannot be made. */
export function bindingOf(
  t: ComponentBinding,
  ids: InsertedIds,
  slotPart?: PartId
): Binding | null {
  const f = t.from
  const { parts, anchors, mates, node, def } = ids
  const port = (key: string) => def?.ports.find((p) => p.key === key)
  let from: unknown
  if (f.kind === "mateCoordinate" || f.kind === "gravityLoad")
    from = { kind: f.kind, mate: id(mates, f.mate) }
  else if (f.kind === "mass") from = { kind: "mass", part: id(parts, f.part) }
  else if (f.kind === "contact") from = { kind: "contact", a: id(parts, f.a), b: id(parts, f.b) }
  else if (f.kind === "contactSlot") {
    if (!slotPart) return null
    from = { kind: "contact", a: id(parts, f.a), b: slotPart }
  } else if (f.kind === "distance")
    from = { kind: "distance", a: id(anchors, f.a), b: id(anchors, f.b) }
  else if (f.kind === "range") from = { kind: "range", anchor: id(anchors, f.anchor), maxM: f.maxM }
  else {
    if (!node || !port(f.port)) return null
    from = { kind: "output", node, port: f.port, quantity: f.quantity }
  }
  const g = t.to
  let to: unknown
  if (g.kind === "param") {
    if (
      !node ||
      !def?.params.some((p) => p.key === g.param && (p.kind === "number" || p.kind === "bool"))
    )
      return null
    to = { kind: "param", node, param: g.param }
  } else if (g.kind === "input") {
    if (!node || port(g.port)?.direction !== "in") return null
    to = { kind: "input", node, port: g.port }
  } else if (g.kind === "glow") to = { kind: "glow", part: id(parts, g.part), color: g.color }
  else if (g.kind === "tint") to = { kind: "tint", part: id(parts, g.part) }
  else if (g.kind === "arrow") to = { kind: "arrow", anchor: id(anchors, g.anchor) }
  else if (g.kind === "label") to = { kind: "label", anchor: id(anchors, g.anchor), unit: g.unit }
  else to = { kind: "ghost", mate: id(mates, g.mate) }
  const parsed = BindingSchema.safeParse({
    id: newId<BindingId>(),
    from,
    to,
    scale: t.scale,
    offset: t.offset,
    ...(t.min !== undefined && { min: t.min }),
    ...(t.max !== undefined && { max: t.max }),
  })
  return parsed.success ? parsed.data : null
}

/** The bindings made on insert, and the instance's record of them by key. */
export function componentBindings(manifest: ComponentManifest, ids: InsertedIds) {
  const bindings: Binding[] = []
  const byKey: Record<string, BindingId> = {}
  for (const t of manifest.bindings ?? []) {
    const b = bindingOf(t, ids)
    if (!b) continue
    bindings.push(b)
    byKey[t.key] = b.id
  }
  return { bindings, byKey }
}

/** Slots still to fill: templates waiting for a part the user names. */
export const openSlots = (
  manifest: ComponentManifest | undefined,
  filled: Readonly<Record<string, string>>
): ComponentBinding[] =>
  (manifest?.bindings ?? []).filter(
    (t) => t.from.kind === "contactSlot" && !Object.hasOwn(filled, t.key)
  )
