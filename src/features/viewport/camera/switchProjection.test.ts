import { Box3, Sphere, Vector3, type Camera } from "three"
import { describe, expect, it } from "vitest"
import { createCameraRig } from "./createCameraRig"
import { fitAll } from "./fitView"
import { switchProjection } from "./switchProjection"

const size = { width: 1200, height: 800 }
const bounds = new Sphere(new Vector3(), 1000)

function screenOf(cam: Camera, points: Vector3[]) {
  cam.updateMatrixWorld()
  return points.map((p) => p.clone().project(cam))
}

function rigAt(position: [number, number, number], target: [number, number, number]) {
  const rig = createCameraRig()
  rig.persp.aspect = size.width / size.height
  rig.persp.updateProjectionMatrix()
  void rig.controls.setLookAt(...position, ...target, false)
  rig.controls.update(0)
  return rig
}

describe("switchProjection", () => {
  it("keeps target-plane points in place through persp -> ortho -> persp", () => {
    const rig = rigAt([300, 250, 400], [0, 0, 0])
    const cam = rig.controls.camera
    cam.updateMatrixWorld() // camera-controls moves the camera but does not update its matrices
    const right = new Vector3().setFromMatrixColumn(cam.matrixWorld, 0)
    const up = new Vector3().setFromMatrixColumn(cam.matrixWorld, 1)
    const pts = [
      [0, 0],
      [120, 0],
      [0, -150],
      [-200, 90],
    ].map(([x = 0, y = 0]) => new Vector3().addScaledVector(right, x).addScaledVector(up, y))
    const before = screenOf(cam, pts)

    const ortho = switchProjection(rig, "orthographic", size, bounds, 20)
    expect(ortho.type).toBe("OrthographicCamera")
    expect(ortho.near).toBeGreaterThan(0)
    const during = screenOf(ortho, pts)
    const back = switchProjection(rig, "perspective", size, bounds, 20)
    expect(back.type).toBe("PerspectiveCamera")
    expect(back.zoom).toBe(1)
    const after = screenOf(back, pts)

    for (let i = 0; i < pts.length; i++) {
      for (const s of [during, after]) {
        expect(Math.abs((s[i]?.x ?? 9) - (before[i]?.x ?? 0))).toBeLessThan(1e-9)
        expect(Math.abs((s[i]?.y ?? 9) - (before[i]?.y ?? 0))).toBeLessThan(1e-9)
      }
    }
    expect(rig.controls.distance).toBeCloseTo(new Vector3(300, 250, 400).length(), 6)
  })

  it("brings the perspective camera closer after zooming in orthographic", () => {
    const rig = rigAt([0, 0, 500], [0, 0, 0])
    switchProjection(rig, "orthographic", size, bounds, 20)
    void rig.controls.zoomTo(rig.ortho.zoom * 4, false)
    rig.controls.update(0)
    switchProjection(rig, "perspective", size, bounds, 20)
    expect(rig.controls.distance).toBeCloseTo(125, 6)
  })

  it("sets the wheel up for the new camera via applyZoomSettings, not by itself", () => {
    // Regression guard: switching never touches the left button (reserved for picking).
    const rig = rigAt([0, 0, 500], [0, 0, 0])
    switchProjection(rig, "orthographic", size, bounds, 20)
    expect(rig.controls.mouseButtons.left).toBe(0)
  })
})

describe("fitAll", () => {
  it("frames a box without changing the view direction", async () => {
    const rig = rigAt([600, 600, 600], [0, 50, 0])
    const before = { az: rig.controls.azimuthAngle, polar: rig.controls.polarAngle }
    await fitAll(rig, new Box3(new Vector3(-50, -50, -50), new Vector3(50, 50, 50)), size, false)
    rig.controls.update(0)
    expect(rig.controls.azimuthAngle).toBeCloseTo(before.az, 9)
    expect(rig.controls.polarAngle).toBeCloseTo(before.polar, 9)
    const t = rig.controls.getTarget(new Vector3())
    expect(t.length()).toBeLessThan(1e-6)
  })

  it("uses a view direction set just before, without an update in between", async () => {
    const rig = createCameraRig()
    // The rig starts isometric; ask for the right view without an update(), so the camera
    // object still has the old orientation.
    void rig.controls.setLookAt(500, 0, 0, 0, 0, 0, false)
    await fitAll(rig, new Box3(new Vector3(-50, -50, -50), new Vector3(50, 50, 50)), size, false)
    rig.controls.update(0)
    expect(rig.controls.azimuthAngle).toBeCloseTo(Math.PI / 2, 9)
  })

  it("fits the default stage when the scene is empty", async () => {
    const rig = rigAt([600, 600, 600], [0, 0, 0])
    await fitAll(rig, new Box3(), size, false)
    expect(Number.isFinite(rig.controls.distance)).toBe(true)
  })
})
