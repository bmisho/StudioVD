import type { SceneDocument } from "@/core/schema"

export type SelectableKind = "group" | "part" | "anchor" | "mate" | "node"

export interface SelectionRef {
  kind: SelectableKind
  id: string
}

/** Whether the entity a selection item points at still exists in the document. */
export function entityExists(doc: SceneDocument, item: SelectionRef): boolean {
  switch (item.kind) {
    case "group":
      return Object.hasOwn(doc.groups, item.id)
    case "part":
      return Object.hasOwn(doc.parts, item.id)
    case "anchor":
      return Object.hasOwn(doc.anchors, item.id)
    case "mate":
      return Object.hasOwn(doc.mates, item.id)
    case "node":
      return Object.hasOwn(doc.schematic.nodes, item.id)
  }
}

/**
 * Drops selection items whose entity no longer exists (after undo/redo, delete, open).
 * Returns the same array instance when nothing changed, so subscribers don't re-render.
 */
export function pruneSelection<T extends SelectionRef>(doc: SceneDocument, selection: T[]): T[] {
  const kept = selection.filter((item) => entityExists(doc, item))
  return kept.length === selection.length ? selection : kept
}
