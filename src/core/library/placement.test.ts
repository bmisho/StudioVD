import { describe, expect, it } from "vitest"
import { applyPoint, compose, fromPose, type Rigid } from "@/core/math/rigid"
import { rotate } from "@/core/math/vec3"
import type { Vec3 } from "@/core/schema"
import {
  anchorInComponent,
  fittingAnchor,
  placePose,
  placementFrame,
  surfaceFrame,
} from "./placement"
import { generated } from "./testing/generatedComponent"

const zOf = (r: Rigid): Vec3 => rotate(r.q, [0, 0, 1])
const close = (a: Vec3, b: Vec3) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i] ?? 0, 9))

describe("placement", () => {
  it("lays the placement anchor on a surface, face to face, and turns it by quarter turns", async () => {
    const nut = await generated("fastener.nut", { size: "M5" })
    const { manifest } = nut.def
    const normal: Vec3 = [0, 0, 1] // a wall facing +Z
    for (const turns of [0, 1, 2, 3]) {
      const pose = placePose(
        manifest,
        nut.assets,
        { kind: "surface", point: [5, 6, 7], normal },
        turns
      )
      const world = compose(fromPose(pose), placementFrame(manifest, nut.assets))
      close(applyPoint(world, [0, 0, 0]), [5, 6, 7])
      close(zOf(world), [0, 0, -1]) // the nut's face looks into the wall
    }
    const a = placePose(manifest, nut.assets, { kind: "surface", point: [0, 0, 0], normal }, 0)
    const b = placePose(manifest, nut.assets, { kind: "surface", point: [0, 0, 0], normal }, 1)
    const angle =
      2 *
      Math.acos(
        Math.min(1, Math.abs(a.quaternion.reduce((s, v, i) => s + v * (b.quaternion[i] ?? 0), 0)))
      )
    expect(angle).toBeCloseTo(Math.PI / 2, 9)
  })

  it("puts a component's anchor onto a fitting scene anchor", async () => {
    const screw = await generated("fastener.screw", { size: "M4", lengthMm: 12, head: "socket" })
    const { manifest } = screw.def
    expect(fittingAnchor(manifest, "M4-hole")).toBe("seat")
    expect(fittingAnchor(manifest, "M3-hole")).toBeNull()
    expect(fittingAnchor(manifest, undefined)).toBeNull()
    const hole = surfaceFrame([10, 20, 30], [0, 1, 0]) // a hole in a plate's top face
    const pose = placePose(manifest, screw.assets, { kind: "anchor", frame: hole, key: "seat" }, 0)
    const seat = anchorInComponent(manifest, "seat")
    if (!seat) throw new Error("no seat")
    const world = compose(fromPose(pose), seat)
    close(applyPoint(world, [0, 0, 0]), [10, 20, 30])
    close(zOf(world), [0, -1, 0]) // the seat faces into the plate: the shank goes down
  })

  it("falls back to the bottom of the box when a component names no placement anchor", async () => {
    const ball = await generated("primitive.sphere", { diameterMm: 10 })
    const frame = placementFrame(ball.def.manifest, ball.assets)
    close(applyPoint(frame, [0, 0, 0]), [0, -5, 0])
    close(zOf(frame), [0, -1, 0])
    const pose = placePose(
      ball.def.manifest,
      ball.assets,
      { kind: "surface", point: [0, 0, 0], normal: [0, 1, 0] },
      0
    )
    close(pose.positionMm, [0, 5, 0]) // resting on the ground
  })
})
