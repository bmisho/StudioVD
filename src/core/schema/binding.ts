import { z } from "zod"
import { AnchorIdSchema, BindingIdSchema, MateIdSchema, NodeIdSchema, PartIdSchema } from "./ids"
import { LocalKeySchema } from "./primitives"

// Bindings between the 3D assembly and the schematic (PLAN 13.1). A source measured in 3D
// sets a block's parameter or drives one of its inputs; a block's output drives a visual in
// 3D. Values are SI; `scale` and `offset` map one onto the other (value·scale + offset),
// then `min`/`max` clamp it. The simulation never moves parts (§1).

const finite = z.number().refine(Number.isFinite, "must be a finite number")

/** What 3D measures. */
export const BindingSourceSchema = z.discriminatedUnion("kind", [
  /** A mate's coordinate: rad (revolute) or m (prismatic), from where it was snapped. */
  z.object({ kind: z.literal("mateCoordinate"), mate: MateIdSchema }).strict(),
  /** What gravity puts on a mate from everything beyond it: N·m or N (PLAN 12.6). */
  z.object({ kind: z.literal("gravityLoad"), mate: MateIdSchema }).strict(),
  /** A part's mass, kg. */
  z.object({ kind: z.literal("mass"), part: PartIdSchema }).strict(),
  /** 1 while two parts touch (within the interference tolerance), else 0. */
  z.object({ kind: z.literal("contact"), a: PartIdSchema, b: PartIdSchema }).strict(),
  /** Distance between two anchors' origins, m. */
  z.object({ kind: z.literal("distance"), a: AnchorIdSchema, b: AnchorIdSchema }).strict(),
  /** How far along an anchor's z the first part is, m (an ultrasonic sensor); `maxM` if none. */
  z
    .object({
      kind: z.literal("range"),
      anchor: AnchorIdSchema,
      maxM: z.number().positive().max(100),
    })
    .strict(),
  /**
   * Light from an emitter block's output, leaving one anchor and reaching another (§2):
   * E = I·cos θ / d² inside the beam, 0 if a part is in the way.
   */
  z
    .object({
      kind: z.literal("light"),
      node: NodeIdSchema,
      port: LocalKeySchema,
      emitter: AnchorIdSchema,
      sensor: AnchorIdSchema,
      /** Beam half-angle, rad. */
      halfAngle: z.number().min(0).max(Math.PI),
    })
    .strict(),
  /** A block's signal output or a conserved port's effort / flow. */
  z
    .object({
      kind: z.literal("output"),
      node: NodeIdSchema,
      port: LocalKeySchema,
      quantity: z.enum(["value", "effort", "flow"]),
    })
    .strict(),
])
export type BindingSource = z.infer<typeof BindingSourceSchema>

/** Where a value goes. */
export const BindingTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("param"), node: NodeIdSchema, param: LocalKeySchema }).strict(),
  z.object({ kind: z.literal("input"), node: NodeIdSchema, port: LocalKeySchema }).strict(),
  /** The part glows (emissive overlay) in proportion to the value, 0..1 after mapping. */
  z
    .object({
      kind: z.literal("glow"),
      part: PartIdSchema,
      color: z.enum(["red", "green", "blue", "white", "yellow", "amber"]),
    })
    .strict(),
  /** The part is tinted from cool (0) to hot (1). */
  z.object({ kind: z.literal("tint"), part: PartIdSchema }).strict(),
  /** An arrow along the anchor's z, its length the value (N or N·m). */
  z.object({ kind: z.literal("arrow"), anchor: AnchorIdSchema }).strict(),
  /** The value as text at the anchor. */
  z.object({ kind: z.literal("label"), anchor: AnchorIdSchema, unit: z.string().max(16) }).strict(),
  /** A ghost of mate B's part turned (or slid) to the value: a servo's commanded pose. */
  z.object({ kind: z.literal("ghost"), mate: MateIdSchema }).strict(),
])
export type BindingTarget = z.infer<typeof BindingTargetSchema>

export const BindingSchema = z
  .object({
    id: BindingIdSchema,
    from: BindingSourceSchema,
    to: BindingTargetSchema,
    scale: finite,
    offset: finite,
    min: finite.optional(),
    max: finite.optional(),
  })
  .strict()
  .superRefine((b, ctx) => {
    const visual = !["param", "input"].includes(b.to.kind)
    if ((b.from.kind === "output") !== visual)
      ctx.addIssue({
        code: "custom",
        path: ["to"],
        message: visual ? "a visual shows a block's output" : "a block's output drives a visual",
      })
    if (b.from.kind === "light" && b.to.kind !== "input")
      ctx.addIssue({ code: "custom", path: ["to"], message: "light reaches a sensor's input" })
    if (b.min !== undefined && b.max !== undefined && b.min > b.max)
      ctx.addIssue({ code: "custom", path: ["max"], message: "is below min" })
  })
export type Binding = z.infer<typeof BindingSchema>

/** Every entity id a binding names (deleting any of them deletes the binding). */
export function bindingRefs(b: Pick<Binding, "from" | "to">): string[] {
  const ids = (o: Record<string, unknown>) =>
    ["mate", "part", "a", "b", "anchor", "emitter", "sensor", "node"].flatMap((k) => {
      const v = o[k]
      return typeof v === "string" ? [v] : []
    })
  return [...ids(b.from), ...ids(b.to)]
}
