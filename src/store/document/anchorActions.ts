import { flipFrame, plainFrame } from "@/core/assembly/anchorFrames"
import { anchorDeletion } from "@/core/scene/partOps"
import {
  AnchorSchema,
  COLLECTION_CAPS,
  newId,
  type Anchor,
  type AnchorId,
  type AnchorKind,
  type AnchorSource,
  type Frame,
  type PartId,
} from "@/core/schema"
import { deepEqual } from "@/core/util/deepEqual"
import type { Get, Set } from "./actionTypes"
import { removeAnchors } from "./deletion"

export interface NewAnchor {
  partId: PartId
  kind: AnchorKind
  frame: Frame
  source: AnchorSource
  name?: string
}

/** What the inspector changes. `null` (or an empty text) clears the name or interface tag. */
export interface AnchorPatch {
  name?: string | null
  interface?: string | null
  kind?: AnchorKind
  frame?: Frame
}

export interface AnchorActions {
  /**
   * Adds an anchor to a part (PLAN 7.1). Null when the part is gone (undone meanwhile), the
   * anchor would not validate, or the project holds as many anchors as a file may.
   */
  addAnchor: (anchor: NewAnchor) => AnchorId | null
  /** Changes an anchor; a result the schema would refuse, or no change, is ignored. */
  updateAnchor: (id: AnchorId, patch: AnchorPatch) => void
  /** Turns an anchor over: z reversed (a face-to-face mate then becomes face-to-back). */
  flipAnchor: (id: AnchorId) => void
  /** Deletes anchors with the mates on them, their couplings and bindings (PLAN 7.4). */
  deleteAnchors: (ids: readonly AnchorId[]) => void
}

/** Optional texts: trimmed, and absent when empty. */
function withText(anchor: Anchor, key: "name" | "interface", value: string | null | undefined) {
  if (value === undefined) return anchor
  const next = { ...anchor }
  delete next[key]
  const text = value?.trim() ?? ""
  return text === "" ? next : { ...next, [key]: text }
}

export function anchorActions(set: Set, get: Get): AnchorActions {
  const anchorOf = (id: AnchorId) =>
    Object.hasOwn(get().doc.anchors, id) ? get().doc.anchors[id] : undefined
  const replace = (next: Anchor) => {
    const current = anchorOf(next.id)
    const parsed = AnchorSchema.safeParse(next)
    if (!current || !parsed.success || deepEqual(parsed.data, current)) return
    set((s) => {
      s.doc.anchors[next.id] = parsed.data
    })
  }

  return {
    addAnchor: (input) => {
      const doc = get().doc
      if (!Object.hasOwn(doc.parts, input.partId)) return null
      if (Object.keys(doc.anchors).length >= COLLECTION_CAPS.anchors) return null
      const id = newId<AnchorId>()
      const anchor = { ...input, id, frame: plainFrame(input.frame) }
      const parsed = AnchorSchema.safeParse(withText(anchor, "name", input.name))
      if (!parsed.success) return null
      set((s) => {
        s.doc.anchors[id] = parsed.data
      })
      return id
    },

    updateAnchor: (id, patch) => {
      const current = anchorOf(id)
      if (!current) return
      let next: Anchor = {
        ...current,
        ...(patch.kind ? { kind: patch.kind } : {}),
        ...(patch.frame ? { frame: plainFrame(patch.frame) } : {}),
      }
      next = withText(next, "name", patch.name)
      next = withText(next, "interface", patch.interface)
      replace(next)
    },

    flipAnchor: (id) => {
      const current = anchorOf(id)
      if (current) replace({ ...current, frame: flipFrame(current.frame) })
    },

    deleteAnchors: (ids) => {
      if (anchorDeletion(get().doc, ids).anchors.length > 0) set((s) => removeAnchors(s.doc, ids))
    },
  }
}
