import type {
  AnchorId,
  AssetId,
  BindingId,
  CouplingId,
  GroupId,
  MateId,
  PartId,
  SceneDocument,
} from "@/core/schema"
import type { SelectionRef } from "./selection"

type Doc = Pick<
  SceneDocument,
  "parts" | "groups" | "anchors" | "mates" | "couplings" | "bindings" | "assets"
>

export interface PartDeletion {
  parts: PartId[]
  anchors: AnchorId[]
  mates: MateId[]
  couplings: CouplingId[]
  bindings: BindingId[]
  /** Assets no remaining part uses (undo brings them back with their parts). */
  assets: AssetId[]
}

/**
 * Everything that goes when these parts are deleted: their anchors, mates on those anchors,
 * couplings on those mates, bindings that name any of them, and assets left unused. The
 * document never keeps a dangling reference (scene.json must always validate).
 */
export function partDeletion(doc: Doc, ids: readonly PartId[]): PartDeletion {
  const parts = new Set(ids.filter((id) => Object.hasOwn(doc.parts, id)))
  const anchors = Object.values(doc.anchors)
    .filter((a) => parts.has(a.partId))
    .map((a) => a.id)
  const { mates, couplings, bindings } = anchorDependents(doc, anchors, parts)
  const used = new Set(
    Object.values(doc.parts)
      .filter((p) => !parts.has(p.id))
      .map((p) => p.assetId)
  )
  const assets = [...new Set(Object.values(doc.parts).map((p) => p.assetId))].filter(
    (a) => !used.has(a) && [...parts].some((id) => doc.parts[id]?.assetId === a)
  )
  return { parts: [...parts], anchors, mates, couplings, bindings, assets }
}

/** Everything that goes with these anchors (PLAN 7.4): the mates on them, and so on. */
export function anchorDeletion(doc: Doc, ids: readonly AnchorId[]) {
  const anchors = [...new Set(ids.filter((id) => Object.hasOwn(doc.anchors, id)))]
  return { anchors, ...anchorDependents(doc, anchors, new Set()) }
}

/** Everything that goes with these mates: the couplings on them and bindings naming them. */
export function mateDeletion(doc: Doc, ids: readonly MateId[]) {
  const mates = [...new Set(ids.filter((id) => Object.hasOwn(doc.mates, id)))]
  return { mates, ...mateDependents(doc, mates, new Set()) }
}

/** Mates on the anchors, couplings on those mates, bindings naming any of them (or `alsoGone`). */
function anchorDependents(doc: Doc, ids: readonly AnchorId[], alsoGone: ReadonlySet<string>) {
  const anchors = new Set(ids)
  const mates = Object.values(doc.mates)
    .filter((m) => anchors.has(m.anchorA) || anchors.has(m.anchorB))
    .map((m) => m.id)
  return { mates, ...mateDependents(doc, mates, new Set([...alsoGone, ...anchors])) }
}

/** Couplings on the mates, and bindings naming any of them (or `alsoGone`). */
function mateDependents(doc: Doc, mates: readonly MateId[], alsoGone: ReadonlySet<string>) {
  const gone = new Set<string>([...alsoGone, ...mates])
  const couplings = Object.values(doc.couplings)
    .filter((c) => gone.has(c.mateA) || gone.has(c.mateB))
    .map((c) => c.id)
  const bindings = Object.values(doc.bindings)
    .filter((b) => gone.has(b.from.ref) || gone.has(b.to.ref))
    .map((b) => b.id)
  return { couplings, bindings }
}

const parentOf = (doc: Pick<Doc, "parts" | "groups">, item: SelectionRef): GroupId | null => {
  if (item.kind === "part") return doc.parts[item.id as PartId]?.parentId ?? null
  if (item.kind === "group") return doc.groups[item.id as GroupId]?.parentId ?? null
  return null
}

/** Whether `group` is `ancestor` or lies below it (parent cycles terminate). */
function isWithin(doc: Pick<Doc, "groups">, group: GroupId | null, ancestor: GroupId): boolean {
  const seen = new Set<GroupId>()
  for (let g = group; g !== null && !seen.has(g); g = doc.groups[g]?.parentId ?? null) {
    if (g === ancestor) return true
    seen.add(g)
  }
  return false
}

/**
 * The parts and groups to move into a new group: selected items that exist and are not
 * already inside another selected group (moving those would flatten the hierarchy).
 */
export function topLevelItems(
  doc: Pick<Doc, "parts" | "groups">,
  items: readonly SelectionRef[]
): SelectionRef[] {
  const exists = (i: SelectionRef) =>
    (i.kind === "part" && Object.hasOwn(doc.parts, i.id)) ||
    (i.kind === "group" && Object.hasOwn(doc.groups, i.id))
  const live = items.filter(exists)
  const groups = live.flatMap((i) => (i.kind === "group" ? [i.id as GroupId] : []))
  return live.filter((item) => {
    const parent = parentOf(doc, item)
    return !groups.some((g) => g !== item.id && isWithin(doc, parent, g))
  })
}

/** Where a new group wrapping `items` goes: their shared parent, else the root. */
export function commonParent(
  doc: Pick<Doc, "parts" | "groups">,
  items: readonly SelectionRef[]
): GroupId | null {
  const parents = new Set(items.map((i) => parentOf(doc, i)))
  return parents.size === 1 ? ([...parents][0] ?? null) : null
}
