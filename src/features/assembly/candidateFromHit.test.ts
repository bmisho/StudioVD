import type { RootState } from "@react-three/fiber"
import { Group, OrthographicCamera, Vector3, type Intersection } from "three"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { createTestRig } from "@/core/scene/testRig"
import type { PartId } from "@/core/schema"
import type { LoadedAsset } from "@/features/viewport/parts/assetCache"
import { registerPartObject } from "@/features/viewport/parts/partObjects"
import { setPickRef } from "@/features/viewport/picking/pickTarget"
import { useDocumentStore } from "@/store/document/documentStore"
import { resetStores } from "@/test/resetStores"
import { candidateFromHit } from "./candidateFromHit"

const loaded = vi.hoisted(() => ({ current: undefined as LoadedAsset | undefined }))
vi.mock("@/features/viewport/parts/assetCache", () => ({
  assetCache: {
    getFor: () => loaded.current,
    requestSnaps: () => undefined,
    snaps: () => undefined,
  },
}))

// A cylinder face whose axis leans 20° out of the screen towards the viewer.
const lean = (20 * Math.PI) / 180
const axis: [number, number, number] = [Math.cos(lean), 0, Math.sin(lean)]
const cylinder = {
  faces: [{ first: 0, last: 0, kind: "cylinder", axis, point: [0, 0, 0], radiusMm: 5 }],
}

/** The base part of the test rig at the origin, picked 200 mm right of the view's centre. */
function setup() {
  resetStores()
  const rig = createTestRig()
  useDocumentStore.getState().insertEntities(rig)
  const base = rig.parts[0]?.id as PartId
  const group = new Group()
  setPickRef(group, { kind: "part", id: base })
  registerPartObject(base, group)
  const hit = {
    object: group,
    point: new Vector3(200, 0, 0),
    faceIndex: 0,
    face: { normal: new Vector3(0, 0, 1) },
  } as unknown as Intersection
  const camera = new OrthographicCamera(-300, 300, 300, -300, 1, 1000)
  camera.position.set(0, 0, 100) // looking down -z
  camera.updateMatrixWorld()
  const domElement = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 600, height: 600 }) }
  const state = { camera, gl: { domElement } } as unknown as RootState
  return { hit, state, cursor: { x: 500, y: 300 } }
}

describe("candidateFromHit", () => {
  beforeEach(() => (loaded.current = cylinder as unknown as LoadedAsset))

  it("in an orthographic view, faces the axis towards the viewer wherever the hit is", () => {
    const { hit, state, cursor } = setup()
    const preview = candidateFromHit(hit, cursor, state)
    expect(preview?.candidate.snap).toBe("axis")
    expect(preview?.candidate.frame.z[2]).toBeGreaterThan(0) // out of the screen
  })

  it("offers nothing on a part still drawn as its bounding box (mesh not loaded)", () => {
    const { hit, state, cursor } = setup()
    loaded.current = undefined
    expect(candidateFromHit(hit, cursor, state)).toBeNull()
  })
})
