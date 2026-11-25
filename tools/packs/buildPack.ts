import type { z } from "zod"
import { sha256Hex } from "@/core/geometry/prepareAsset"
import { CatalogComponentEntrySchema, PackEntrySchema, PackManifestSchema } from "@/core/schema"
import { findModel } from "@/core/sim/models/registry"
import { buildComponent, type BuiltComponent, type KicadSources } from "./buildComponent"
import { TOOL } from "./kicadManifest"
import type { PackRecipe } from "./recipe"
import type { Thumbnailer } from "./thumbnail"
import { unpackedBytes, writeZip, type ZipEntry } from "./zipWriter"

type CatalogComponentEntry = z.infer<typeof CatalogComponentEntrySchema>
type PackEntry = z.infer<typeof PackEntrySchema>

/** One pack's files and what the catalog index says about them. */
export interface BuiltPack {
  files: { name: string; bytes: Uint8Array }[]
  packs: Record<string, PackEntry>
  components: CatalogComponentEntry[]
  previewPacks: Record<string, string>
  bundle: { id: string; label: string; pack: string; components: { id: string; version: string }[] }
}

const json = (v: unknown) => new TextEncoder().encode(`${JSON.stringify(v, null, 2)}\n`)

async function entryFor(url: string, zip: Uint8Array, entries: ZipEntry[]): Promise<PackEntry> {
  return PackEntrySchema.parse({
    url,
    sha256: await sha256Hex(zip),
    bytes: zip.length,
    uncompressedBytes: unpackedBytes(entries),
    entries: entries.length,
  })
}

/** Domains a component's block works in (the index's browse filter). */
function domains(c: BuiltComponent) {
  const model = findModel(c.manifest.schematic?.block)
  if (c.manifest.schematic && !model) throw new Error(`${c.manifest.identity.id}: unknown block`)
  return [...new Set(model?.ports.map((p) => p.domain) ?? [])]
}

/**
 * Builds a pack recipe into `<pack>.stvdpack` (pack.json first, then every file it lists) and
 * `<pack>.previews.zip` (the thumbnails, at the paths the index gives them), released under
 * `tag` (PLAN 14.7).
 */
export async function buildPack(
  recipe: PackRecipe,
  src: KicadSources,
  thumbs: Thumbnailer,
  o: { builtAt: string; app: string; tag: string; log: (s: string) => void }
): Promise<BuiltPack> {
  const built: BuiltComponent[] = []
  for (const r of recipe.components) {
    built.push(await buildComponent(r, src, thumbs, o))
    o.log(
      `  ${r.id}@${r.version}: ${built.at(-1)?.manifest.parts.body?.geometry.kind === "asset" ? "ok" : "?"}`
    )
  }
  const files = new Map<string, Uint8Array>()
  for (const c of built) {
    files.set(c.manifestPath, c.manifestBytes)
    for (const [path, bytes] of c.files) files.set(path, bytes)
  }
  const listed = await Promise.all(
    [...files.keys()].sort().map(async (path) => {
      const bytes = files.get(path) ?? new Uint8Array()
      return { path, sha256: await sha256Hex(bytes), bytes: bytes.length }
    })
  )
  const packJson = PackManifestSchema.parse({
    format: "studiovd-pack",
    schemaVersion: 1,
    createdBy: `${TOOL.tool} ${TOOL.toolVersion}`,
    createdAt: o.builtAt,
    components: await Promise.all(
      built.map(async (c) => ({
        id: c.manifest.identity.id,
        version: c.manifest.identity.version,
        manifestPath: c.manifestPath,
        manifestSha256: await sha256Hex(c.manifestBytes),
      }))
    ),
    files: listed,
  })
  const entries: ZipEntry[] = [
    { name: "pack.json", data: json(packJson), deflate: true },
    ...listed.map((f) => ({
      name: f.path,
      data: files.get(f.path) ?? new Uint8Array(),
      deflate: !f.path.endsWith(".png"),
    })),
  ]
  const zip = writeZip(entries)
  const previewEntries = built.map((c) => ({
    name: c.thumbnail.path,
    data: c.thumbnail.png,
    deflate: false,
  }))
  const previews = writeZip(previewEntries)
  const packFile = `${recipe.pack}.stvdpack`
  const previewFile = `${recipe.pack}.previews.zip`
  const pack = await entryFor(`${o.tag}/${packFile}`, zip, entries)
  const preview = await entryFor(`${o.tag}/${previewFile}`, previews, previewEntries)

  const components = await Promise.all(
    built.map(async (c) => {
      const m = c.manifest
      const id = m.identity
      const body = Object.values(m.parts)[0]
      return CatalogComponentEntrySchema.parse({
        id: id.id,
        version: id.version,
        name: id.name,
        summary: id.summary ?? id.name,
        category: id.category,
        tags: id.tags,
        ...(id.family && { family: id.family }),
        ...(id.vendor && { vendor: id.vendor }),
        ...(id.mpn && { mpn: id.mpn }),
        domains: domains(c),
        partCount: Object.keys(m.parts).length,
        triangles: body?.geometry.kind === "asset" ? body.geometry.triangles : 0,
        hasSchematic: m.schematic !== undefined,
        license: { geometry: m.license.geometry.spdx, data: m.license.data.spdx },
        requires: { app: id.requires.app },
        manifestSha256: await sha256Hex(c.manifestBytes),
        pack: pack.sha256,
        thumbnail: { pack: preview.sha256, path: c.thumbnail.path, sha256: c.thumbnail.sha256 },
        publishedAt: o.builtAt,
      })
    })
  )
  return {
    files: [
      { name: packFile, bytes: zip },
      { name: previewFile, bytes: previews },
    ],
    packs: { [pack.sha256]: pack, [preview.sha256]: preview },
    components,
    previewPacks: { [recipe.category.join("/")]: preview.sha256 },
    bundle: {
      id: recipe.pack,
      label: recipe.label,
      pack: pack.sha256,
      components: components.map((c) => ({ id: c.id, version: c.version })),
    },
  }
}
