// @vitest-environment node
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera } from "three"
import { describe, expect, it } from "vitest"
import type { GroupId, PartId } from "@/core/schema"
import type { RootState } from "@react-three/fiber"
import { partAtPoint } from "./partAtPoint"
import { setPickRef } from "./pickTarget"

const PART = "00000000-0000-4000-8000-000000000001" as PartId

/** A 10 mm box in front of a camera, drawn into a 200 x 100 canvas at page (100, 50). */
function scene() {
  const root = new Group()
  const part = new Group()
  part.add(new Mesh(new BoxGeometry(10, 10, 10), new MeshBasicMaterial()))
  root.add(part)
  setPickRef(part, { kind: "part", id: PART })
  const camera = new PerspectiveCamera(30, 2, 1, 1000)
  camera.position.set(0, 0, 100)
  camera.updateMatrixWorld()
  root.updateMatrixWorld()
  const rect = { left: 100, top: 50, width: 200, height: 100 }
  const gl = { domElement: { getBoundingClientRect: () => rect } }
  return { root, part, state: { gl, camera } as unknown as Pick<RootState, "gl" | "camera"> }
}

describe("part at a page point", () => {
  it("finds the part under the point, and nothing beside it or outside the canvas", () => {
    const { root, state } = scene()
    expect(partAtPoint(state, root, 200, 100)).toBe(PART) // canvas centre
    expect(partAtPoint(state, root, 110, 60)).toBeNull() // empty corner
    expect(partAtPoint(state, root, 50, 100)).toBeNull() // left of the canvas
  })

  it("answers only for parts", () => {
    const { root, part, state } = scene()
    setPickRef(part, { kind: "group", id: "00000000-0000-4000-8000-000000000002" as GroupId })
    expect(partAtPoint(state, root, 200, 100)).toBeNull()
  })
})
