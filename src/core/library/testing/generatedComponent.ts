// Test helper (not app code): a generator run made ready to insert, as the app does it.
import { prepareGenerated } from "@/core/generators/prepare"
import { findGenerator } from "@/core/generators/registry"
import type { ComponentDefSnapshot, GeneratorParams, GeometryAsset, Pose } from "@/core/schema"
import { assetFromPrepared } from "../assetRecords"
import { definitionOf } from "../definition"

export interface ReadyComponent {
  def: ComponentDefSnapshot
  assets: Record<string, GeometryAsset>
}

/** Runs generator `id` (MAJOR 1) with `params` and wraps its output for insertion. */
export async function generated(id: string, params: GeneratorParams): Promise<ReadyComponent> {
  const gen = findGenerator(id, 1)
  if (!gen) throw new Error(`no generator ${id}`)
  const run = await prepareGenerated(gen, params)
  const assets: Record<string, GeometryAsset> = {}
  for (const [key, a] of Object.entries(run.assets)) assets[key] = assetFromPrepared(a)
  return { def: await definitionOf(run.manifest, "generator"), assets }
}

export const at = (x: number, y: number, z: number): Pose => ({
  positionMm: [x, y, z],
  quaternion: [0, 0, 0, 1],
})
