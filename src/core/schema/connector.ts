import { z } from "zod"
import { AnchorIdSchema, ConnectorIdSchema, MaterialIdSchema, type AnchorId } from "./ids"
import { NameSchema } from "./primitives"

/** Most ends a belt may wrap (pulleys and idlers). */
export const MAX_CONNECTOR_ENDS = 16
/** Most waypoints a cable may pass through (clips, anchors on walls). */
export const MAX_CABLE_VIA = 32

/** How a cable lays the length it has beyond its route (PLAN 16.2). */
export const CABLE_SLACK = ["arc", "wave", "coil"] as const

const size = (max: number) => z.number().positive().max(max)

const common = {
  id: ConnectorIdSchema,
  name: NameSchema,
  materialId: MaterialIdSchema.nullable(),
  visible: z.boolean(),
}

/**
 * Derived connector geometry (PLAN 9.6, scene.json v2): drawn between anchors and rebuilt
 * from them whenever they move; visual only, no collider, no physics. A belt wraps pulleys
 * (each end an axial anchor on the belt line, with the radius it wraps at); a tube runs
 * between two fittings, leaving each along its anchor's z; a spring spans two anchors.
 * A cable (v3, PLAN 16.1) is a wire of the length the user set, leaving each end along its
 * anchor's z through its waypoint anchors in order, its spare length laid as `slack` says.
 */
export const ConnectorSchema = z.discriminatedUnion("kind", [
  z
    .object({
      ...common,
      kind: z.literal("belt"),
      ends: z
        .array(z.object({ anchor: AnchorIdSchema, radiusMm: size(1e5) }).strict())
        .min(2)
        .max(MAX_CONNECTOR_ENDS),
      widthMm: size(1e3),
      thicknessMm: size(100),
    })
    .strict(),
  z
    .object({
      ...common,
      kind: z.literal("tube"),
      ends: z.tuple([AnchorIdSchema, AnchorIdSchema]),
      outerMm: size(1e3),
      /** How far the tube leaves each fitting straight before it bends. */
      leadMm: z.number().nonnegative().max(1e5),
    })
    .strict(),
  z
    .object({
      ...common,
      kind: z.literal("spring"),
      ends: z.tuple([AnchorIdSchema, AnchorIdSchema]),
      outerMm: size(1e3),
      wireMm: size(100),
      coils: z.number().min(1).max(500),
    })
    .strict(),
  z
    .object({
      ...common,
      kind: z.literal("cable"),
      ends: z.tuple([AnchorIdSchema, AnchorIdSchema]),
      /** Waypoints in route order (the ends excluded). */
      via: z.array(AnchorIdSchema).max(MAX_CABLE_VIA),
      /** Its length as cut, along the centreline (a pair: along the pair, not each strand). */
      lengthMm: size(1e6),
      outerMm: size(100),
      /** 1: one wire; 2: a twisted pair, one full twist every `pitchMm`. */
      conductors: z.union([z.literal(1), z.literal(2)]),
      pitchMm: size(1e4),
      slack: z.enum(CABLE_SLACK),
      /** How far it leaves each end straight before it bends. */
      leadMm: z.number().nonnegative().max(1e5),
    })
    .strict(),
])
export type Connector = z.infer<typeof ConnectorSchema>
export type ConnectorKind = Connector["kind"]

/** The anchors a connector hangs on, whatever its kind (a cable's in route order). */
export const connectorAnchors = (c: Connector): AnchorId[] =>
  c.kind === "belt"
    ? c.ends.map((e) => e.anchor)
    : c.kind === "cable"
      ? [c.ends[0], ...c.via, c.ends[1]]
      : [...c.ends]
