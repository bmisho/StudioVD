import { z } from "zod"
import { AnchorIdSchema, ConnectorIdSchema, MaterialIdSchema } from "./ids"
import { NameSchema } from "./primitives"

/** Most ends a belt may wrap (pulleys and idlers). */
export const MAX_CONNECTOR_ENDS = 16

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
])
export type Connector = z.infer<typeof ConnectorSchema>
export type ConnectorKind = Connector["kind"]

/** The anchors a connector hangs on, whatever its kind. */
export const connectorAnchors = (c: Connector) =>
  c.kind === "belt" ? c.ends.map((e) => e.anchor) : [...c.ends]
