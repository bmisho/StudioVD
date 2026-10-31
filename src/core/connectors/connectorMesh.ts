import { volumeAndCentroid } from "@/core/geometry/massProperties"
import { BodyBuilder, type BodyMesh } from "@/core/generators/mesh/builder"
import { tube } from "@/core/generators/mesh/sweep"
import { applyPoint, type Rigid } from "@/core/math/rigid"
import { add, cross, dot, length, normalize, rotate, scale, sub } from "@/core/math/vec3"
import type { Connector, Vec3 } from "@/core/schema"
import { beltPath } from "./beltPath"

const originOf = (r: Rigid): Vec3 => applyPoint(r, [0, 0, 0])
const zOf = (r: Rigid): Vec3 => rotate(r.q, [0, 0, 1])
const xOf = (r: Rigid): Vec3 => rotate(r.q, [1, 0, 0])

/** Closed shells built in either winding come out facing outward (positive volume). */
function outward(mesh: BodyMesh): BodyMesh {
  if (volumeAndCentroid({ ...mesh }).volumeMm3 >= 0) return mesh
  const indices = mesh.indices.slice()
  for (let t = 0; t < indices.length; t += 3)
    [indices[t + 1], indices[t + 2]] = [indices[t + 2] ?? 0, indices[t + 1] ?? 0]
  return { ...mesh, indices, normals: mesh.normals.map((n) => -n) }
}

/** A belt: a rectangle (width along the wheels' axis, thickness across) round the pitch line. */
function belt(c: Extract<Connector, { kind: "belt" }>, ends: readonly Rigid[]): BodyMesh | null {
  const first = ends[0]
  if (!first) return null
  const o = originOf(first)
  const n = normalize(zOf(first))
  const u = normalize(sub(xOf(first), scale(n, dot(xOf(first), n))))
  const v = cross(n, u)
  const wheels = ends.map((e, i) => {
    const d = sub(originOf(e), o)
    return { centre: [dot(d, u), dot(d, v)] as const, radius: c.ends[i]?.radiusMm ?? 1 }
  })
  const path = beltPath(wheels)
  if (!path) return null
  const [hw, ht] = [c.widthMm / 2, c.thicknessMm / 2]
  const rings = path.points.map(({ p, n: m }) => {
    const centre = add(o, add(scale(u, p[0]), scale(v, p[1])))
    const out = add(scale(u, m[0]), scale(v, m[1]))
    const corner = (r: number, a: number) => add(centre, add(scale(out, r), scale(n, a)))
    return [corner(ht, hw), corner(ht, -hw), corner(-ht, -hw), corner(-ht, hw)]
  })
  const b = new BodyBuilder()
  for (let side = 0; side < 4; side++) {
    b.face()
    const a = rings.map((r) => b.vertex(r[side] ?? o))
    const z = rings.map((r) => b.vertex(r[(side + 1) % 4] ?? o))
    for (let i = 0; i < rings.length; i++) {
      const j = (i + 1) % rings.length
      b.quad(a[i] ?? 0, z[i] ?? 0, z[j] ?? 0, a[j] ?? 0)
    }
  }
  return outward(b.build())
}

/** Points of a cubic Bézier. */
const bezier = (p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, n: number): Vec3[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n
    const [a, b, c, d] = [(1 - t) ** 3, 3 * (1 - t) ** 2 * t, 3 * (1 - t) * t * t, t ** 3]
    return add(add(scale(p0, a), scale(p1, b)), add(scale(p2, c), scale(p3, d)))
  })

/**
 * Derived connector geometry (PLAN 9.6) in world mm, from the world frames of its end anchors
 * (in `ends` order): a belt round its wheels, a tube leaving each fitting along the anchor's
 * z and bending between them, a spring coiled from one anchor to the other. Null when the
 * ends make no shape (wheels inside each other, ends on one point).
 */
export function connectorMesh(c: Connector, ends: readonly Rigid[]): BodyMesh | null {
  if (c.kind === "belt") return belt(c, ends)
  const [a, z] = ends
  if (!a || !z) return null
  const [pa, pz] = [originOf(a), originOf(z)]
  const span = length(sub(pz, pa))
  if (span < 1e-6) return null
  const b = new BodyBuilder()
  if (c.kind === "tube") {
    const reach = c.leadMm + 0.35 * span
    const path = bezier(pa, add(pa, scale(zOf(a), reach)), add(pz, scale(zOf(z), reach)), pz, 48)
    tube(b, path, c.outerMm / 2, 16)
    return outward(b.build())
  }
  const w = normalize(sub(pz, pa))
  const seed = sub(xOf(a), scale(w, dot(xOf(a), w)))
  const uu =
    length(seed) > 1e-6
      ? normalize(seed)
      : normalize(cross(w, Math.abs(w[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]))
  const vv = cross(w, uu)
  const R = (c.outerMm - c.wireMm) / 2
  const steps = Math.ceil(c.coils * 24)
  const path = Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps
    const angle = 2 * Math.PI * c.coils * t
    return add(
      add(pa, scale(w, span * t)),
      add(scale(uu, R * Math.cos(angle)), scale(vv, R * Math.sin(angle)))
    )
  })
  tube(b, path, c.wireMm / 2, 10)
  return outward(b.build())
}
