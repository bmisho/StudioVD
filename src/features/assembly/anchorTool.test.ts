import type { RootState, ThreeEvent } from "@react-three/fiber"
import { describe, expect, it, vi } from "vitest"
import { anchorFrame } from "@/core/assembly/anchorFrames"
import { createTestRig } from "@/core/scene/testRig"
import type { PartId } from "@/core/schema"
import { useDocumentStore } from "@/store/document/documentStore"
import { startAnchorTarget, useAnchorTarget } from "@/store/session/anchorTargetStore"
import { useSessionStore } from "@/store/session/sessionStore"
import { resetStores } from "@/test/resetStores"
import type { AnchorPreview } from "./anchorPreviewStore"
import { clickAnchor } from "./anchorTool"

const preview = vi.hoisted(() => ({ current: null as AnchorPreview | null }))
vi.mock("./candidateFromHit", () => ({ candidateFromHit: () => preview.current }))

const click = (detail: number, shiftKey = false) =>
  ({
    nativeEvent: { type: "click", button: 0, detail, clientX: 10, clientY: 10, shiftKey },
    intersections: [],
    delta: 0,
  }) as unknown as ThreeEvent<MouseEvent>

/** The tool snapped to a face of `partId` at `y` mm. */
const faceAt = (partId: PartId, y: number): AnchorPreview => ({
  partId,
  candidate: {
    snap: "face",
    kind: "planar",
    frame: anchorFrame([0, y, 0], [0, 1, 0]),
    source: { kind: "face", faceIndex: 0 },
    name: "Face",
    hint: "Face",
    feature: null,
  },
})

function rigged() {
  resetStores()
  const rig = createTestRig()
  useDocumentStore.getState().insertEntities(rig)
  const [a, b] = rig.anchors
  if (!a || !b) throw new Error("rig incomplete")
  return { rig, a, b }
}

const doc = () => useDocumentStore.getState().doc
const undoSteps = () => useDocumentStore.temporal.getState().pastStates.length

describe("Place Anchor clicks", () => {
  it("place one anchor per click, none for a double click's second", () => {
    resetStores()
    const rig = createTestRig()
    useDocumentStore.getState().insertEntities(rig)
    preview.current = {
      partId: rig.parts[0]?.id as PartId,
      candidate: {
        snap: "face",
        kind: "planar",
        frame: anchorFrame([0, 4, 0], [0, 1, 0]),
        source: { kind: "manual" },
        name: "Face",
        hint: "Face",
        feature: null,
      },
    }
    const count = () => Object.keys(useDocumentStore.getState().doc.anchors).length
    const before = count()
    const state = {} as RootState
    clickAnchor(click(1, true), state)
    clickAnchor(click(2, true), state)
    expect(count()).toBe(before + 1)
  })

  it("goes back to Select after placing one, unless Shift is held (0.2.1)", () => {
    const { a } = rigged()
    const count = () => Object.keys(doc().anchors).length
    const before = count()
    preview.current = faceAt(a.partId, 3)
    useSessionStore.getState().setTool("anchor")
    clickAnchor(click(1, true), {} as RootState)
    expect(useSessionStore.getState().activeTool).toBe("anchor")
    clickAnchor(click(1), {} as RootState)
    expect(count()).toBe(before + 2)
    expect(useSessionStore.getState().activeTool).toBe("select")
    const [last] = useSessionStore.getState().selection
    expect(last?.kind).toBe("anchor")
  })

  it("places an anchor again on its own part only, keeping it (and its mates), then stops", () => {
    const { rig, a } = rigged()
    const other = rig.parts.find((p) => p.id !== a.partId)?.id as PartId
    startAnchorTarget({ kind: "move", anchor: a.id })
    expect(useSessionStore.getState().activeTool).toBe("anchor")
    const anchorsBefore = Object.keys(doc().anchors).length
    preview.current = faceAt(other, 7)
    clickAnchor(click(1), {} as RootState)
    expect(doc().anchors[a.id]?.frame).toEqual(a.frame) // another part: refused
    preview.current = faceAt(a.partId, 7)
    clickAnchor(click(1), {} as RootState)
    expect(doc().anchors[a.id]?.frame.originMm).toEqual([0, 7, 0])
    expect(doc().anchors[a.id]?.source).toEqual({ kind: "face", faceIndex: 0 })
    expect(Object.keys(doc().anchors)).toHaveLength(anchorsBefore)
    expect(Object.keys(doc().mates)).toHaveLength(rig.mates.length)
    expect(useSessionStore.getState().selection).toEqual([{ kind: "anchor", id: a.id }])
    expect(useSessionStore.getState().activeTool).toBe("select")
    expect(useAnchorTarget.getState().target).toBeNull()
  })

  it("lays a cable's waypoints in the order clicked, one undo step each", () => {
    const { a, b } = rigged()
    const cable = useDocumentStore.getState().addConnector("cable", [a.id, b.id])
    if (!cable) throw new Error("no cable")
    startAnchorTarget({ kind: "route", cable })
    const via = () => {
      const c = doc().connectors[cable]
      return c?.kind === "cable" ? c.via : []
    }
    const steps = undoSteps()
    for (const y of [3, 9]) {
      preview.current = faceAt(a.partId, y)
      clickAnchor(click(1), {} as RootState)
    }
    expect(via().map((id) => doc().anchors[id]?.frame.originMm[1])).toEqual([3, 9])
    expect(via().map((id) => doc().anchors[id]?.name)).toEqual(["Waypoint", "Waypoint 2"])
    expect(undoSteps()).toBe(steps + 2)
    expect(useSessionStore.getState().activeTool).toBe("anchor") // still routing
    useSessionStore.getState().setTool("select") // Escape: routing ends with the tool
    expect(useAnchorTarget.getState().target).toBeNull()
  })
})
