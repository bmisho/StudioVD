// Test helper (not app code): what the golden file records of each generator run.
import type { GeneratorParams } from "@/core/schema"
import { prepareGenerated } from "../prepare"
import type { AnyGenerator } from "../types"

export interface GoldenBody {
  triangles: number
  faces: number
  volumeMm3: number
  offsetMm: number[]
  bboxMm: number[]
}

export interface GoldenRun {
  anchors: string[]
  mates: string[]
  bodies: Record<string, GoldenBody>
}

const round = (v: number) => Number(v.toPrecision(9))

/** Keys exactly, geometry rounded to 9 significant digits (compared with a tolerance). */
export async function goldenRun(gen: AnyGenerator, params: GeneratorParams): Promise<GoldenRun> {
  const { manifest, assets } = await prepareGenerated(gen, params)
  const bodies: Record<string, GoldenBody> = {}
  for (const [key, a] of Object.entries(assets))
    bodies[key] = {
      triangles: a.triangleCount,
      faces: a.faceCount,
      volumeMm3: round(a.volumeMm3 ?? Number.NaN),
      offsetMm: a.offsetMm.map(round),
      bboxMm: [...a.bboxMm.min, ...a.bboxMm.max].map(round),
    }
  return { anchors: Object.keys(manifest.anchors), mates: Object.keys(manifest.mates), bodies }
}
