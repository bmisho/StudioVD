import { z } from "zod"
import { AnchorIdSchema, CouplingIdSchema, MateIdSchema, PartIdSchema } from "./ids"
import { FrameSchema, MAX_COORDINATE_MM, NameSchema } from "./primitives"

/** Where an anchor came from. Phase 9 adds `component` (authoritative library frames). */
export const AnchorSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("face"), faceIndex: z.number().int().nonnegative() }).strict(),
  z.object({ kind: z.literal("vertex"), vertexIndex: z.number().int().nonnegative() }).strict(),
  z.object({ kind: z.literal("manual") }).strict(),
])
export type AnchorSource = z.infer<typeof AnchorSourceSchema>
export type AnchorKind = z.infer<typeof AnchorSchema>["kind"]

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

/** A full turn: angles and revolute limits stay within one either way (the inspector's ±360°). */
const TURN_RAD = 2 * Math.PI
const LimitSchema = z.number().min(-MAX_COORDINATE_MM).max(MAX_COORDINATE_MM)

export const MateSchema = z
  .object({
    id: MateIdSchema,
    type: MateTypeSchema,
    anchorA: AnchorIdSchema,
    anchorB: AnchorIdSchema,
    flip: z.boolean(),
    angleOffsetRad: z.number().min(-TURN_RAD).max(TURN_RAD),
    /** Revolute: radians, within a turn. Prismatic: millimetres, within the coordinates. */
    limits: z
      .object({ min: LimitSchema, max: LimitSchema })
      .strict()
      .refine((l) => l.min <= l.max, "limits.min must not exceed limits.max")
      .optional(),
    contactsEnabled: z.boolean(),
    suppressed: z.boolean(),
  })
  .strict()
  .refine((m) => m.anchorA !== m.anchorB, {
    message: "a mate needs two different anchors",
    path: ["anchorB"],
  })
  .refine(
    (m) =>
      m.type !== "revolute" ||
      !m.limits ||
      (Math.abs(m.limits.min) <= TURN_RAD && Math.abs(m.limits.max) <= TURN_RAD),
    { message: "revolute limits stay within a turn either way", path: ["limits"] }
  )
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
  .refine((c) => c.mateA !== c.mateB, { message: "a coupling needs two mates", path: ["mateB"] })
export type Coupling = z.infer<typeof CouplingSchema>
