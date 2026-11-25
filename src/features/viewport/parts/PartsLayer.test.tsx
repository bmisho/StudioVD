import { act } from "react"
import { Mesh } from "three"
import { afterEach, describe, expect, it, vi } from "vitest"
import { MAX_GLYPHS } from "@/core/assembly/glyphPlan"
import { createTestRig } from "@/core/scene/testRig"
import type { Anchor, AnchorId, PartId } from "@/core/schema"
import { glyphParts } from "@/features/assembly/glyphParts"
import { useDocumentStore } from "@/store/document/documentStore"
import { usePreferencesStore } from "@/store/preferences/preferencesStore"
import { useSessionStore, type MateDraft } from "@/store/session/sessionStore"
import { demandRoot, settle } from "@/test/demandRoot"
import { resetStores } from "@/test/resetStores"
import { ViewportContext } from "../ViewportContext"
import { PartsLayer } from "./PartsLayer"

vi.mock("@/features/viewport/theme/sceneTokens", async () => {
  const { flatSceneTokens } = await import("@/test/demandRoot")
  return { readSceneTokens: flatSceneTokens }
})

const roots: Awaited<ReturnType<typeof demandRoot>>[] = []
afterEach(async () => {
  for (const r of roots.splice(0)) await r.unmount()
})

/** The test rig's parts, with `n` more anchors on its base part. */
async function mount(n: number) {
  resetStores()
  const rig = createTestRig()
  useDocumentStore.getState().insertEntities(rig)
  const base = rig.parts[0]?.id as PartId
  const doc = useDocumentStore.getState().doc
  const extra: Record<AnchorId, Anchor> = {}
  for (let i = 0; i < n; i++) {
    const id = crypto.randomUUID() as AnchorId
    extra[id] = {
      id,
      partId: base,
      kind: "point",
      frame: { originMm: [i, 0, 0], z: [0, 0, 1], x: [1, 0, 0] },
      source: { kind: "manual" },
    }
  }
  useDocumentStore.setState({ doc: { ...doc, anchors: { ...doc.anchors, ...extra } } })
  const ctx = { rig: {} as never, partsRoot: { current: null }, partGrab: { current: null } }
  const r = await demandRoot(
    <ViewportContext value={ctx}>
      <PartsLayer />
    </ViewportContext>
  )
  roots.push(r)
  const dots = () => {
    let count = 0
    r.store.getState().scene.traverse((o) => {
      if (o instanceof Mesh && o.geometry === glyphParts().geometry.dot) count++
    })
    return count
  }
  return { r, base, ids: Object.keys(extra) as AnchorId[], dots }
}

describe("PartsLayer anchor glyphs", () => {
  it("draws at most MAX_GLYPHS, the selected anchor always among them", async () => {
    const { base, ids, dots } = await mount(2 * MAX_GLYPHS)
    expect(dots()).toBe(0) // nothing selected, no tool: no glyphs
    act(() => usePreferencesStore.getState().setShowSelectionAnchors(true))
    act(() => useSessionStore.getState().select([{ kind: "part", id: base }]))
    await settle()
    expect(dots()).toBe(MAX_GLYPHS)
    const last = ids.at(-1) as AnchorId
    act(() => useSessionStore.getState().select([{ kind: "anchor", id: last }]))
    await settle()
    expect(dots()).toBe(MAX_GLYPHS)
  })

  it("reads all anchors once per document change, not once per part", async () => {
    const { r } = await mount(10)
    act(() => useSessionStore.getState().setTool("anchor")) // every part shows its anchors
    await settle()
    let reads = 0
    const doc = useDocumentStore.getState().doc
    const anchors = new Proxy(doc.anchors, {
      ownKeys: (target) => {
        reads++
        return Reflect.ownKeys(target)
      },
    })
    await r.framesRequested(() => useDocumentStore.setState({ doc: { ...doc, anchors } }))
    expect(reads).toBe(1)
  })

  it("requests a frame when the Mate tool's pick draws a glyph larger, and back (tool review)", async () => {
    const { r } = await mount(0)
    act(() => useSessionStore.getState().setTool("mate")) // every part shows its anchors
    await settle()
    const [hinge] = Object.keys(useDocumentStore.getState().doc.anchors) as AnchorId[]
    if (!hinge) throw new Error("rig incomplete")
    const pick: MateDraft = {
      anchorA: hinge,
      anchorB: null,
      type: "revolute",
      flip: false,
      angleOffsetRad: 0,
    }
    const set = (d: typeof pick | null) => useSessionStore.getState().setMateDraft(d)
    expect(await r.framesRequested(() => set(pick))).toBeGreaterThan(0)
    expect(await r.framesRequested(() => set(null))).toBeGreaterThan(0)
  })
})
