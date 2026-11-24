import { cableStatus } from "@/core/connectors/cableMesh"
import { connectorFrames } from "@/core/connectors/frames"
import type { WireColourKey } from "@/core/connectors/wireSpecs"
import { findGenerator } from "@/core/generators/registry"
import { instantiateComponent } from "@/core/library/instantiate"
import type {
  AnchorId,
  ConnectorId,
  GeneratorParams,
  GroupId,
  MateId,
  MateType,
  PartId,
  Quat,
  Vec3,
} from "@/core/schema"
import { generateComponent } from "@/features/library/generatorClient"
import { prepareInsertion } from "@/features/library/prepareInsertion"
import { writeAsset } from "@/lib/tauri/files"
import { copyComponentIntoProject } from "@/lib/tauri/library"
import { useDocumentStore } from "@/store/document/documentStore"

// Building blocks for examples made of Library parts (PLAN 16.6): a generated component
// placed like an insert from the Library, mates with a flip, and cables cut to a length.

const store = () => useDocumentStore.getState()

export interface Placed {
  group: GroupId
  parts: Readonly<Record<string, PartId>>
  anchors: Readonly<Record<string, AnchorId>>
  mates: Readonly<Record<string, MateId>>
}

/**
 * A generator's component (its defaults, with `changes`) at `at` (mm), turned by `q`: one
 * insert, as the Library does it.
 */
export async function generated(
  id: string,
  changes: GeneratorParams,
  at: Vec3,
  q: Quat = [0, 0, 0, 1]
): Promise<Placed> {
  const generator = findGenerator(id, 1)
  if (!generator) throw new Error(`No generator ${id}.`)
  const params = { ...generator.defaults, ...changes }
  const ready = await prepareInsertion(
    { kind: "generator", id, major: 1, params },
    { generate: generateComponent, writeAsset, copyComponentIntoProject },
    () => store().doc.assets
  )
  const placed = instantiateComponent(store().doc, {
    ...ready,
    pose: { positionMm: at, quaternion: q },
  })
  store().insertEntities(placed.batch)
  const c = store().doc.components[placed.instance]
  if (!c) throw new Error(`${id} was not inserted.`)
  return { group: placed.group, parts: c.parts, anchors: c.anchors, mates: c.mates }
}

/** The anchor `key` of a placed component, or an error naming it. */
export function at(p: Placed, key: string): AnchorId {
  const id = Object.hasOwn(p.anchors, key) ? p.anchors[key] : undefined
  if (!id) throw new Error(`No anchor ${key}.`)
  return id
}

/** A mate between anchors that face each other (a part behind a panel hole), turned by φ. */
export function mateFlipped(type: MateType, a: AnchorId, b: AnchorId, angleOffsetRad = 0): MateId {
  const added = store().addMate({ anchorA: a, anchorB: b, type, flip: true, angleOffsetRad })
  if (!added.ok) throw new Error(`The mate was refused: ${added.reason}`)
  return added.id
}

/**
 * A cable through `route` (start, waypoints..., end) in a wire colour, cut `slack` times its
 * route's length (rounded up to a millimetre), its spare length laid as `lay`.
 */
export function cable(
  name: string,
  route: readonly AnchorId[],
  colour: WireColourKey,
  slack = 1.25,
  lay: "arc" | "wave" | "coil" = "arc",
  pair = false
): ConnectorId {
  const id = store().addConnector("cable", route)
  if (!id) throw new Error(`Cable ${name} was refused.`)
  const c = store().doc.connectors[id]
  const frames = c ? connectorFrames(store().doc, c) : null
  const status = c?.kind === "cable" && frames ? cableStatus(c, frames) : null
  if (!status) throw new Error(`Cable ${name} has no route.`)
  store().updateConnector(id, {
    name,
    lengthMm: Math.ceil(status.routeMm * slack),
    slack: lay,
    ...(pair && { conductors: 2, pitchMm: 10 }),
  })
  store().setCableColour(id, colour)
  return id
}
