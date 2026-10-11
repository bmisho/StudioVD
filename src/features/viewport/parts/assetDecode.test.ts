// @vitest-environment node
import { Mesh, MeshBasicMaterial, Ray, Raycaster, SphereGeometry, Vector3 } from "three"
import { describe, expect, it } from "vitest"
import { encodeGlb } from "@/core/geometry/glbWrite"
import { decodeAsset, toGeometry, transferablesOf } from "./assetDecode"

function sphereGlb(): { glb: Uint8Array; indices: Uint32Array } {
  const s = new SphereGeometry(50, 48, 32)
  const indices = Uint32Array.from(s.getIndex()?.array ?? [])
  const positions = Float32Array.from(s.getAttribute("position").array)
  const normals = Float32Array.from(s.getAttribute("normal").array)
  const glb = encodeGlb({
    mesh: { positions, normals, indices },
    hullNormals: normals,
    faces: [{ first: 0, last: indices.length / 3 - 1, kind: "other" }],
    baseColor: [0.5, 0.25, 0],
  })
  return { glb, indices }
}

describe("asset decode", () => {
  it("keeps the stored triangle order and hits the same triangles as brute force", () => {
    const { glb, indices } = sphereGlb()
    const decoded = decodeAsset(glb)
    expect(decoded.baseColor).toEqual([0.5, 0.25, 0])
    const geometry = toGeometry(decoded, "hullNormal")
    expect(Array.from(geometry.getIndex()?.array ?? [])).toEqual(Array.from(indices))
    const bvh = geometry.boundsTree
    if (!bvh) throw new Error("no BVH attached")
    const brute = new Mesh(geometry, new MeshBasicMaterial())
    const raycaster = new Raycaster()
    for (let i = 0; i < 50; i++) {
      const dir = new Vector3(Math.sin(i), Math.cos(i * 1.7), Math.sin(i * 0.3) - 0.5).normalize()
      const ray = new Ray(dir.clone().multiplyScalar(-200), dir)
      raycaster.ray.copy(ray)
      const expected = raycaster.intersectObject(brute)[0] // three's own (no BVH installed)
      const hit = bvh.raycastFirst(ray)
      expect(hit?.faceIndex).toBe(expected?.faceIndex)
      expect(hit?.distance).toBeCloseTo(expected?.distance ?? NaN, 6)
    }
  })

  it("lists each transferable buffer once", () => {
    const decoded = decodeAsset(sphereGlb().glb)
    const buffers = transferablesOf(decoded)
    expect(new Set(buffers).size).toBe(buffers.length)
    expect(buffers.length).toBeGreaterThanOrEqual(4)
  })
})
