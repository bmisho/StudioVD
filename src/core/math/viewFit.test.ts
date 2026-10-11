import { Box3, PerspectiveCamera, Quaternion, Vector3 } from "three"
import { describe, expect, it } from "vitest"
import { basisFromQuaternion, fitBoxOrthographic, fitBoxPerspective } from "./viewFit"

const close = (a: number, b: number, eps = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(eps)
const cube = new Box3(new Vector3(-50, -50, -50), new Vector3(50, 50, 50))
const front = basisFromQuaternion(new Quaternion()) // looks down -Z from +Z

function basisLookingAt(from: Vector3) {
  const cam = new PerspectiveCamera()
  cam.position.copy(from)
  cam.lookAt(0, 0, 0)
  return { basis: basisFromQuaternion(cam.quaternion), quaternion: cam.quaternion.clone() }
}

describe("fitBoxPerspective", () => {
  it("fits a 100 mm cube from the front", () => {
    const r = fitBoxPerspective(cube, front, { fovDeg: 45, aspect: 1.5, padding: 0 })
    close(r.distance, 50 + 50 * (Math.SQRT2 + 1)) // 170.7106781187
    close(r.position.z, r.distance)
    close(
      fitBoxPerspective(cube, front, { fovDeg: 45, aspect: 1.5, padding: 0.05 }).distance,
      184.1229756874
    )
    close(
      fitBoxPerspective(cube, front, { fovDeg: 30, aspect: 1.5, padding: 0 }).distance,
      236.6025403784
    )
  })

  it("keeps the view direction and puts the limiting corner on the frustum edge", () => {
    const { basis, quaternion } = basisLookingAt(new Vector3(1, 1, 1))
    const r = fitBoxPerspective(cube, basis, { fovDeg: 45, aspect: 1.5, padding: 0 })
    close(r.distance, 225.9872253902, 1e-8) // sphere fit would be 226.3033438454
    const cam = new PerspectiveCamera(45, 1.5, 1, 1e4)
    cam.position.copy(r.position)
    cam.quaternion.copy(quaternion)
    cam.updateMatrixWorld()
    let worst = 0
    for (const x of [-50, 50])
      for (const y of [-50, 50])
        for (const z of [-50, 50]) {
          const p = new Vector3(x, y, z).project(cam)
          worst = Math.max(worst, Math.abs(p.x), Math.abs(p.y))
        }
    close(worst, 1, 1e-9)
  })

  it("centres an off-centre box", () => {
    const box = new Box3(new Vector3(200, 0, -10), new Vector3(300, 40, 10))
    const r = fitBoxPerspective(box, front, { fovDeg: 30, aspect: 1, padding: 0.05 })
    close(r.target.x, 250)
    close(r.target.y, 20)
  })
})

describe("fitBoxOrthographic", () => {
  it("uses the larger of height and width / aspect", () => {
    const bar = new Box3(new Vector3(-200, -50, -50), new Vector3(200, 50, 50))
    close(fitBoxOrthographic(bar, front, 1.5, 0.05).visibleHeight, 296.2962962963)
    close(fitBoxOrthographic(cube, front, 1.5, 0.05).visibleHeight, 111.1111111111)
  })
})
