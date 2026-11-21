import type { BlockDef } from "@/core/schema"
import { findModel } from "../../models/registry"
import type { Behaviour } from "../types"
import { DRIVER_BEHAVIOURS } from "./drivers"
import { ELECTRICAL_BEHAVIOURS } from "./electrical"
import { ELECTROMECH_BEHAVIOURS } from "./electromech"
import { FLUID_BEHAVIOURS } from "./fluid"
import { MECHANICAL_BEHAVIOURS } from "./mechanical"
import { programBehaviour } from "./program"
import { SIGNAL_BEHAVIOURS } from "./signal"
import { SWITCHING_BEHAVIOURS } from "./switching"

/** Every built-in model's behaviour, by model id (without its major). */
export const BEHAVIOURS: Readonly<Record<string, Behaviour>> = {
  ...ELECTRICAL_BEHAVIOURS,
  ...SWITCHING_BEHAVIOURS,
  ...ELECTROMECH_BEHAVIOURS,
  ...DRIVER_BEHAVIOURS,
  ...MECHANICAL_BEHAVIOURS,
  ...FLUID_BEHAVIOURS,
  ...SIGNAL_BEHAVIOURS,
}

/**
 * What a block does in the solver: a built-in model's behaviour, a board's or black box's
 * program; undefined for a model this app does not know (a diagnostic, never a crash).
 */
export function behaviourOf(def: BlockDef): Behaviour | undefined {
  if (def.simModel === undefined) return programBehaviour(def)
  const model = findModel(def.simModel)
  if (!model) return undefined
  if (model.programmable) return programBehaviour(def)
  return Object.hasOwn(BEHAVIOURS, model.id) ? BEHAVIOURS[model.id] : undefined
}
