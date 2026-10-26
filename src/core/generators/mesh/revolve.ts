import type { BodyBuilder } from "./builder"
import { at, ringPoint, type Vec2 } from "./outline"

/** A profile in the (r, y) half-plane as runs, each one smooth face of revolution. */
export type Profile = readonly (readonly Vec2[])[]

/**
 * Revolves profile runs about the Y axis with `n` segments (the rings use `ringPoint`, so a
 * cap built from `circle(r, n)` at the same height welds to them). A closed solid's profile
 * runs counter-clockwise in (r, y) (r to the right, y up); points with r = 0 are poles. Runs
 * may end off the axis where another face (a hex socket's cap) closes the shell.
 */
export function revolve(b: BodyBuilder, profile: Profile, n: number, slot = 0): void {
  for (const run of profile) {
    b.face(slot)
    const rings = run.map(([r, y]) =>
      r === 0
        ? Array<number>(n).fill(b.vertex([0, y, 0]))
        : Array.from({ length: n }, (_, j) => b.vertex(at(ringPoint(r, j, n), y)))
    )
    for (let k = 0; k + 1 < rings.length; k++) {
      const [lo, hi] = [rings[k] ?? [], rings[k + 1] ?? []]
      for (let j = 0; j < n; j++) {
        const i = (j + 1) % n
        b.quad(lo[j] ?? 0, lo[i] ?? 0, hi[i] ?? 0, hi[j] ?? 0)
      }
    }
  }
}

/** Points of a circular arc in (r, y): centre, radius, from `a0` to `a1` (radians), `n` steps. */
export function arc(c: Vec2, radius: number, a0: number, a1: number, n: number): Vec2[] {
  return Array.from({ length: n + 1 }, (_, j) => {
    const a = a0 + ((a1 - a0) * j) / n
    const r = c[0] + radius * Math.cos(a)
    return [Math.abs(r) < 1e-12 ? 0 : r, c[1] + radius * Math.sin(a)] as const
  })
}

/**
 * Volume of the solid swept by a closed (r, y) polygon (Pappus: 2π × area × centroid r), for
 * the analytic volumes generators report. Counter-clockwise gives a positive volume.
 */
export function revolvedVolume(points: readonly Vec2[]): number {
  let sum = 0
  points.forEach((p, i) => {
    const q = points[(i + 1) % points.length] ?? p
    const crossTerm = p[0] * q[1] - q[0] * p[1]
    sum += crossTerm * (p[0] + q[0])
  })
  return (2 * Math.PI * sum) / 6
}

/** The profile's points once each, in order (the runs share their ends). */
export const profilePoints = (profile: Profile): Vec2[] =>
  profile.flatMap((run) => run.slice(0, -1))

/** The polygon of a regular n-gon has this fraction of its circle's area (rings are n-gons). */
export const ngonFraction = (n: number): number => (n * Math.sin((2 * Math.PI) / n)) / (2 * Math.PI)
