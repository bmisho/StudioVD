import type { GeneratedComponent } from "@/core/generators/prepare"
import { assetFromManifest, assetFromPrepared } from "@/core/library/assetRecords"
import { definitionOf } from "@/core/library/definition"
import type { InsertRef } from "@/core/library/items"
import type {
  ComponentDefSnapshot,
  GeneratorParams,
  GeometryAsset,
  LicenseText,
} from "@/core/schema"
import type { Result } from "@/lib/tauri/result"

/** A component ready to place: its definition, its assets stored in the workspace. */
export interface ReadyComponent {
  def: ComponentDefSnapshot
  assets: Record<string, GeometryAsset>
  licenseTexts: { sha256: string; text: LicenseText }[]
}

export interface InsertionBackend {
  generate: (id: string, major: number, params: GeneratorParams) => Promise<GeneratedComponent>
  writeAsset: (id: string, bytes: Uint8Array) => Promise<Result<boolean>>
  copyComponentIntoProject: (id: string, version: string) => Promise<Result<number>>
}

const unwrap = async <T>(r: Promise<Result<T>>): Promise<T> => {
  const v = await r
  if (!v.ok) throw new Error(v.error.message)
  return v.value
}

/**
 * Makes a card insertable (PLAN 4.6): a generator runs in its worker and its GLBs are written
 * to the project workspace (content addressed: known ones are skipped); an installed
 * component's blobs are copied in by Rust, and generated parts inside it are made here.
 */
export async function prepareInsertion(
  ref: InsertRef,
  backend: InsertionBackend,
  known: () => Readonly<Record<string, unknown>>
): Promise<ReadyComponent> {
  const runs = new Map<string, Promise<GeneratedComponent>>()
  const run = (id: string, major: number, params: GeneratorParams) => {
    const key = JSON.stringify([id, major, params])
    let r = runs.get(key)
    if (!r) runs.set(key, (r = backend.generate(id, major, params)))
    return r
  }
  const store = async (a: GeneratedComponent["assets"][string]) => {
    if (!Object.hasOwn(known(), a.id)) await unwrap(backend.writeAsset(a.id, a.glb))
    return assetFromPrepared(a)
  }
  const assets: Record<string, GeometryAsset> = {}
  if (ref.kind === "generator") {
    const out = await run(ref.id, ref.major, ref.params)
    for (const [key, a] of Object.entries(out.assets)) assets[key] = await store(a)
    return { def: await definitionOf(out.manifest, "generator"), assets, licenseTexts: [] }
  }
  await unwrap(backend.copyComponentIntoProject(ref.id, ref.version))
  const { manifest } = ref
  for (const [key, part] of Object.entries(manifest.parts)) {
    const g = part.geometry
    if (g.kind === "asset") {
      assets[key] = assetFromManifest(g, manifest.license.geometry)
      continue
    }
    const body = (await run(g.generator, g.generatorMajor, g.params)).assets[g.output]
    if (!body) throw new Error(`${g.generator} made no ${g.output}.`)
    assets[key] = await store(body)
  }
  const { geometry, data, thumbnail, inherited } = manifest.license
  // Inherited grants' texts too: a component built from library parts carries their terms.
  const grants = [geometry, data, thumbnail, ...(inherited ?? []).map((i) => i.grant)]
  const licenseTexts = grants.flatMap((grant) =>
    grant?.licenseText
      ? [
          {
            sha256: grant.licenseText.sha256,
            text: { path: grant.licenseText.path, spdx: grant.spdx },
          },
        ]
      : []
  )
  const unique = [...new Map(licenseTexts.map((l) => [l.sha256, l])).values()]
  return { def: await definitionOf(manifest, ref.origin, ref.text), assets, licenseTexts: unique }
}
