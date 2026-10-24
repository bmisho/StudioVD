import { act } from "react"
import { Group } from "three"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { anchorFrame } from "@/core/assembly/anchorFrames"
import type { AnchorCandidate } from "@/core/assembly/snapCandidates"
import type { PartId } from "@/core/schema"
import { registerPartObject } from "@/features/viewport/parts/partObjects"
import { useSessionStore } from "@/store/session/sessionStore"
import { demandRoot, settle } from "@/test/demandRoot"
import { resetStores } from "@/test/resetStores"
import { AnchorPreview } from "./AnchorPreview"
import { anchorPreview } from "./anchorPreview"

vi.mock("@/features/viewport/theme/sceneTokens", async () => {
  const { flatSceneTokens } = await import("@/test/demandRoot")
  return { readSceneTokens: flatSceneTokens }
})

const part = "6a1d0b52-1f33-4a8e-9c2b-1b0f0e5c9a01" as PartId
const other = "6a1d0b52-1f33-4a8e-9c2b-1b0f0e5c9a02" as PartId
const candidate: AnchorCandidate = {
  snap: "face",
  kind: "planar",
  frame: anchorFrame([0, 4, 0], [0, 1, 0]),
  source: { kind: "manual" },
  name: "Face",
  hint: "Face",
  feature: { type: "segment", a: [0, 4, 0], b: [10, 4, 0] },
}

/** Sets the preview as a pointer move does, and lets the 3D view commit it. */
async function show(preview: Parameters<typeof anchorPreview.set>[0]) {
  act(() => anchorPreview.set(preview))
  await settle()
}

const cleanups: (() => unknown)[] = []
beforeEach(() => {
  resetStores()
  anchorPreview.set(null)
})
afterEach(async () => {
  for (const c of cleanups.splice(0)) await c()
})

describe("AnchorPreview", () => {
  it("draws on its own part only, and leaves nothing subscribed as the cursor comes and goes", async () => {
    // Place Anchor on, and the part's group registered as PartView does (where an R3F
    // portal would draw into).
    useSessionStore.getState().setTool("anchor")
    cleanups.push(registerPartObject(part, new Group()))
    const r = await demandRoot(<AnchorPreview partId={part} />)
    cleanups.push(r.unmount)
    const objects = () => {
      let n = 0
      r.store.getState().scene.traverse(() => void n++)
      return n
    }
    const empty = objects()
    for (let i = 0; i < 5; i++) {
      await show({ partId: part, candidate: { ...candidate } })
      await show(null)
    }
    expect(r.subscriptions()).toBe(0)

    await show({ partId: other, candidate })
    expect(objects()).toBe(empty)
    await show({ partId: part, candidate })
    expect(objects()).toBeGreaterThan(empty) // the glyph and the snapped edge
  })
})
