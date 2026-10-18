import { materialMaps, type SceneDocument } from "@/core/schema"

const keep = <K extends string, V>(record: Record<K, V>, used: ReadonlySet<string>) => {
  const kept = Object.fromEntries(Object.entries(record).filter(([id]) => used.has(id)))
  return kept as Record<K, V>
}

/**
 * The document as it is saved (PLAN 5.6): assets no part uses, textures no material uses,
 * component definitions no instance uses and licence texts nothing names are left out, so the
 * bundle carries only what the project needs. Materials stay (user content, like groups).
 * Pure: the store keeps them, because undo can bring a deleted part back. Returns `doc`
 * itself when there is nothing to drop.
 *
 * Licence texts are named by asset licences and component manifests from Phase 9 on; until
 * then nothing names them (and schema v1 holds none).
 */
export function collectGarbage(doc: SceneDocument): SceneDocument {
  const assets = new Set<string>(Object.values(doc.parts).map((p) => p.assetId))
  const textures = new Set<string>(
    Object.values(doc.materials).flatMap((m) => materialMaps(m).map(([, map]) => map.textureId))
  )
  const defs = new Set<string>(Object.values(doc.components).flatMap((c) => (c.def ? [c.def] : [])))
  const texts = new Set<string>()
  const unused =
    Object.keys(doc.assets).some((id) => !assets.has(id)) ||
    Object.keys(doc.textures).some((id) => !textures.has(id)) ||
    Object.keys(doc.componentDefs).some((key) => !defs.has(key)) ||
    Object.keys(doc.licenseTexts).some((sha) => !texts.has(sha))
  if (!unused) return doc
  return {
    ...doc,
    assets: keep(doc.assets, assets),
    textures: keep(doc.textures, textures),
    componentDefs: keep(doc.componentDefs, defs),
    licenseTexts: keep(doc.licenseTexts, texts),
  }
}
