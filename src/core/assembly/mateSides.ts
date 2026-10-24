import type { MateId, PartId, SceneDocument } from "@/core/schema"

/** The parts that move together with one end of a mate, and whether any is grounded. */
export interface MateSide {
  parts: PartId[]
  grounded: boolean
}

type Doc = Pick<SceneDocument, "parts" | "anchors" | "mates">

/** Parts joined by mates in effect (not suppressed, both anchors present), `except` left out. */
export function mateAdjacency(doc: Doc, except?: MateId): Map<PartId, PartId[]> {
  const next = new Map<PartId, PartId[]>()
  const link = (from: PartId, to: PartId) => {
    const list = next.get(from)
    if (list) list.push(to)
    else next.set(from, [to])
  }
  for (const mate of Object.values(doc.mates)) {
    if (mate.suppressed || mate.id === except) continue
    const a = Object.hasOwn(doc.anchors, mate.anchorA) ? doc.anchors[mate.anchorA] : undefined
    const b = Object.hasOwn(doc.anchors, mate.anchorB) ? doc.anchors[mate.anchorB] : undefined
    if (!a || !b || a.partId === b.partId) continue
    link(a.partId, b.partId)
    link(b.partId, a.partId)
  }
  return next
}

/** Every part reachable from `start` through the adjacency (breadth first, `start` first). */
function reach(doc: Doc, adjacency: Map<PartId, PartId[]>, start: PartId): MateSide {
  const seen = new Set<PartId>([start])
  const queue = [start]
  for (let i = 0; i < queue.length; i++) {
    for (const other of adjacency.get(queue[i] ?? start) ?? []) {
      if (seen.has(other)) continue
      seen.add(other)
      queue.push(other)
    }
  }
  const grounded = queue.some((id) => Object.hasOwn(doc.parts, id) && doc.parts[id]?.grounded)
  return { parts: queue, grounded }
}

/**
 * The two ends of a mate between parts A and B, through the other mates in effect: what moves
 * with each part when it is snapped. `connected` when they are already joined (a loop).
 */
export function mateSides(doc: Doc, partA: PartId, partB: PartId, except?: MateId) {
  const adjacency = mateAdjacency(doc, except)
  const a = reach(doc, adjacency, partA)
  const connected = a.parts.includes(partB)
  const b = connected ? a : reach(doc, adjacency, partB)
  return { connected, a, b }
}
