import type { BodyBuilder } from "@/core/generators/mesh/builder"
import { frames, tube } from "@/core/generators/mesh/sweep"
import type { Rigid } from "@/core/math/rigid"
import { add, cross, length, scale, sub } from "@/core/math/vec3"
import type { Connector, Vec3 } from "@/core/schema"
import { cableRoute, polylineLength } from "./cableRoute"
import { layCable, type LaidCable } from "./cableSlack"

export type Cable = Extract<Connector, { kind: "cable" }>

const ORIGIN: Vec3 = [0, 0, 0]

/** A cable laid between the world frames of its anchors (start, waypoints..., end). */
export function cableLayout(c: Cable, ends: readonly Rigid[]): LaidCable | null {
  const spans = cableRoute(ends, c.leadMm, Math.max(c.outerMm, 1))
  if (spans.length === 0) return null
  return layCable(spans, c.lengthMm, c.slack, c.outerMm)
}

/** `points` resampled to at least `count` points along their length. */
function resampled(points: readonly Vec3[], count: number): Vec3[] {
  const total = polylineLength(points)
  if (points.length >= count || total <= 0) return [...points]
  const out: Vec3[] = []
  let i = 1
  let run = 0
  for (let k = 0; k < count; k++) {
    const want = (total * k) / (count - 1)
    while (
      i < points.length - 1 &&
      run + length(sub(points[i] ?? ORIGIN, points[i - 1] ?? ORIGIN)) < want
    ) {
      run += length(sub(points[i] ?? ORIGIN, points[i - 1] ?? ORIGIN))
      i++
    }
    const [a, b] = [points[i - 1] ?? ORIGIN, points[i] ?? ORIGIN]
    const seg = length(sub(b, a))
    out.push(seg > 0 ? add(a, scale(sub(b, a), Math.min(1, (want - run) / seg))) : a)
  }
  return out
}

/**
 * The cable's wire(s) into `b`: one round wire along the laid centreline, or two twisted
 * round each other about it (each `outerMm` thick, a full twist every `pitchMm`).
 */
export function buildCable(b: BodyBuilder, c: Cable, laid: LaidCable): void {
  if (laid.points.length < 2) return
  if (c.conductors === 1) {
    tube(b, laid.points, c.outerMm / 2, 12)
    return
  }
  const total = polylineLength(laid.points)
  const count = Math.min(
    8000,
    Math.max(laid.points.length, Math.ceil((total / c.pitchMm) * 16) + 1)
  )
  const path = resampled(laid.points, count)
  const rmf = frames(path)
  const r = c.outerMm / 2
  let run = 0
  const strands: [Vec3[], Vec3[]] = [[], []]
  path.forEach((p, i) => {
    if (i > 0) run += length(sub(p, path[i - 1] ?? p))
    const n = rmf[i]?.n ?? [0, 1, 0]
    const bn = cross(rmf[i]?.t ?? [1, 0, 0], n)
    const phase = (2 * Math.PI * run) / c.pitchMm
    for (const k of [0, 1] as const) {
      const a = phase + k * Math.PI
      strands[k].push(add(p, scale(add(scale(n, Math.cos(a)), scale(bn, Math.sin(a))), r)))
    }
  })
  for (const s of strands) tube(b, s, r, 10)
}

/** What the inspector and the scene tree show: the taut route and what the length has beyond it or lacks. */
export function cableStatus(
  c: Cable,
  ends: readonly Rigid[]
): { routeMm: number; spareMm: number; shortMm: number } | null {
  const spans = cableRoute(ends, c.leadMm, Math.max(c.outerMm, 1))
  if (spans.length === 0) return null
  const routeMm = polylineLength(spans.flatMap((s, i) => (i === 0 ? s.points : s.points.slice(1))))
  const delta = c.lengthMm - routeMm
  return { routeMm, spareMm: Math.max(0, delta), shortMm: Math.max(0, -delta) }
}
