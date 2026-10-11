import { OrthographicCamera, PerspectiveCamera, Vector3 } from "three"
import { describe, expect, it } from "vitest"
import {
  distanceForVisibleHeight,
  orthographicToPerspective,
  orthoZoomLimits,
  perspectiveToOrthographic,
  poseOnViewAxis,
  visibleHeightAtDistance,
  type ViewPose,
} from "./projection"

const close = (a: number, b: number, eps = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(eps)
const pose = (p: [number, number, number], t: [number, number, number]): ViewPose => ({
  position: new Vector3(...p),
  target: new Vector3(...t),
  up: new Vector3(0, 1, 0),
})

describe("visible height", () => {
  it("matches h = 2 d tan(θ/2) / zoom", () => {
    close(visibleHeightAtDistance(500, 45), 1000 * (Math.SQRT2 - 1)) // 414.2135623731
    close(visibleHeightAtDistance(500, 30), 1000 * (2 - Math.sqrt(3))) // 267.9491924311
    close(visibleHeightAtDistance(500, 45, 2), 207.1067811865, 1e-9)
  })

  it("inverts exactly", () => {
    for (const [d, fov, z] of [
      [500, 30, 1],
      [0.5, 45, 3],
      [1e5, 60, 0.5],
    ] as const) {
      close(distanceForVisibleHeight(visibleHeightAtDistance(d, fov, z), fov, z), d, 1e-9 * d)
    }
  })
})

describe("perspective <-> orthographic", () => {
  it("keeps the pose and shows the same height", () => {
    const p = pose([0, 0, 500], [0, 0, 0])
    const r = perspectiveToOrthographic(p, { fovDeg: 30, zoom: 1 }, 800)
    close(r.zoom, 0.8 * (2 + Math.sqrt(3))) // 2.9856406461
    expect(r.pose.position.toArray()).toEqual([0, 0, 500])
    expect(r.pose.target.toArray()).toEqual([0, 0, 0])
  })

  it("honours a perspective lens zoom", () => {
    const r = perspectiveToOrthographic(pose([0, 0, 500], [0, 0, 0]), { fovDeg: 45, zoom: 2 }, 800)
    close(r.visibleHeight, 207.1067811865)
    close(r.zoom, 3.8627416998, 1e-9)
  })

  it("maps target-plane points to the same screen position", () => {
    const p = pose([300, 200, 400], [10, -20, 5])
    const persp = new PerspectiveCamera(45, 1.5, 1, 1e5)
    persp.position.copy(p.position)
    persp.lookAt(p.target)
    persp.updateMatrixWorld()
    const r = perspectiveToOrthographic(p, { fovDeg: 45, zoom: 1 }, 800)
    const ortho = new OrthographicCamera(-600, 600, 400, -400, 1, 1e5)
    ortho.position.copy(p.position)
    ortho.zoom = r.zoom
    ortho.lookAt(p.target)
    ortho.updateProjectionMatrix()
    ortho.updateMatrixWorld()
    const right = new Vector3().setFromMatrixColumn(persp.matrixWorld, 0)
    const up = new Vector3().setFromMatrixColumn(persp.matrixWorld, 1)
    for (const [x, y] of [
      [0, 0],
      [120, 0],
      [0, -150],
      [-200, 90],
    ] as const) {
      const w = p.target.clone().addScaledVector(right, x).addScaledVector(up, y)
      const a = w.clone().project(persp)
      const b = w.clone().project(ortho)
      close(a.x, b.x)
      close(a.y, b.y)
    }
  })

  it("brings the perspective camera closer after an ortho zoom-in, and round-trips", () => {
    const back = orthographicToPerspective(
      pose([0, 0, 500], [0, 0, 0]),
      { zoom: 4 * 0.8 * (2 + Math.sqrt(3)), frustumHeight: 800 },
      30
    )
    close(back.distance, 125)
    expect(back.exact).toBe(true)
    close(back.pose.position.z, 125)

    const there = perspectiveToOrthographic(
      pose([0, 0, 500], [0, 0, 0]),
      { fovDeg: 30, zoom: 1 },
      800
    )
    const again = orthographicToPerspective(
      there.pose,
      { zoom: there.zoom, frustumHeight: 800 },
      30
    )
    close(again.distance, 500)
  })

  it("clamps to the distance limits and reports it", () => {
    const r = orthographicToPerspective(
      pose([0, 0, 500], [0, 0, 0]),
      { zoom: 1000 * 2.9856406461, frustumHeight: 800 },
      30,
      { minDistance: 0.5, maxDistance: 1e5 }
    )
    expect(r.distance).toBe(0.5)
    expect(r.exact).toBe(false)
  })
})

describe("poseOnViewAxis", () => {
  it("projects the orbit point onto the view axis", () => {
    const r = poseOnViewAxis(
      new Vector3(100, 50, 400),
      new Vector3(0, 0, -1),
      new Vector3(30, 10, 0),
      new Vector3(0, 1, 0)
    )
    expect(r.target.toArray()).toEqual([100, 50, 0])
  })
})

describe("orthoZoomLimits", () => {
  it("mirrors the dolly limits", () => {
    const { minZoom, maxZoom } = orthoZoomLimits(800, 30, 0.5, 1e5)
    close(minZoom, 0.0149282032, 1e-9)
    close(maxZoom, 2985.640646, 1e-5)
  })
})
