import { applyPoint, type Rigid } from "@/core/math/rigid"
import { add, dot, length, normalize, rotate, scale, sub } from "@/core/math/vec3"
import type { Vec3 } from "@/core/schema"

/**
 * A piece of a cable's taut route (PLAN 16.2): its points in order, whether spare length may
 * be laid in it (the bends between waypoints; never the straight leads at the ends), and the
 * side it should bulge to: away from the surfaces its two ends are on (their anchors' z).
 */
export interface RouteSpan {
  points: Vec3[]
  flexible: boolean
  away: Vec3
}

const zOf = (r: Rigid): Vec3 => rotate(r.q, [0, 0, 1])
const originOf = (r: Rigid): Vec3 => applyPoint(r, [0, 0, 0])
const ALPHA = 0.5 // centripetal: no cusps or self-loops within a span

/** A centripetal Catmull-Rom span from p1 to p2 (Barry-Goldman), `n` segments. */
function catmullRom(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, n: number): Vec3[] {
  const knot = (a: Vec3, b: Vec3) => Math.max(length(sub(b, a)) ** ALPHA, 1e-9)
  const t1 = knot(p0, p1)
  const t2 = t1 + knot(p1, p2)
  const t3 = t2 + knot(p2, p3)
  const mix = (a: Vec3, b: Vec3, ta: number, tb: number, t: number) =>
    add(scale(a, (tb - t) / (tb - ta)), scale(b, (t - ta) / (tb - ta)))
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = t1 + ((t2 - t1) * i) / n
    const a1 = mix(p0, p1, 0, t1, t)
    const a2 = mix(p1, p2, t1, t2, t)
    const a3 = mix(p2, p3, t2, t3, t)
    return mix(mix(a1, a2, 0, t2, t), mix(a2, a3, t1, t3, t), t1, t2, t)
  })
}

/** Segments for a span of `chord` mm: about one per `step`, within [8, 96]. */
const segmentsFor = (chord: number, step: number) =>
  Math.min(96, Math.max(8, Math.ceil(chord / step)))

/**
 * The taut route through `frames` (start, waypoints..., end, as world anchor frames): a lead
 * of `leadMm` straight out of each end along its anchor's z, then a smooth curve through the
 * waypoints. Waypoints on top of each other (or of a lead's end) count once.
 */
export function cableRoute(frames: readonly Rigid[], leadMm: number, stepMm: number): RouteSpan[] {
  const first = frames[0]
  const last = frames[frames.length - 1]
  if (!first || !last || frames.length < 2) return []
  const [zs, ze] = [normalize(zOf(first)), normalize(zOf(last))]
  const start = originOf(first)
  const end = originOf(last)
  const startOut = add(start, scale(zs, leadMm))
  const endOut = add(end, scale(ze, leadMm))
  const stops: { p: Vec3; away: Vec3 }[] = [{ p: startOut, away: zs }]
  for (const f of frames.slice(1, -1)) stops.push({ p: originOf(f), away: normalize(zOf(f)) })
  stops.push({ p: endOut, away: ze })
  const kept = stops.filter((s, i) => i === 0 || length(sub(s.p, stops[i - 1]?.p ?? s.p)) > 1e-6)
  const spans: RouteSpan[] = []
  if (leadMm > 0) spans.push({ points: [start, startOut], flexible: false, away: zs })
  for (let i = 0; i + 1 < kept.length; i++) {
    const [a, b] = [kept[i], kept[i + 1]]
    if (!a || !b) continue
    const chord = length(sub(b.p, a.p))
    // Phantom neighbours past the ends continue the leads, so the curve leaves and arrives
    // along the anchors' z.
    const before = kept[i - 1]?.p ?? sub(a.p, scale(zs, chord))
    const after = kept[i + 2]?.p ?? add(b.p, scale(ze, chord))
    const points = catmullRom(before, a.p, b.p, after, segmentsFor(chord, stepMm))
    spans.push({ points, flexible: true, away: add(a.away, b.away) })
  }
  if (kept.length === 1) {
    // Both leads end on one point: the cable folds back there; give it a span to lay slack in.
    const p = kept[0]?.p ?? startOut
    spans.push({ points: [p, p], flexible: true, away: add(zs, ze) })
  }
  if (leadMm > 0) spans.push({ points: [endOut, end], flexible: false, away: ze })
  return spans
}

/** Length of a polyline. */
export function polylineLength(points: readonly Vec3[]): number {
  let sum = 0
  for (let i = 1; i < points.length; i++) {
    const [a, b] = [points[i - 1], points[i]]
    if (a && b) sum += length(sub(b, a))
  }
  return sum
}

/** The spans joined into one polyline, shared points once. */
export function joinSpans(spans: readonly { points: readonly Vec3[] }[]): Vec3[] {
  const out: Vec3[] = []
  for (const s of spans)
    for (const p of s.points) {
      const prev = out[out.length - 1]
      if (!prev || length(sub(p, prev)) > 1e-9) out.push(p)
    }
  return out
}

/** `v` with its component along `axis` removed, or null if nothing is left. */
export function across(v: Vec3, axis: Vec3): Vec3 | null {
  const r = sub(v, scale(axis, dot(v, axis)))
  return length(r) > 1e-6 ? normalize(r) : null
}
