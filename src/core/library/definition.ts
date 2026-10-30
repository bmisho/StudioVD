import { sha256Hex } from "@/core/geometry/prepareAsset"
import {
  ComponentDefKeySchema,
  componentDefKey,
  type ComponentDefSnapshot,
  type ComponentManifest,
  type ComponentOrigin,
} from "@/core/schema"

/**
 * A definition snapshot for a manifest whose bytes are `text` (as installed), or its JSON as
 * this app writes it (a generator's): keyed `<id>@<version>#<sha12>`, so two parameter sets
 * of one generator are two definitions.
 */
export async function definitionOf(
  manifest: ComponentManifest,
  origin: ComponentOrigin,
  text = JSON.stringify(manifest)
): Promise<ComponentDefSnapshot> {
  const sha = await sha256Hex(new TextEncoder().encode(text))
  const { id, version } = manifest.identity
  return {
    key: ComponentDefKeySchema.parse(componentDefKey(id, version, sha)),
    id,
    version,
    manifestSha256: sha,
    origin,
    manifest,
  }
}
