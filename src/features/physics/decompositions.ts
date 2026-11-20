import type { PhysicsModel } from "@/core/physics/physicsModel"
import type { AssetId } from "@/core/schema"
import { assetCache } from "@/features/viewport/parts/assetCache"
import type { Notifier } from "@/lib/notify"
import type { Result } from "@/lib/tauri/result"
import { colliderPieces } from "./colliderGeometry"

export interface DecompositionDeps {
  decompose: (positions: Float32Array, indices: Uint32Array) => Promise<Result<Float32Array[]>>
  notify: Notifier
  /** Called once new pieces are in, so the run can be rebuilt with them. */
  done: () => void
}

/** Assets a model's "Convex pieces" parts need and the cache lacks (loaded ones only). */
export function missingDecompositions(model: PhysicsModel): AssetId[] {
  const ids = new Set<AssetId>()
  for (const body of model.bodies)
    for (const p of body.parts)
      if (p.collider === "decomposed" && !colliderPieces.has(p.assetId)) ids.add(p.assetId)
  return [...ids].filter((id) => assetCache.get(id) !== undefined)
}

/**
 * Convex decompositions for test mode (PLAN 10.2), one asset at a time in Rust. Until an
 * asset's pieces are in, its parts collide as their hull; then the run restarts with them.
 * A failure is said once per asset, and that asset keeps its hull.
 */
export function createDecompositions(deps: DecompositionDeps) {
  const failed = new Set<AssetId>()
  let running: Promise<void> | null = null
  const run = async (ids: AssetId[]) => {
    let added = 0
    for (const [i, id] of ids.entries()) {
      const geometry = assetCache.get(id)?.geometry
      const positions = geometry?.getAttribute("position").array
      const indices = geometry?.getIndex()?.array
      if (!(positions instanceof Float32Array) || !(indices instanceof Uint32Array)) continue
      if (ids.length > 1)
        deps.notify.info(`Computing collision shapes (${i + 1} of ${ids.length})…`)
      const pieces = await deps.decompose(positions, indices)
      if (pieces.ok) {
        colliderPieces.set(id, pieces.value)
        added++
      } else {
        failed.add(id)
        deps.notify.warning("A part keeps its convex hull", pieces.error.message)
      }
    }
    if (added > 0) deps.done()
  }
  return {
    /** Starts what `model` lacks; a request while one runs waits for it, then looks again. */
    ensure(model: PhysicsModel): void {
      const ids = missingDecompositions(model).filter((id) => !failed.has(id))
      if (ids.length === 0) return
      const previous = running ?? Promise.resolve()
      running = previous
        .then(() => run(missingDecompositions(model).filter((id) => !failed.has(id))))
        .finally(() => {
          running = null
        })
    },
  }
}
