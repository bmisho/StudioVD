import type { RootState, ThreeEvent } from "@react-three/fiber"
import { describe, expect, it, vi } from "vitest"
import { anchorFrame } from "@/core/assembly/anchorFrames"
import { createTestRig } from "@/core/scene/testRig"
import type { PartId } from "@/core/schema"
import { useDocumentStore } from "@/store/document/documentStore"
import { resetStores } from "@/test/resetStores"
import type { AnchorPreview } from "./anchorPreviewStore"
import { clickAnchor } from "./anchorTool"

const preview = vi.hoisted(() => ({ current: null as AnchorPreview | null }))
vi.mock("./candidateFromHit", () => ({ candidateFromHit: () => preview.current }))

const click = (detail: number) =>
  ({
    nativeEvent: { type: "click", button: 0, detail, clientX: 10, clientY: 10 },
    delta: 0,
  }) as unknown as ThreeEvent<MouseEvent>

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
    clickAnchor(click(1), state)
    clickAnchor(click(2), state)
    expect(count()).toBe(before + 1)
  })
})
