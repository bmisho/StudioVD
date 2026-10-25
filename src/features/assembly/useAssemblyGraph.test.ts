import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import { createTestRig } from "@/core/scene/testRig"
import { useDocumentStore } from "@/store/document/documentStore"
import { resetStores } from "@/test/resetStores"
import { useAssemblyGraph } from "./useAssemblyGraph"

describe("useAssemblyGraph (security review)", () => {
  beforeEach(resetStores)

  it("keeps its graph through a rename, and makes a new one when a part moves", () => {
    const rig = createTestRig()
    useDocumentStore.getState().insertEntities(rig)
    const leaf = rig.parts[1]
    if (!leaf) throw new Error("rig incomplete")
    const { result } = renderHook(() => useAssemblyGraph())
    const first = result.current
    act(() => useDocumentStore.getState().renamePart(leaf.id, "Flap"))
    expect(result.current).toBe(first)
    act(() =>
      useDocumentStore
        .getState()
        .setPartPose(leaf.id, { positionMm: [0, 300, 0], quaternion: [0, 0, 0, 1] })
    )
    expect(result.current).not.toBe(first)
  })
})
