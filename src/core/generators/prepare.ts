import { prepareAsset, type PreparedAsset, type SourceMesh } from "@/core/geometry/prepareAsset"
import {
  ComponentManifestSchema,
  type ComponentManifest,
  type GeneratorParams,
  type Vec3,
} from "@/core/schema"
import { generatedManifest } from "./manifest"
import type { AnyGenerator, GeneratedBody, GeneratorOutput } from "./types"

/** A generator run made ready to insert: its manifest and one normalized asset per part. */
export interface GeneratedComponent {
  manifest: ComponentManifest
  /** By part key (the body keys of the output). */
  assets: Record<string, PreparedAsset>
  output: GeneratorOutput
}

/** A body as the import pipeline takes meshes: already mm and Y-up, its own faces and slots. */
export function bodySource(body: GeneratedBody): SourceMesh {
  const { mesh } = body
  const slots = body.slots && body.slots.length > 1 ? body.slots : undefined
  return {
    name: body.name,
    positions: mesh.positions,
    normals: mesh.normals,
    indices: mesh.indices,
    faceRanges: mesh.faceRanges,
    ...(slots &&
      mesh.triangleSlots && {
        slots: slots.map((s) => ({ name: s.name, color: null })),
        triangleSlots: mesh.triangleSlots,
      }),
  }
}

/**
 * Runs a generator and prepares each body exactly as imports are (PLAN 4.5: recentred, faces
 * classified, GLB and SHA-256), then writes the manifest around the offsets that gave. Pure
 * and deterministic within one JS engine; the worker and the tests run this same function.
 */
export async function prepareGenerated(
  gen: AnyGenerator,
  raw: GeneratorParams
): Promise<GeneratedComponent> {
  const params = gen.params.parse(raw)
  const output = gen.generate(params)
  const assets: Record<string, PreparedAsset> = {}
  const offsets: Record<string, Vec3> = {}
  for (const [key, body] of Object.entries(output.bodies)) {
    const prepared = await prepareAsset(bodySource(body), { mmPerUnit: 1, upAxis: "y" })
    if (!prepared) throw new Error(`${gen.id}: ${key} has no triangles`)
    assets[key] = prepared
    offsets[key] = prepared.offsetMm
  }
  // Through JSON once, as a saved file would be: no -0 (cross products make them; JSON reads
  // them back as 0, and scene.json must reopen unchanged), and the strict schema checked.
  const manifest = ComponentManifestSchema.parse(
    JSON.parse(JSON.stringify(generatedManifest(gen, params, output, offsets)))
  )
  return { manifest, assets, output }
}
