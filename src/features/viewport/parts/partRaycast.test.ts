// @vitest-environment node
import {
  BoxGeometry,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  Raycaster,
  Vector3,
  type Intersection,
} from "three"
import { describe, expect, it } from "vitest"
import { installBvh } from "../picking/bvh"
import { partRaycast } from "./partRaycast"

/** A 10 mm box with two draw groups (two slots), the second drawn double-sided. */
function slottedBox() {
  installBvh()
  const geometry = new BoxGeometry(10, 10, 10).toNonIndexed()
  geometry.setIndex([...Array(36).keys()])
  geometry.clearGroups()
  geometry.addGroup(0, 18, 0)
  geometry.addGroup(18, 18, 1)
  geometry.computeBoundsTree()
  const materials = [new MeshBasicMaterial(), new MeshBasicMaterial({ side: DoubleSide })]
  const mesh = new Mesh(geometry, materials)
  mesh.raycast = partRaycast
  mesh.updateMatrixWorld()
  return mesh
}

const cast = (mesh: Mesh, from: Vector3) => {
  const raycaster = new Raycaster(from, new Vector3().sub(from).normalize())
  raycaster.firstHitOnly = true
  const hits: Intersection[] = []
  mesh.raycast(raycaster, hits)
  return hits
}

describe("part raycast", () => {
  it("hits front faces only, whatever materials the part is drawn with", () => {
    const mesh = slottedBox()
    expect(cast(mesh, new Vector3(0, 0, 50))[0]?.distance).toBeCloseTo(45, 6)
    // From inside, every face is a back face: no hit, also on the double-sided slot.
    expect(cast(mesh, new Vector3(0.1, 1, 0.2))).toEqual([]) // toward -y: slot 1
    expect(mesh.material).toHaveLength(2) // restored after the cast
  })

  it("stays pickable while hidden (wireframe hides the faces)", () => {
    const mesh = slottedBox()
    mesh.visible = false
    expect(cast(mesh, new Vector3(50, 0, 0))).toHaveLength(1)
  })
})
