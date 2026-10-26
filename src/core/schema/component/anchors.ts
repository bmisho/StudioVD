import { z } from "zod"
import { MateAngleSchema, MateLimitsSchema, MateTypeSchema, revoluteLimitsHold } from "../assembly"
import { FrameSchema, LocalKeySchema } from "../primitives"
import { ValueSourceSchema, plainText } from "./text"

/** An anchor on one of the component's parts, as scene anchors are (Phase 7). */
export const ComponentAnchorSchema = z
  .object({
    part: LocalKeySchema,
    name: plainText(80),
    kind: z.enum(["point", "planar", "axial"]),
    /** Part-local, mm: relative to the part's (centred) geometry origin. */
    frame: FrameSchema,
    /** Interface tag for snap suggestions, as on scene anchors (`shaft-8mm`, `M3-hole`). */
    interface: z.string().max(64).optional(),
    /** `placement`: the frame laid on a face or the ground when the component is dropped. */
    role: z.enum(["placement", "mount", "mate", "port", "reference"]).optional(),
  })
  .strict()
export type ComponentAnchor = z.infer<typeof ComponentAnchorSchema>

/** A mate between two of the component's own anchors, created on insert (a bearing's rings). */
export const ComponentMateSchema = z
  .object({
    name: plainText(80),
    type: MateTypeSchema,
    anchorA: LocalKeySchema,
    anchorB: LocalKeySchema,
    flip: z.boolean(),
    angleOffsetRad: MateAngleSchema,
    limits: MateLimitsSchema.optional(),
    limitsSource: ValueSourceSchema.optional(),
    contactsEnabled: z.boolean(),
  })
  .strict()
  .refine(revoluteLimitsHold, { message: "revolute limits stay within a turn", path: ["limits"] })
export type ComponentMate = z.infer<typeof ComponentMateSchema>

/** A hint for a mate to another part, offered when the tags fit; never applied by itself. */
export const SuggestedMateSchema = z
  .object({
    anchor: LocalKeySchema,
    mateType: MateTypeSchema,
    flip: z.boolean(),
    label: plainText(80),
  })
  .strict()
export type SuggestedMate = z.infer<typeof SuggestedMateSchema>

export const PlacementSchema = z
  .object({
    /** Laid on the surface under the cursor (its z against the face normal). */
    placementAnchor: LocalKeySchema.optional(),
    /** Grounded when dropped into an empty scene. */
    groundIfFirst: z.boolean(),
  })
  .strict()
