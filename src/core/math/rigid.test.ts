import { describe, expect, it } from "vitest"
import { prng } from "@/core/assembly/testing/mateFixtures"
import type { Quat, Vec3 } from "@/core/schema"
import {
  applyPoint,
  compose,
  fromFrame,
  invert,
  normalizeQuat,
  quatFromBasis,
  toPose,
} from "./rigid"
import { cross, rotate } from "./vec3"

const random = prng(7)
const randomQuat = (): Quat =>
  normalizeQuat([random() - 0.5, random() - 0.5, random() - 0.5, random() - 0.5])
const close = (a: readonly number[], b: readonly number[], eps = 1e-12) =>
  a.forEach((v, i) => expect(Math.abs(v - (b[i] ?? NaN))).toBeLessThan(eps))

describe("rigid transforms", () => {
  it("turn a rotation's basis back into the rotation, in every branch of the method", () => {
    const quats: Quat[] = [
      [1, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
      [0, 0, 0, 1],
      ...Array.from({ length: 200 }, randomQuat),
    ]
    for (const q of quats) {
      const [x, y, z] = (
        [
          [1, 0, 0],
          [0, 1, 0],
          [0, 0, 1],
        ] as Vec3[]
      ).map((e) => rotate(q, e))
      const back = quatFromBasis(x as Vec3, y as Vec3, z as Vec3)
      for (const e of [
        [1, 2, 3],
        [-4, 0.5, 9],
      ] as Vec3[])
        close(rotate(back, e), rotate(q, e))
    }
  })

  it("compose and invert: a transform after its inverse is the identity", () => {
    for (let i = 0; i < 50; i++) {
      const t = { q: randomQuat(), t: [random() * 100, random() * 100, random() * 100] as Vec3 }
      const p: Vec3 = [3, -7, 11]
      close(applyPoint(compose(t, invert(t)), p), p, 1e-9)
      close(applyPoint(compose(invert(t), t), p), p, 1e-9)
    }
  })

  it("reads an anchor frame as its axes at its origin", () => {
    const f = fromFrame({ originMm: [1, 2, 3], z: [0, 1, 0], x: [1, 0, 0] })
    close(rotate(f.q, [0, 0, 1]), [0, 1, 0])
    close(rotate(f.q, [0, 1, 0]), cross([0, 1, 0], [1, 0, 0]))
    expect(f.t).toEqual([1, 2, 3])
  })

  it("writes poses with w ≥ 0 and no -0 (what scene.json reads back)", () => {
    const pose = toPose({ q: [-0, -0, -0, -1], t: [-0, 1, -0] })
    expect(pose).toEqual({ positionMm: [0, 1, 0], quaternion: [0, 0, 0, 1] })
    expect(Object.is(pose.positionMm[0], -0)).toBe(false)
    expect(Object.is(pose.quaternion[0], -0)).toBe(false)
  })
})
