import { useEffect, useState } from "react"
import { BoxGeometry, Line, type LineBasicMaterial } from "three"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { AnchorCandidate } from "@/core/assembly/snapCandidates"
import type { AnchorKind, Frame } from "@/core/schema"
import { AnchorGlyph } from "@/features/assembly/AnchorGlyph"
import { SnapFeatureLine } from "@/features/assembly/SnapFeatureLine"
import { demandRoot } from "@/test/demandRoot"
import { PartHighlight, type HighlightState } from "../highlight/PartHighlight"

vi.mock("@/features/viewport/theme/sceneTokens", async () => {
  const { flatSceneTokens } = await import("@/test/demandRoot")
  return { readSceneTokens: flatSceneTokens }
})

// R3F requests a frame when objects are added or changed, not when they are removed: each of
// these would stay drawn in the demand frameloop until something else redrew.
const roots: Awaited<ReturnType<typeof demandRoot>>[] = []
afterEach(async () => {
  for (const r of roots.splice(0)) await r.unmount()
})
/** The scene in a demand root, and the setters that change it. */
async function root() {
  let set: Controls | undefined
  const r = await demandRoot(<Scene controls={(c) => (set = c)} />)
  roots.push(r)
  if (!set) throw new Error("the scene did not mount")
  return { ...r, set }
}

interface Controls {
  state: (s: HighlightState) => void
  kind: (k: AnchorKind) => void
  shown: (v: boolean) => void
}
// The same objects every render: only the change under test reaches the components.
const box = new BoxGeometry(10, 10, 10)
const FRAME: Frame = { originMm: [0, 0, 0], z: [0, 0, 1], x: [1, 0, 0] }
const SEGMENT: NonNullable<AnchorCandidate["feature"]> = {
  type: "segment",
  a: [0, 0, 0],
  b: [10, 0, 0],
}

function Scene({ controls }: { controls: (c: Controls) => void }) {
  const [state, setState] = useState<HighlightState>("hover")
  const [kind, setKind] = useState<AnchorKind>("planar")
  const [shown, setShown] = useState(true)
  useEffect(() => {
    controls({ state: setState, kind: setKind, shown: setShown })
  }, [controls])
  return (
    <>
      <PartHighlight geometry={box} state={state} />
      {shown && <AnchorGlyph frame={FRAME} kind={kind} />}
      {shown && <SnapFeatureLine feature={SEGMENT} />}
    </>
  )
}

describe("objects removed from the 3D view request a frame", () => {
  it("a part's hover outline when the cursor leaves it", async () => {
    const r = await root()
    expect(await r.framesRequested(() => r.set.state("none"))).toBeGreaterThan(0)
  })

  it("an anchor glyph's plate when its kind changes, and the glyph and snap line going", async () => {
    const r = await root()
    expect(await r.framesRequested(() => r.set.kind("point"))).toBeGreaterThan(0)
    expect(await r.framesRequested(() => r.set.shown(false))).toBeGreaterThan(0)
  })

  it("the snap line draws in the last (transparent) pass, after every part", async () => {
    const r = await root()
    const transparent: boolean[] = []
    r.store.getState().scene.traverse((o) => {
      if (o instanceof Line) transparent.push((o.material as LineBasicMaterial).transparent)
    })
    expect(transparent).toEqual([true])
  })
})
