import { anchorWorld } from "@/core/assembly/mateSnap"
import { length, rotate, sub } from "@/core/math/vec3"
import { gravityLoads } from "@/core/physics/gravityLoads"
import { mateCoordinate } from "@/core/physics/mateCoordinate"
import type { AnchorId, Binding, MateId, PartId, Pose, SceneDocument, Vec3 } from "@/core/schema"
import type { Injected } from "@/core/sim/engine/types"
import { mmToM } from "@/core/units"
import { lightFactor, type Ray } from "./light"

// The sampler (PLAN 13.4): reads what 3D measures now and turns each binding into what the
// solver takes: a parameter value, an input's value, or a light path's gain.

/** What the 3D side can tell, at the poses shown now (design pose, or live in test mode). */
export interface Live {
  /** The pose a part is drawn at now. */
  pose: (part: PartId) => Pose | undefined
  /** A mate's live coordinate in test mode (rad or mm); undefined in design mode. */
  reading: (mate: MateId) => number | undefined
  /** Whether two parts touch now. */
  touching: (a: PartId, b: PartId) => boolean
  /**
   * The distance (mm) along a ray to the first part, ignoring `skip`; null when nothing is
   * within `maxMm`.
   */
  ray: (originMm: Vec3, dir: Vec3, maxMm: number, skip: readonly PartId[]) => number | null
}

export type { Injected }

type Doc = Pick<
  SceneDocument,
  | "parts"
  | "assets"
  | "materials"
  | "anchors"
  | "mates"
  | "couplings"
  | "connectors"
  | "bindings"
  | "schematic"
  | "simulation"
>

/** Whether a block's parameter is a switch (a bound value above one half turns it on). */
function isBool(doc: Doc, node: string, key: string): boolean {
  const n = Object.hasOwn(doc.schematic.nodes, node)
    ? doc.schematic.nodes[node as keyof Doc["schematic"]["nodes"]]
    : undefined
  const def = n ? doc.schematic.blockDefs[n.blockDefId] : undefined
  return def?.params.find((p) => p.key === key)?.kind === "bool"
}

export const mapValue = (b: Pick<Binding, "scale" | "offset" | "min" | "max">, v: number) => {
  const y = v * b.scale + b.offset
  return Math.min(b.max ?? Infinity, Math.max(b.min ?? -Infinity, y))
}

/** The document with every part at the pose drawn now. */
function posed(doc: Doc, live: Live): Doc {
  const parts = { ...doc.parts }
  for (const p of Object.values(doc.parts)) {
    const pose = live.pose(p.id)
    if (pose) parts[p.id] = { ...p, pose }
  }
  return { ...doc, parts }
}

function rayOf(doc: Doc, id: AnchorId): (Ray & { part: PartId }) | null {
  const anchor = Object.hasOwn(doc.anchors, id) ? doc.anchors[id] : undefined
  const part =
    anchor && Object.hasOwn(doc.parts, anchor.partId) ? doc.parts[anchor.partId] : undefined
  if (!anchor || !part) return null
  const w = anchorWorld(part, anchor)
  return { originMm: w.t, z: rotate(w.q, [0, 0, 1]), part: part.id }
}

/** A 3D source's value now (SI), or undefined when what it names is gone. */
function measure(doc: Doc, live: Live, b: Binding, gravity: () => ReturnType<typeof gravityLoads>) {
  const f = b.from
  switch (f.kind) {
    case "mateCoordinate": {
      const mate = doc.mates[f.mate]
      const a = mate && doc.anchors[mate.anchorA]
      const bb = mate && doc.anchors[mate.anchorB]
      const [pa, pb] = [a && doc.parts[a.partId], bb && doc.parts[bb.partId]]
      if (!mate || !a || !bb || !pa || !pb) return undefined
      const v = live.reading(mate.id) ?? mateCoordinate(mate, pa, a, pb, bb)
      return mate.type === "prismatic" ? mmToM(v) : v
    }
    case "gravityLoad":
      return gravity().joints[f.mate]?.value ?? 0
    case "mass":
      return undefined // filled in by the caller from the physics model's masses
    case "contact":
      return live.touching(f.a, f.b) ? 1 : 0
    case "distance": {
      const [ra, rb] = [rayOf(doc, f.a), rayOf(doc, f.b)]
      return ra && rb ? mmToM(length(sub(rb.originMm, ra.originMm))) : undefined
    }
    case "range": {
      const r = rayOf(doc, f.anchor)
      if (!r) return undefined
      const hit = live.ray(r.originMm, r.z, f.maxM * 1000, [r.part])
      return hit === null ? f.maxM : mmToM(hit)
    }
    default:
      return undefined
  }
}

export function sampleBindings(
  source: Doc,
  live: Live,
  massKg: (part: PartId) => number
): Injected {
  const doc = posed(source, live)
  const out: Injected = { params: {}, signals: {}, light: {} }
  let loads: ReturnType<typeof gravityLoads> | null = null
  const gravity = () => (loads ??= gravityLoads(doc, doc.simulation.gravity))
  for (const b of Object.values(doc.bindings)) {
    if (b.from.kind === "light") {
      const [e, s] = [rayOf(doc, b.from.emitter), rayOf(doc, b.from.sensor)]
      if (!e || !s || b.to.kind !== "input") continue
      const span = sub(s.originMm, e.originMm)
      const d = length(span)
      const blocked =
        d > 0 &&
        live.ray(e.originMm, span.map((x) => x / d) as Vec3, d - 0.5, [e.part, s.part]) !== null
      const gain = blocked ? 0 : lightFactor(e, s, b.from.halfAngle)
      out.light[`${b.to.node}/${b.to.port}`] = {
        from: `${b.from.node}/${b.from.port}`,
        gain: mapValue(b, gain),
      }
      continue
    }
    const v = b.from.kind === "mass" ? massKg(b.from.part) : measure(doc, live, b, gravity)
    if (v === undefined) continue
    const y = mapValue(b, v)
    if (b.to.kind === "param")
      (out.params[b.to.node] ??= {})[b.to.param] = isBool(doc, b.to.node, b.to.param) ? y > 0.5 : y
    else if (b.to.kind === "input") out.signals[`${b.to.node}/${b.to.port}`] = y
  }
  return out
}
