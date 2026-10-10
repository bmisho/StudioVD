import { z } from "zod"
import {
  BindingIdSchema,
  BlockDefIdSchema,
  ComponentInstanceIdSchema,
  EdgeIdSchema,
  NodeIdSchema,
} from "./ids"
import { NameSchema } from "./primitives"

// Phase 2 draft. Port payload types, parameters and behaviour are fleshed out in Phases 11-13.

export const DomainSchema = z.enum([
  "electrical",
  "mechTranslational",
  "mechRotational",
  "fluid",
  "light",
  "data",
])
export type Domain = z.infer<typeof DomainSchema>

export const PortSchema = z
  .object({
    key: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,31}$/),
    name: NameSchema,
    domain: DomainSchema,
    /** `terminal` for conserved (acausal) domains; `in`/`out` for signal domains. */
    direction: z.enum(["terminal", "in", "out"]),
    unit: z.string().max(16),
  })
  .strict()

export const BlockDefSchema = z
  .object({
    id: BlockDefIdSchema,
    name: NameSchema,
    /** Built-in simulation model `<id>@<major>`; absent for user black boxes. */
    simModel: z.string().max(64).optional(),
    ports: z.array(PortSchema).max(64),
  })
  .strict()
export type BlockDef = z.infer<typeof BlockDefSchema>

const ParamValueSchema = z.union([z.number(), z.string().max(2048), z.boolean()])

export const SchematicNodeSchema = z
  .object({
    id: NodeIdSchema,
    blockDefId: BlockDefIdSchema,
    position: z.object({ x: z.number(), y: z.number() }).strict(),
    label: z.string().max(64),
    paramValues: z.record(z.string().max(64), ParamValueSchema),
    componentInstanceId: ComponentInstanceIdSchema.optional(),
  })
  .strict()
export type SchematicNode = z.infer<typeof SchematicNodeSchema>

export const SchematicEdgeSchema = z
  .object({
    id: EdgeIdSchema,
    source: NodeIdSchema,
    sourcePort: z.string().max(32),
    target: NodeIdSchema,
    targetPort: z.string().max(32),
  })
  .strict()
export type SchematicEdge = z.infer<typeof SchematicEdgeSchema>

/** 3D quantity -> schematic input, or schematic output -> 3D visual (PLAN.md Phase 13). */
export const BindingSchema = z
  .object({
    id: BindingIdSchema,
    from: z.object({ kind: z.string().max(32), ref: z.string().max(128) }).strict(),
    to: z.object({ kind: z.string().max(32), ref: z.string().max(128) }).strict(),
  })
  .strict()
export type Binding = z.infer<typeof BindingSchema>
