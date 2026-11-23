import { frames } from "@/core/generators/mesh/sweep"
import { add, cross, length, normalize, scale, sub } from "@/core/math/vec3"
import type { Vec3 } from "@/core/schema"
import { across, joinSpans, polylineLength, type RouteSpan } from "./cableRoute"

export type SlackStyle = "arc" | "wave" | "coil"

/** How close the drawn length comes to the set one (PLAN 16.2: ±0.1 mm). */
export const LENGTH_TOLERANCE_MM = 0.05
const DOWN: Vec3 = [0, -1, 0]
const ORIGIN: Vec3 = [0, 0, 0]

/** Fraction along a polyline by arc length, per point (by index when it has no length). */
function fractions(points: readonly Vec3[]): number[] {
  const total = polylineLength(points)
  let run = 0
  return points.map((p, i) => {
    if (i > 0) run += length(sub(p, points[i - 1] ?? p))
    return total > 1e-9 ? run / total : points.length > 1 ? i / (points.length - 1) : 0
  })
}

/** Unit tangent at each point (central differences). */
const tangents = (points: readonly Vec3[]): Vec3[] =>
  points.map((_, i) =>
    normalize(
      sub(
        points[Math.min(points.length - 1, i + 1)] ?? ORIGIN,
        points[Math.max(0, i - 1)] ?? ORIGIN
      )
    )
  )

/** The side a span bulges to at each point: its `away` hint, else down, else any, across the path. */
function sides(span: RouteSpan): Vec3[] {
  const t = tangents(span.points)
  const chord = normalize(
    sub(span.points[span.points.length - 1] ?? ORIGIN, span.points[0] ?? ORIGIN)
  )
  const fallback = across(span.away, chord) ??
    across(DOWN, chord) ??
    across([1, 0, 0], chord) ?? [0, 0, 1]
  return t.map(
    (ti) => across(fallback, ti) ?? across(DOWN, ti) ?? across([1, 0, 0], ti) ?? fallback
  )
}

/** `points` subdivided evenly by length to `count` points (kept as they are if they have more). */
function refined(points: readonly Vec3[], count: number): Vec3[] {
  if (points.length >= count || points.length < 2) return [...points]
  const f = fractions(points)
  return Array.from({ length: count }, (_, k) => {
    const s = k / (count - 1)
    let i = 1
    while (i < f.length - 1 && (f[i] ?? 1) < s) i++
    const [a, b] = [points[i - 1] ?? ORIGIN, points[i] ?? ORIGIN]
    const [fa, fb] = [f[i - 1] ?? 0, f[i] ?? 1]
    const u = fb > fa ? (s - fa) / (fb - fa) : 0
    return add(a, scale(sub(b, a), u))
  })
}

/** One span laid with `amount` (an amplitude or a turn count) of `style`. */
type Shaper = (amount: number) => Vec3[]

/** `coilRadius`: the radius of the loops when this span is the one coiled, else null. */
function shaper(
  span: RouteSpan,
  style: SlackStyle,
  outerMm: number,
  coilRadius: number | null,
  expectedTurns = 0
): Shaper {
  const spanLen = polylineLength(span.points)
  if (style === "coil") {
    if (coilRadius === null) return () => span.points
    // About 24 points a turn for the turns the spare length will need (spare / 2πr).
    const points = refined(
      span.points,
      Math.min(4000, Math.max(97, Math.ceil(expectedTurns * 24) + 48))
    )
    const f = fractions(points)
    const rmf = frames(points)
    const radius = coilRadius
    return (turns) =>
      points.map((p, i) => {
        const s = f[i] ?? 0
        const n = rmf[i]?.n ?? [0, 1, 0]
        const b = cross(rmf[i]?.t ?? [1, 0, 0], n)
        // Loops round the route, wound up from nothing and back, so the ends stay put.
        const ramp = Math.sin(Math.PI * s) ** 0.5
        const angle = 2 * Math.PI * turns * s
        return add(
          p,
          scale(add(scale(n, Math.cos(angle) - 1), scale(b, Math.sin(angle))), radius * ramp)
        )
      })
  }
  const wavelength = Math.max(6 * outerMm, 8)
  const waves = Math.max(1, Math.round(spanLen / wavelength))
  const points = refined(span.points, style === "wave" ? Math.min(2000, waves * 24 + 1) : 97)
  const f = fractions(points)
  const side = sides({ ...span, points })
  return (amount) =>
    points.map((p, i) => {
      const s = f[i] ?? 0
      const bulge =
        style === "arc"
          ? amount * spanLen * Math.sin(Math.PI * s)
          : amount * Math.sin(2 * Math.PI * waves * s)
      return add(p, scale(side[i] ?? DOWN, bulge))
    })
}

export interface LaidCable {
  /** The centreline as drawn. */
  points: Vec3[]
  /** The taut route's length, and what the set length has beyond it or lacks. */
  routeMm: number
  spareMm: number
  shortMm: number
}

/**
 * Lays `lengthMm` of cable along `spans`: taut when it is the route's length or less (then
 * `shortMm` says what it lacks), else its spare length laid in the flexible spans as `style`
 * (arcs bulging away from the surfaces, waves, or one coil in the longest span), solved by
 * bisection so the drawn centreline is `lengthMm` within LENGTH_TOLERANCE_MM.
 */
export function layCable(
  spans: readonly RouteSpan[],
  lengthMm: number,
  style: SlackStyle,
  outerMm: number
): LaidCable {
  const route = joinSpans(spans)
  const routeMm = polylineLength(route)
  const flexible = spans.filter((s) => s.flexible)
  if (lengthMm <= routeMm + LENGTH_TOLERANCE_MM || flexible.length === 0)
    return { points: route, routeMm, spareMm: 0, shortMm: Math.max(0, routeMm - lengthMm) }
  const longest = flexible.reduce((a, b) =>
    polylineLength(b.points) > polylineLength(a.points) ? b : a
  )
  // Loops wide enough that the turns they need sit at least a wire apart along the span:
  // n turns of circumference 2πr take the spare, so n = spare / 2πr ≤ span / outer.
  const spare = lengthMm - routeMm
  const coilRadius = Math.max(
    2.5 * outerMm,
    3,
    (1.2 * spare * outerMm) / (2 * Math.PI * Math.max(polylineLength(longest.points), outerMm))
  )
  const shapers = spans.map((s) =>
    s.flexible
      ? shaper(
          s,
          style,
          outerMm,
          s === longest ? coilRadius : null,
          spare / (2 * Math.PI * coilRadius)
        )
      : () => s.points
  )
  const lay = (amount: number) => joinSpans(shapers.map((shape) => ({ points: shape(amount) })))
  const lengthAt = (amount: number) => polylineLength(lay(amount))
  let [lo, hi] = [0, style === "arc" ? 0.25 : style === "coil" ? 1 : Math.max(outerMm, 1)]
  for (let i = 0; i < 60 && lengthAt(hi) < lengthMm; i++) hi *= 2
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2
    const at = lengthAt(mid)
    if (Math.abs(at - lengthMm) <= LENGTH_TOLERANCE_MM / 2) return done(lay(mid))
    if (at < lengthMm) lo = mid
    else hi = mid
  }
  return done(lay((lo + hi) / 2))
  function done(points: Vec3[]): LaidCable {
    return { points, routeMm, spareMm: lengthMm - routeMm, shortMm: 0 }
  }
}
