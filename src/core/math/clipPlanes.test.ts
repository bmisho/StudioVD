import {
  Box3,
  BoxGeometry,
  Mesh,
  OrthographicCamera,
  Raycaster,
  Sphere,
  Vector2,
  Vector3,
} from "three"
import { describe, expect, it } from "vitest"
import { orthoClipPlanes, orthoStandoff, perspectiveClipPlanes } from "./clipPlanes"

const opts = { maxRatio: 1e4, minNear: 0.01 }

describe("perspectiveClipPlanes", () => {
  it("hugs a 2 m assembly seen from 4 m", () => {
    const r = perspectiveClipPlanes(
      new Vector3(0, 0, 4000),
      new Sphere(new Vector3(), 1000),
      4000,
      opts
    )
    expect(r.near).toBeCloseTo(2940, 9)
    expect(r.far).toBeCloseTo(5100, 9)
  })

  it("keeps a close target visible when the camera is inside the bounds", () => {
    const r = perspectiveClipPlanes(
      new Vector3(0, 0, 500),
      new Sphere(new Vector3(), 1000),
      5,
      opts
    )
    expect(r.near).toBeCloseTo(0.153, 9)
    expect(r.far).toBeCloseTo(1530, 9)
  })

  it("never clips the target", () => {
    for (let i = 0; i < 1000; i++) {
      const pos = new Vector3(
        Math.sin(i) * 3000,
        Math.cos(i * 1.3) * 3000,
        Math.sin(i * 0.7) * 3000
      )
      const radius = 1 + (i % 50) * 40
      const targetDistance = 0.5 + (i % 97) * 30
      const r = perspectiveClipPlanes(
        pos,
        new Sphere(new Vector3(i % 7, 0, 0), radius),
        targetDistance,
        opts
      )
      expect(r.near).toBeLessThanOrEqual(0.9 * targetDistance + 1e-12)
      expect(r.far).toBeGreaterThan(r.near)
    }
  })
})

describe("orthographic standoff", () => {
  const bounds = new Sphere(new Vector3(100, 0, 0), 1000)
  const target = new Vector3()
  const margin = 10

  it("puts the whole bounds in front of the camera from any direction", () => {
    for (const dir of [
      new Vector3(0, 0, -1),
      new Vector3(1, 0, 0),
      new Vector3(-1, -1, -1).normalize(),
    ]) {
      const standoff = orthoStandoff(target, bounds, margin)
      const position = target.clone().addScaledVector(dir, -standoff)
      const { near, far } = orthoClipPlanes(position, dir, bounds, standoff, margin)
      const depth = bounds.center.clone().sub(position).dot(dir)
      expect(near).toBeGreaterThan(0)
      expect(depth - bounds.radius).toBeGreaterThanOrEqual(near)
      expect(depth + bounds.radius).toBeLessThanOrEqual(far)
    }
  })

  it("keeps geometry pickable, unlike a negative near plane", () => {
    const box = new Mesh(new BoxGeometry(20, 20, 20))
    box.position.set(0, 0, 100) // behind the naive camera, which looks down -Z from the origin
    box.updateMatrixWorld()
    const ray = new Raycaster()
    const naive = new OrthographicCamera(-50, 50, 50, -50, -1000, 1000)
    naive.position.set(0, 0, 0)
    naive.lookAt(0, 0, -1)
    naive.updateMatrixWorld()
    ray.setFromCamera(new Vector2(0, 0), naive)
    expect(ray.intersectObject(box)).toHaveLength(0) // renders (near < 0) but cannot be picked

    const b = new Box3().setFromObject(box).getBoundingSphere(new Sphere())
    const standoff = orthoStandoff(new Vector3(), b, margin)
    const cam = new OrthographicCamera(-50, 50, 50, -50, 1, 1e5)
    cam.position.set(0, 0, standoff)
    cam.lookAt(0, 0, 0)
    cam.updateMatrixWorld()
    ray.setFromCamera(new Vector2(0, 0), cam)
    // The ray crosses the face diagonal, so both of its triangles report the same hit.
    expect(ray.intersectObject(box).length).toBeGreaterThan(0)
  })
})
