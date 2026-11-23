import type { AnchorId, SceneDocument } from "@/core/schema"

const KIND_NAMES = { point: "point", planar: "face", axial: "axis" } as const

/** How a route list names an anchor: its part, then its own name or its kind. */
export function anchorLabel(doc: Pick<SceneDocument, "anchors" | "parts">, id: AnchorId): string {
  const a = Object.hasOwn(doc.anchors, id) ? doc.anchors[id] : undefined
  if (!a) return "Missing anchor"
  const part = Object.hasOwn(doc.parts, a.partId) ? doc.parts[a.partId]?.name : undefined
  return `${part ?? "?"} · ${a.name ?? KIND_NAMES[a.kind]}`
}

/** Anchors a cable could pass through next: every anchor not already on its route, by label. */
export function waypointChoices(
  doc: Pick<SceneDocument, "anchors" | "parts">,
  route: readonly AnchorId[]
): { id: AnchorId; label: string }[] {
  const used = new Set(route)
  return Object.keys(doc.anchors)
    .map((id) => id as AnchorId)
    .filter((id) => !used.has(id))
    .map((id) => ({ id, label: anchorLabel(doc, id) }))
    .sort((a, b) => a.label.localeCompare(b.label))
}
