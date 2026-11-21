import { z } from "zod"
import { LocalKeySchema } from "../primitives"

// Bindings a component brings (PLAN 13.2, §4): by the manifest's own keys (its parts,
// anchors, mates, its schematic block's ports and parameters), made when it is inserted. A
// contact with something outside the component is a slot: the user names the part.

const finite = z.number().refine(Number.isFinite, "must be a finite number")

export const TemplateSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("mateCoordinate"), mate: LocalKeySchema }).strict(),
  z.object({ kind: z.literal("gravityLoad"), mate: LocalKeySchema }).strict(),
  z.object({ kind: z.literal("mass"), part: LocalKeySchema }).strict(),
  z.object({ kind: z.literal("contact"), a: LocalKeySchema, b: LocalKeySchema }).strict(),
  /** Contact between one of its parts and a part the user picks (an actuator's target). */
  z
    .object({ kind: z.literal("contactSlot"), a: LocalKeySchema, slot: z.string().min(1).max(64) })
    .strict(),
  z.object({ kind: z.literal("distance"), a: LocalKeySchema, b: LocalKeySchema }).strict(),
  z
    .object({
      kind: z.literal("range"),
      anchor: LocalKeySchema,
      maxM: z.number().positive().max(100),
    })
    .strict(),
  /** Its own block's output. */
  z
    .object({
      kind: z.literal("output"),
      port: LocalKeySchema,
      quantity: z.enum(["value", "effort", "flow"]),
    })
    .strict(),
])

export const TemplateTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("param"), param: LocalKeySchema }).strict(),
  z.object({ kind: z.literal("input"), port: LocalKeySchema }).strict(),
  z
    .object({
      kind: z.literal("glow"),
      part: LocalKeySchema,
      color: z.enum(["red", "green", "blue", "white", "yellow", "amber"]),
    })
    .strict(),
  z.object({ kind: z.literal("tint"), part: LocalKeySchema }).strict(),
  z.object({ kind: z.literal("arrow"), anchor: LocalKeySchema }).strict(),
  z.object({ kind: z.literal("label"), anchor: LocalKeySchema, unit: z.string().max(16) }).strict(),
  z.object({ kind: z.literal("ghost"), mate: LocalKeySchema }).strict(),
])

export const ComponentBindingSchema = z
  .object({
    key: LocalKeySchema,
    from: TemplateSourceSchema,
    to: TemplateTargetSchema,
    scale: finite,
    offset: finite,
    min: finite.optional(),
    max: finite.optional(),
  })
  .strict()
  .superRefine((b, ctx) => {
    const visual = !["param", "input"].includes(b.to.kind)
    if ((b.from.kind === "output") !== visual)
      ctx.addIssue({ code: "custom", path: ["to"], message: "a block's output drives a visual" })
  })
export type ComponentBinding = z.infer<typeof ComponentBindingSchema>
