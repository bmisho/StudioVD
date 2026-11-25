import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import { createTestRig } from "@/core/scene/testRig"
import type { PartId } from "@/core/schema"
import { useDocumentStore } from "@/store/document/documentStore"
import { usePreferencesStore } from "@/store/preferences/preferencesStore"
import { useSessionStore } from "@/store/session/sessionStore"
import { resetStores } from "@/test/resetStores"
import { SELECTED_MARK, SUGGESTED_MARK, useAnchorGlyphs } from "./useAnchorGlyphs"

const none = new Set<string>()

function setup() {
  const rig = createTestRig()
  useDocumentStore.getState().insertEntities(rig)
  const mounted = rig.parts.map<PartId>((p) => p.id)
  return { rig, mounted }
}

describe("anchor glyph plan", () => {
  beforeEach(resetStores)

  it("shows a selected mate's two anchors, drawn selected (PLAN 8.5)", () => {
    const { rig, mounted } = setup()
    const { result } = renderHook(() => useAnchorGlyphs(mounted, none))
    expect(result.current.size).toBe(0) // nothing selected, no tool: no glyphs
    const hinge = rig.mates[0]
    if (!hinge) throw new Error("rig incomplete")
    act(() => useSessionStore.getState().select([{ kind: "mate", id: hinge.id }]))
    const shown = [...result.current.values()]
    expect(shown.sort()).toEqual(
      [SELECTED_MARK + hinge.anchorA, SELECTED_MARK + hinge.anchorB].sort()
    )
  })

  it("draws a selected part's anchors only when asked to (0.2.1: they read as being placed)", () => {
    const { rig, mounted } = setup()
    const [onBase] = rig.anchors
    if (!onBase) throw new Error("rig incomplete")
    const selectedPart = new Set<string>([onBase.partId])
    const { result } = renderHook(() => useAnchorGlyphs(mounted, selectedPart))
    expect(result.current.size).toBe(0) // the part is selected: still no glyphs
    act(() => usePreferencesStore.getState().setShowSelectionAnchors(true))
    expect(result.current.get(onBase.partId)).toContain(onBase.id)
    act(() => usePreferencesStore.getState().setShowSelectionAnchors(false))
    // Selecting the anchor itself always draws it (and its part's other anchors).
    act(() => useSessionStore.getState().select([{ kind: "anchor", id: onBase.id }]))
    expect(result.current.get(onBase.partId)).toContain(SELECTED_MARK + onBase.id)
  })

  it("while the Mate tool waits for its second pick, marks anchors whose tags fit the first", () => {
    const { rig, mounted } = setup()
    const [onBase, onLeaf] = rig.anchors
    if (!onBase || !onLeaf) throw new Error("rig incomplete")
    act(() => {
      useDocumentStore.getState().updateAnchor(onBase.id, { interface: "shaft-8mm" })
      useDocumentStore.getState().updateAnchor(onLeaf.id, { interface: "bore-8mm" })
      useSessionStore.getState().setTool("mate")
      useSessionStore.getState().setMateDraft({
        anchorA: onBase.id,
        anchorB: null,
        type: "revolute",
        flip: false,
        angleOffsetRad: 0,
      })
    })
    const { result } = renderHook(() => useAnchorGlyphs(mounted, none))
    expect(result.current.get(onBase.partId)).toBe(SELECTED_MARK + onBase.id)
    expect(result.current.get(onLeaf.partId)).toBe(SUGGESTED_MARK + onLeaf.id)
  })

  it("while mating, draws only the tool's picks selected, not the selection's (tool review)", () => {
    const { rig, mounted } = setup()
    const [hinge] = rig.mates
    const [onBase] = rig.anchors
    if (!hinge || !onBase) throw new Error("rig incomplete")
    act(() => {
      useSessionStore.getState().select([{ kind: "mate", id: hinge.id }]) // the one just applied
      useSessionStore.getState().setTool("mate")
      useSessionStore.getState().setMateDraft({
        anchorA: onBase.id,
        anchorB: null,
        type: "revolute",
        flip: false,
        angleOffsetRad: 0,
      })
    })
    const { result } = renderHook(() => useAnchorGlyphs(mounted, none))
    const marked = [...result.current.values()]
      .flatMap((ids) => ids.split(","))
      .filter((id) => id.startsWith(SELECTED_MARK))
    expect(marked).toEqual([SELECTED_MARK + onBase.id])
  })
})
