import type { PhysicsModel } from "@/core/physics/physicsModel"
import { deepEqual } from "@/core/util/deepEqual"

let lastModel: PhysicsModel | null = null

/**
 * The previous model object when nothing physics uses changed: a colour or slot edit in test
 * mode keeps the running world, a density, pose or mate change restarts it.
 */
export function stableModel(next: PhysicsModel): PhysicsModel {
  if (lastModel && deepEqual(lastModel, next)) return lastModel
  lastModel = next
  return next
}

const runIds = new WeakMap<object, number>()
let nextRunId = 0
/** A stable number per model object, part of the world's key. */
export const runIdOf = (model: object) => {
  let id = runIds.get(model)
  if (id === undefined) runIds.set(model, (id = ++nextRunId))
  return id
}
