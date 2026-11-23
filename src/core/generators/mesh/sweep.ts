import { add, cross, dot, length, normalize, scale, sub } from "@/core/math/vec3"
import type { Vec3 } from "@/core/schema"
import type { BodyBuilder } from "./builder"
import { planarFace } from "./planar"

const ORIGIN: Vec3 = [0, 0, 0]

/**
 * Rotation-minimizing frames along a polyline (double reflection, Wang et al. 2008): the
 * cross-section does not twist about the path, so a coiled wire looks round all along.
 */
export function frames(path: readonly Vec3[]): { t: Vec3; n: Vec3 }[] {
  const tangent = (i: number) => {
    const p = path[Math.max(0, i - 1)] ?? ORIGIN
    const q = path[Math.min(path.length - 1, i + 1)] ?? ORIGIN
    return normalize(sub(q, p))
  }
  const t0 = tangent(0)
  const seed: Vec3 = Math.abs(t0[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]
  const out: { t: Vec3; n: Vec3 }[] = [{ t: t0, n: normalize(cross(cross(t0, seed), t0)) }]
  for (let i = 1; i < path.length; i++) {
    const prev = out[i - 1] ?? { t: t0, n: seed }
    const [p, q] = [path[i - 1] ?? ORIGIN, path[i] ?? ORIGIN]
    const v1 = sub(q, p)
    const c1 = dot(v1, v1)
    const reflect = (x: Vec3, v: Vec3, c: number) => sub(x, scale(v, (2 * dot(v, x)) / c))
    const nL = reflect(prev.n, v1, c1)
    const tL = reflect(prev.t, v1, c1)
    const t = tangent(i)
    const v2 = sub(t, tL)
    const c2 = dot(v2, v2)
    out.push({ t, n: normalize(c2 > 1e-24 ? reflect(nL, v2, c2) : nL) })
  }
  return out
}

/**
 * A round wire of `radius` along `path` with `sides` segments round, capped flat at both ends:
 * a closed shell (a spring). The polygon has the circle's area (its corners stand slightly
 * proud), so a coarse wire still has the true volume and mass. The path must not come closer
 * to itself than the wire's diameter.
 */
export function tube(
  b: BodyBuilder,
  path: readonly Vec3[],
  radius: number,
  sides: number,
  slot = 0
): void {
  if (path.length < 2) throw new Error("a tube needs a path")
  const f = frames(path)
  const drawn = radius / Math.sqrt((sides * Math.sin((2 * Math.PI) / sides)) / (2 * Math.PI))
  const rings = path.map((c, i) => {
    const { t, n } = f[i] ?? { t: [0, 0, 1] as Vec3, n: [1, 0, 0] as Vec3 }
    const bn = cross(t, n) // n × bn = t: rings run counter-clockwise about the tangent
    return Array.from({ length: sides }, (_, j) => {
      const a = (2 * Math.PI * j) / sides
      return add(c, add(scale(n, drawn * Math.cos(a)), scale(bn, drawn * Math.sin(a))))
    })
  })
  b.face(slot)
  const ids = rings.map((ring) => ring.map((p) => b.vertex(p)))
  for (let k = 0; k + 1 < ids.length; k++) {
    const [lo, hi] = [ids[k] ?? [], ids[k + 1] ?? []]
    for (let j = 0; j < sides; j++) {
      const i = (j + 1) % sides
      b.quad(lo[j] ?? 0, lo[i] ?? 0, hi[i] ?? 0, hi[j] ?? 0)
    }
  }
  const first = rings[0] ?? []
  const last = rings.at(-1) ?? []
  planarFace(b, [first], scale(f[0]?.t ?? [0, 0, 1], -1), slot)
  planarFace(b, [last], f.at(-1)?.t ?? [0, 0, 1], slot)
}

/** Length of a polyline (a spring's wire, for its analytic volume π r² L). */
export function pathLength(path: readonly Vec3[]): number {
  let sum = 0
  for (let i = 1; i < path.length; i++) sum += length(sub(path[i] ?? ORIGIN, path[i - 1] ?? ORIGIN))
  return sum
}
