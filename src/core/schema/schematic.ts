import { z } from "zod"
import { ValueSourceSchema } from "./component/text"
import { BlockDefIdSchema, ComponentInstanceIdSchema, EdgeIdSchema, NodeIdSchema } from "./ids"
import { LocalKeySchema, NameSchema } from "./primitives"

// The schematic (PLAN §3, Phase 11): blocks with typed ports, wired by domain. Behaviour
// (stamps, evaluation) is the solver's (Phase 12); bindings to 3D are Phase 13's.

export const DomainSchema = z.enum([
  "electrical",
  "mechTranslational",
  "mechRotational",
  "fluid",
  "light",
  "data",
])
export type Domain = z.infer<typeof DomainSchema>

/** Conserved (acausal) domains: an effort and a flow, terminals that share a net. */
export const CONSERVED_DOMAINS: ReadonlySet<Domain> = new Set([
  "electrical",
  "mechTranslational",
  "mechRotational",
  "fluid",
])

/** What a data port carries (PLAN §3): typed, so an LCD's text never meets a PWM input. */
export const PayloadSchema = z.enum(["bool", "number", "pwm", "pulse", "adc", "text"])
export type Payload = z.infer<typeof PayloadSchema>

/** A fluid net's medium: only same-medium ports connect (a fan never wires to a pump). */
export const MediumSchema = z.enum(["air", "water", "oil"])
export type Medium = z.infer<typeof MediumSchema>

export const PortSchema = z
  .object({
    key: LocalKeySchema,
    name: NameSchema,
    domain: DomainSchema,
    /** `terminal` for conserved domains; `in`/`out` for signal domains (data, light). */
    direction: z.enum(["terminal", "in", "out"]),
    unit: z.string().max(16),
    /** Data ports only. */
    payload: PayloadSchema.optional(),
    /** Fluid ports only; absent: any medium. */
    medium: MediumSchema.optional(),
    /** Mechanical ports: the key of the port they act against (a motor's shaft: its frame). */
    reference: LocalKeySchema.optional(),
    /** Which edge of the block the port sits on (default: terminals and inputs left). */
    side: z.enum(["left", "right", "top", "bottom"]).optional(),
  })
  .strict()
  .superRefine((p, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: "custom", message })
    const conserved = CONSERVED_DOMAINS.has(p.domain)
    if (conserved !== (p.direction === "terminal"))
      issue(conserved ? "conserved ports are terminals" : "signal ports are in or out")
    if (p.payload && p.domain !== "data") issue("only data ports carry a payload")
    if (p.medium && p.domain !== "fluid") issue("only fluid ports have a medium")
    if (p.reference && !p.domain.startsWith("mech")) issue("only mechanical ports have a reference")
  })
export type Port = z.infer<typeof PortSchema>

export const ParamValueSchema = z.union([z.number(), z.string().max(2048), z.boolean()])
export type ParamValue = z.infer<typeof ParamValueSchema>

/** A block parameter (SI units, PLAN §3), with where its default comes from. */
export const ParamDefSchema = z
  .object({
    key: LocalKeySchema,
    name: NameSchema,
    unit: z.string().max(16),
    kind: z.enum(["number", "bool", "choice", "text"]),
    default: ParamValueSchema,
    min: z.number().optional(),
    max: z.number().optional(),
    choices: z.array(z.string().max(64)).max(32).optional(),
    source: ValueSourceSchema.optional(),
  })
  .strict()
export type ParamDef = z.infer<typeof ParamDefSchema>

/** A built-in simulation model `<id>@<major>` (`electrical.resistor@1`). */
export const SimModelRefSchema = z.string().regex(/^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9]+)+@\d{1,4}$/)

/** Largest behaviour source of a black box (PLAN 11.5). */
export const MAX_BEHAVIOUR_CHARS = 2048

export const BlockDefSchema = z
  .object({
    id: BlockDefIdSchema,
    name: NameSchema,
    /** Built-in simulation model `<id>@<major>`; absent for user black boxes. An unknown id
     *  (a newer StudioVD's) is the solver's diagnostic, never a refusal to open. */
    simModel: SimModelRefSchema.optional(),
    /** Built-in symbol drawn by the app (packs never carry drawings). */
    symbol: z.string().max(32).optional(),
    category: z.string().max(32).optional(),
    ports: z
      .array(PortSchema)
      .max(64)
      .refine((p) => new Set(p.map((x) => x.key)).size === p.length, "port keys are unique"),
    params: z
      .array(ParamDefSchema)
      .max(64)
      .refine((p) => new Set(p.map((x) => x.key)).size === p.length, "parameter keys are unique"),
    /** A black box's behaviour: `name = expression` lines (sandboxed, PLAN 11.5). */
    behaviour: z.string().max(MAX_BEHAVIOUR_CHARS).optional(),
  })
  .strict()
  .superRefine((d, ctx) => {
    const keys = new Set(d.ports.map((p) => p.key))
    d.ports.forEach((p, i) => {
      if (p.reference && (!keys.has(p.reference) || p.reference === p.key))
        ctx.addIssue({
          code: "custom",
          path: ["ports", i, "reference"],
          message: "is not another port",
        })
    })
  })
export type BlockDef = z.infer<typeof BlockDefSchema>

export const SchematicNodeSchema = z
  .object({
    id: NodeIdSchema,
    blockDefId: BlockDefIdSchema,
    position: z
      .object({ x: z.number().min(-1e7).max(1e7), y: z.number().min(-1e7).max(1e7) })
      .strict(),
    label: z.string().max(64),
    paramValues: z.record(LocalKeySchema, ParamValueSchema),
    componentInstanceId: ComponentInstanceIdSchema.optional(),
  })
  .strict()
export type SchematicNode = z.infer<typeof SchematicNodeSchema>

export const SchematicEdgeSchema = z
  .object({
    id: EdgeIdSchema,
    source: NodeIdSchema,
    sourcePort: LocalKeySchema,
    target: NodeIdSchema,
    targetPort: LocalKeySchema,
  })
  .strict()
export type SchematicEdge = z.infer<typeof SchematicEdgeSchema>
