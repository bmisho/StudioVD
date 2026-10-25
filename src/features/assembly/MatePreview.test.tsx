import { act } from "react"
import { Mesh } from "three"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestRig } from "@/core/scene/testRig"
import { assetCache } from "@/features/viewport/parts/assetCache"
import { useDocumentStore } from "@/store/document/documentStore"
import { useSessionStore } from "@/store/session/sessionStore"
import { demandRoot } from "@/test/demandRoot"
import { resetStores } from "@/test/resetStores"
import { MatePreview } from "./MatePreview"

vi.mock("@/features/viewport/theme/sceneTokens", async () => {
  const { flatSceneTokens } = await import("@/test/demandRoot")
  return { readSceneTokens: flatSceneTokens }
})

/** The rig without its hinge, its two anchors picked: applying would move the leaf. */
function setup() {
  const rig = createTestRig()
  useDocumentStore.getState().insertEntities({ ...rig, mates: [] })
  const [a, b] = rig.anchors
  const leaf = rig.parts[1]
  if (!a || !b || !leaf) throw new Error("rig incomplete")
  useSessionStore.getState().setTool("mate")
  const draft = { anchorA: a.id, anchorB: b.id, type: "revolute", flip: false } as const
  return { leaf, pick: (angleOffsetRad = 0) => ({ ...draft, angleOffsetRad }) }
}

const cleanups: (() => unknown)[] = []
beforeEach(resetStores)
afterEach(async () => {
  for (const c of cleanups.splice(0)) await c()
  vi.restoreAllMocks()
})

describe("MatePreview (tool review)", () => {
  it("draws the moved part's ghost, asking for its mesh, and a frame each time it changes", async () => {
    const { leaf, pick } = setup()
    const request = vi.spyOn(assetCache, "request")
    const r = await demandRoot(<MatePreview />)
    cleanups.push(r.unmount)
    const ghosts = () => {
      let n = 0
      r.store.getState().scene.traverse((o) => void (o instanceof Mesh && n++))
      return n
    }
    const set = (d: ReturnType<typeof pick> | null) => useSessionStore.getState().setMateDraft(d)
    expect(await r.framesRequested(() => set(pick()))).toBeGreaterThan(0)
    expect(ghosts()).toBe(1)
    expect(request).toHaveBeenCalledWith(leaf.assetId)
    expect(await r.framesRequested(() => set(pick(1)))).toBeGreaterThan(0) // turned
    expect(await r.framesRequested(() => set(null))).toBeGreaterThan(0) // gone
    expect(ghosts()).toBe(0)
  })

  it("draws no ghost for a hidden part (it would show what Hide took away)", async () => {
    const { leaf, pick } = setup()
    act(() => useDocumentStore.getState().setPartsVisible([leaf.id], false))
    const r = await demandRoot(<MatePreview />)
    cleanups.push(r.unmount)
    await r.framesRequested(() => useSessionStore.getState().setMateDraft(pick()))
    let meshes = 0
    r.store.getState().scene.traverse((o) => void (o instanceof Mesh && meshes++))
    expect(meshes).toBe(0)
  })
})
