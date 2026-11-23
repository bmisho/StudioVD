import { describe, expect, it } from "vitest"
import type { Rigid } from "@/core/math/rigid"
import { cross, dot, length, normalize, quatFromAxisAngle, sub } from "@/core/math/vec3"
import type { Vec3 } from "@/core/schema"
import { cableRoute, polylineLength } from "./cableRoute"
import { LENGTH_TOLERANCE_MM, layCable, type SlackStyle } from "./cableSlack"

/** A frame at `t` whose z points along `z`. */
function frame(t: Vec3, z: Vec3): Rigid {
  const dir = normalize(z)
  const axis = cross([0, 0, 1], dir)
  const angle = Math.acos(Math.max(-1, Math.min(1, dir[2])))
  return {
    t,
    q:
      length(axis) > 1e-9
        ? quatFromAxisAngle(normalize(axis), angle)
        : angle > 1
          ? [1, 0, 0, 0]
          : [0, 0, 0, 1],
  }
}

/** A small seeded generator (tests stay deterministic; never Math.random). */
function seeded(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

const near = (a: Vec3, b: Vec3, tol: number) => expect(length(sub(a, b))).toBeLessThan(tol)
const STYLES: SlackStyle[] = ["arc", "wave", "coil"]

describe("cable length solver (PLAN 16.2)", () => {
  // Two lugs 100 mm apart facing each other, 5 mm leads: an 90 mm curve between the leads.
  const ends = [frame([0, 0, 0], [1, 0, 0]), frame([100, 0, 0], [-1, 0, 0])]
  const spans = cableRoute(ends, 5, 2)

  it("a cable no longer than its route is taut and says what it lacks", () => {
    const route = polylineLength(spans.flatMap((s) => s.points))
    const laid = layCable(spans, 80, "arc", 2)
    expect(laid.routeMm).toBeCloseTo(100, 6)
    expect(route).toBeGreaterThan(0)
    expect(laid.shortMm).toBeCloseTo(20, 6)
    expect(laid.spareMm).toBe(0)
    expect(polylineLength(laid.points)).toBeCloseTo(100, 6)
  })

  it.each(STYLES)(
    "lays spare length as %s, to the set length, ends and leads in place",
    (style) => {
      for (const lengthMm of [100.5, 130, 250, 1000]) {
        const laid = layCable(spans, lengthMm, style, 2)
        expect(Math.abs(polylineLength(laid.points) - lengthMm)).toBeLessThanOrEqual(
          LENGTH_TOLERANCE_MM
        )
        expect(laid.spareMm).toBeCloseTo(lengthMm - 100, 6)
        near(laid.points[0] ?? [9, 9, 9], [0, 0, 0], 1e-9)
        near(laid.points[laid.points.length - 1] ?? [9, 9, 9], [100, 0, 0], 1e-9)
        // The first point after the end lies on the lead: straight out along the anchor's z.
        near(laid.points[1] ?? [9, 9, 9], [5, 0, 0], 1e-9)
      }
    }
  )

  it("passes through every waypoint and keeps the set length on random routes", () => {
    const rnd = seeded(16)
    const point = (): Vec3 => [rnd() * 200 - 100, rnd() * 200 - 100, rnd() * 200 - 100]
    for (let trial = 0; trial < 40; trial++) {
      const via = Array.from({ length: Math.floor(rnd() * 5) }, () => frame(point(), point()))
      const frames = [frame(point(), point()), ...via, frame(point(), point())]
      const route = cableRoute(frames, rnd() * 10, 1.5)
      const routeMm = polylineLength(route.flatMap((s) => s.points))
      const style = STYLES[trial % 3] ?? "arc"
      const lengthMm = routeMm * (1.02 + rnd() * 2)
      const laid = layCable(route, lengthMm, style, 1.5)
      expect(laid.shortMm, `trial ${trial}`).toBe(0)
      expect(
        Math.abs(polylineLength(laid.points) - lengthMm),
        `trial ${trial} ${style}`
      ).toBeLessThanOrEqual(LENGTH_TOLERANCE_MM)
      for (const v of via) {
        const closest = Math.min(...laid.points.map((p) => length(sub(p, v.t))))
        expect(closest, `trial ${trial} waypoint`).toBeLessThan(1e-6)
      }
    }
  })

  it("arcs bulge away from the surfaces the ends are on", () => {
    // Both ends on a floor (z up = +y), side by side: the spare length rises off the floor.
    const floor = [frame([0, 0, 0], [0, 1, 0]), frame([60, 0, 0], [0, 1, 0])]
    const laid = layCable(cableRoute(floor, 0, 1), 120, "arc", 1)
    const lowest = Math.min(...laid.points.map((p) => p[1]))
    expect(lowest).toBeGreaterThan(-1e-6)
    expect(Math.max(...laid.points.map((p) => dot(p, [0, 1, 0])))).toBeGreaterThan(10)
  })

  it("is deterministic", () => {
    const a = layCable(cableRoute(ends, 5, 2), 333, "coil", 2)
    const b = layCable(cableRoute(ends, 5, 2), 333, "coil", 2)
    expect(a).toEqual(b)
  })
})
