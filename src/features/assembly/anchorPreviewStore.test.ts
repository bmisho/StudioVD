import { afterEach, describe, expect, it } from "vitest"
import { anchorFrame } from "@/core/assembly/anchorFrames"
import type { AnchorCandidate } from "@/core/assembly/snapCandidates"
import type { PartId } from "@/core/schema"
import { anchorPreview } from "./anchorPreviewStore"

const partId = "p" as PartId
/** A fresh but equal candidate each call, as every pointer move computes one. */
const edgeMid = (x: number): AnchorCandidate => ({
  snap: "edgeMid",
  kind: "point",
  frame: anchorFrame([x, 4, 0], [0, 1, 0]),
  source: { kind: "face", faceIndex: 0 },
  name: "Edge midpoint",
  hint: "Edge midpoint",
  feature: { type: "segment", a: [0, 4, 0], b: [10, 4, 0] },
})

afterEach(() => anchorPreview.set(null))

describe("anchor preview", () => {
  it("notifies only when the snap changes, keeping the snapped edge's object while it stays", () => {
    let calls = 0
    const unsubscribe = anchorPreview.subscribe(() => calls++)
    anchorPreview.set({ partId, candidate: edgeMid(5) })
    const first = anchorPreview.get()
    anchorPreview.set({ partId, candidate: edgeMid(5) }) // the same snap again
    expect([calls, anchorPreview.get()]).toEqual([1, first])
    anchorPreview.set({ partId, candidate: edgeMid(6) }) // another origin, the same edge
    expect(calls).toBe(2)
    expect(anchorPreview.get()?.candidate.feature).toBe(first?.candidate.feature)
    unsubscribe()
  })
})
