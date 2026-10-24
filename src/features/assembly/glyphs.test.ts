import type { RootState } from "@react-three/fiber"
import { Group, OrthographicCamera, PerspectiveCamera, type Camera } from "three"
import { afterEach, describe, expect, it } from "vitest"
import type { AnchorId } from "@/core/schema"
import { anchorAt, ANCHOR_PICK_PX, attachGlyphView, registerGlyph, scaleGlyphs } from "./glyphs"

/** A 500 x 500 px canvas at the page's origin, seen through `camera`. */
function view(camera: Camera): RootState {
  camera.updateMatrixWorld()
  const domElement = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 500, height: 500 }) }
  return { camera, size: { width: 500, height: 500 }, gl: { domElement } } as unknown as RootState
}

const cleanups: (() => void)[] = []
afterEach(() => cleanups.splice(0).forEach((c) => c()))

function glyphAt(x: number, y: number, z: number, anchor: AnchorId | null, parent = new Group()) {
  const g = new Group()
  g.position.set(x, y, z)
  parent.add(g)
  parent.updateMatrixWorld(true)
  cleanups.push(registerGlyph(g, anchor))
  return g
}

describe("anchor glyphs", () => {
  it("are one world unit per CSS pixel where they stand (perspective and orthographic)", () => {
    const persp = new PerspectiveCamera(50, 1, 1, 1000)
    persp.position.set(0, 0, 100)
    const near = glyphAt(0, 0, 0, null)
    const far = glyphAt(0, 0, -100, null)
    scaleGlyphs(view(persp))
    const perPx = (depth: number) => (2 * depth * Math.tan((25 * Math.PI) / 180)) / 500
    expect(near.scale.x).toBeCloseTo(perPx(100), 9)
    expect(far.scale.x).toBeCloseTo(perPx(200), 9)

    const ortho = new OrthographicCamera(-50, 50, 50, -50, 1, 1000)
    ortho.zoom = 2
    ortho.position.set(0, 0, 100)
    ortho.updateProjectionMatrix()
    scaleGlyphs(view(ortho))
    expect([near.scale.x, far.scale.x]).toEqual([0.1, 0.1]) // 100 mm / 2 / 500 px
  })

  it("pick the anchor nearest a click within a few pixels, never a hidden one or the preview", () => {
    const camera = new PerspectiveCamera(50, 1, 1, 1000)
    camera.position.set(0, 0, 100)
    const get = view(camera)
    cleanups.push(attachGlyphView(() => get))
    const a = "a" as AnchorId
    const b = "b" as AnchorId
    glyphAt(0, 0, 0, a) // the centre of the canvas: (250, 250)
    glyphAt(0, 0, 0, null) // a preview at the same place: not an anchor
    const hiddenPart = new Group()
    hiddenPart.visible = false
    glyphAt(1, 0, 0, b, hiddenPart)
    expect(anchorAt(252, 251)).toBe(a)
    expect(anchorAt(250 + ANCHOR_PICK_PX + 1, 250)).toBeNull()
    hiddenPart.visible = true
    expect(anchorAt(262, 250)).toBe(b) // 1 mm right of a is ~10.7 px at this distance
  })

  it("never pick an anchor that is clipped: behind an orthographic camera, before the near plane", () => {
    const ortho = new OrthographicCamera(-50, 50, 50, -50, 1, 1000)
    ortho.position.set(0, 0, 100)
    ortho.updateProjectionMatrix()
    const get = view(ortho)
    cleanups.push(attachGlyphView(() => get))
    const behind = "behind" as AnchorId
    glyphAt(0, 0, 150, behind) // 50 mm behind the camera, on its axis
    expect(anchorAt(250, 250)).toBeNull()

    const persp = new PerspectiveCamera(50, 1, 1, 1000)
    persp.position.set(0, 0, 100)
    const viewP = view(persp)
    cleanups.push(attachGlyphView(() => viewP))
    glyphAt(0, 0, 99.5, "close" as AnchorId) // 0.5 mm in front: nearer than the near plane
    expect(anchorAt(250, 250)).toBeNull()
  })
})
