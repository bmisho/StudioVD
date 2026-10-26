// Test helper (not app code): runs a generator through the real pipeline and measures it.
import { APP_VERSION } from "@/core/app-info"
import { checkManifest, type GeneratorParams } from "@/core/schema"
import { prepareGenerated } from "../prepare"
import type { AnyGenerator } from "../types"

export interface GeneratorCheck {
  ok: boolean
  problems: string[]
  bodies: Record<string, { triangles: number; volume: number; analytic: number; faces: number }>
  anchors: string[]
}

/** Every body closed, its volume within `tolerance` of the analytic one, the manifest valid. */
export async function checkGenerated(
  gen: AnyGenerator,
  params: GeneratorParams,
  tolerance = 0.02
): Promise<GeneratorCheck> {
  const { manifest, assets, output } = await prepareGenerated(gen, params)
  const problems: string[] = []
  const read = checkManifest(JSON.parse(JSON.stringify(manifest)), APP_VERSION, true)
  if (!read.ok) problems.push(`manifest: ${"message" in read ? read.message : read.reason}`)
  if (!read.ok && "problems" in read) problems.push(...read.problems.map(String))
  const bodies: GeneratorCheck["bodies"] = {}
  for (const [key, asset] of Object.entries(assets)) {
    const body = output.bodies[key]
    if (!body) continue
    const volume = asset.volumeMm3 ?? Number.NaN
    if (!asset.watertight) problems.push(`${key}: not watertight`)
    const error = Math.abs(volume - body.volumeMm3) / body.volumeMm3
    if (!(error <= tolerance))
      problems.push(`${key}: volume ${volume.toFixed(3)} vs ${body.volumeMm3.toFixed(3)} mm³`)
    bodies[key] = {
      triangles: asset.triangleCount,
      volume,
      analytic: body.volumeMm3,
      faces: asset.faceCount,
    }
  }
  return { ok: problems.length === 0, problems, bodies, anchors: Object.keys(manifest.anchors) }
}
