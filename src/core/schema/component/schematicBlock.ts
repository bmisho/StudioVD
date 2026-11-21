import { z } from "zod"
import { LocalKeySchema } from "../primitives"
import { ParamValueSchema, SimModelRefSchema } from "../schematic"
import { atMost } from "./text"

/**
 * A component's schematic block (PLAN 11.7): a built-in model and the parameter values that
 * differ from its defaults. Packs never carry drawings or behaviour of their own (§9).
 */
export const ComponentSchematicSchema = z
  .object({
    block: SimModelRefSchema,
    params: z.record(LocalKeySchema, ParamValueSchema).refine(atMost(64), "at most 64").optional(),
  })
  .strict()
export type ComponentSchematic = z.infer<typeof ComponentSchematicSchema>
