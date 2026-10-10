import { z } from "zod"
import {
  AnchorIdSchema,
  ComponentInstanceIdSchema,
  CouplingIdSchema,
  MateIdSchema,
  PartIdSchema,
} from "./ids"
import { FrameSchema, NameSchema } from "./primitives"

/** Where an anchor came from. Component anchors are authoritative frames (no face ids). */
export const AnchorSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("face"), faceIndex: z.number().int().nonnegative() }).strict(),
  z.object({ kind: z.literal("vertex"), vertexIndex: z.number().int().nonnegative() }).strict(),
  z.object({ kind: z.literal("manual") }).strict(),
  z
    .object({
      kind: z.literal("component"),
      instance: ComponentInstanceIdSchema,
      key: z.string().max(32),
    })
    .strict(),
])

export const AnchorSchema = z
  .object({
    id: AnchorIdSchema,
    partId: PartIdSchema,
    kind: z.enum(["point", "planar", "axial"]),
    /** Part-local frame, millimetres. */
    frame: FrameSchema,
    name: NameSchema.optional(),
    /** Interface tag for snap suggestions, e.g. `shaft-8mm`, `M3-hole`. */
    interface: z.string().max(64).optional(),
    source: AnchorSourceSchema,
  })
  .strict()
export type Anchor = z.infer<typeof AnchorSchema>

export const MateTypeSchema = z.enum(["fixed", "revolute", "prismatic", "spherical"])
export type MateType = z.infer<typeof MateTypeSchema>

export const MateSchema = z
  .object({
    id: MateIdSchema,
    type: MateTypeSchema,
    anchorA: AnchorIdSchema,
    anchorB: AnchorIdSchema,
    flip: z.boolean(),
    angleOffsetRad: z.number(),
    /** Revolute: radians. Prismatic: millimetres. */
    limits: z
      .object({ min: z.number(), max: z.number() })
      .strict()
      .refine((l) => l.min <= l.max, "limits.min must not exceed limits.max")
      .optional(),
    contactsEnabled: z.boolean(),
    suppressed: z.boolean(),
  })
  .strict()
export type Mate = z.infer<typeof MateSchema>

/** Kinematic coupling between two mates (PLAN.md Phase 10.5). */
export const CouplingSchema = z
  .object({
    id: CouplingIdSchema,
    kind: z.enum(["gear", "rackPinion", "leadScrew"]),
    mateA: MateIdSchema,
    mateB: MateIdSchema,
    /** Gear: output/input speed ratio. Rack-pinion and lead screw: mm per radian. */
    ratio: z.number().refine((r) => r !== 0, "ratio must be non-zero"),
  })
  .strict()
export type Coupling = z.infer<typeof CouplingSchema>
