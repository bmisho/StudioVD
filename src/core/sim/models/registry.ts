import type { BlockDef, BlockDefId } from "@/core/schema"
import { CONTROLLERS } from "./controllers"
import { DATA } from "./data"
import type { ModelDef } from "./define"
import { DRIVERS } from "./drivers"
import { ELECTRICAL } from "./electrical"
import { ELECTROMECHANICAL } from "./electromechanical"
import { FLUID_LIGHT } from "./fluidLight"
import { MECHANICAL } from "./mechanical"
import { SWITCHES } from "./switches"

export type { ModelCategory, ModelDef } from "./define"

/** Every built-in block (PLAN 11.3), in the order the Add block menu lists them. */
export const MODELS: readonly ModelDef[] = [
  ...ELECTRICAL,
  ...SWITCHES,
  ...ELECTROMECHANICAL,
  ...DRIVERS,
  ...MECHANICAL,
  ...FLUID_LIGHT,
  ...DATA,
  ...CONTROLLERS,
]

/** `electrical.resistor@1`: what a project's block definition names. */
export const modelKey = (m: Pick<ModelDef, "id" | "major">): string => `${m.id}@${m.major}`

const byKey = new Map(MODELS.map((m) => [modelKey(m), m]))

/** The built-in model a block names; undefined for a black box or a newer StudioVD's model. */
export const findModel = (key: string | undefined): ModelDef | undefined =>
  key === undefined ? undefined : byKey.get(key)

/** A project's copy of a built-in block: the file never needs this build's library to open. */
export function blockDefOf(model: ModelDef, id: BlockDefId): BlockDef {
  return {
    id,
    name: model.name,
    simModel: modelKey(model),
    symbol: model.symbol,
    category: model.category,
    ports: model.ports.map((p) => ({ ...p })),
    params: model.params.map((p) => ({ ...p })),
    ...(model.programmable && { behaviour: "" }),
  }
}
