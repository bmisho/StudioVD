import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { parseArgs } from "node:util"
import { buildPack, type BuiltPack } from "./buildPack"
import { PackRecipeSchema } from "./recipe"
import { Thumbnailer } from "./thumbnail"

const USAGE = `node tools/packs/run.mjs /tools/packs/cli.ts \\
  --recipes <dir of pack recipes> --sources <dir with kicad-packages3D/ and kicad-footprints/> \\
  --kicad-tag 10.0.7 --tag <release tag> --out <dir> [--built-at <ISO UTC>] [--app <range>]`

/**
 * The pack builder (PLAN 14.7): every `*.json` pack recipe in `--recipes` becomes a pack and a
 * preview pack in `--out`, plus `published.json`, the index entries the catalog repository
 * records for them (packs, components, preview packs, bundles).
 */
export async function main(argv: string[]): Promise<number> {
  const { values: v } = parseArgs({
    args: argv,
    options: {
      recipes: { type: "string" },
      sources: { type: "string" },
      "kicad-tag": { type: "string" },
      tag: { type: "string" },
      out: { type: "string" },
      "built-at": { type: "string" },
      app: { type: "string", default: ">=0.1.0 <1.0.0" },
    },
  })
  if (!v.recipes || !v.sources || !v["kicad-tag"] || !v.tag || !v.out) {
    console.error(USAGE)
    return 2
  }
  const builtAt = v["built-at"] ?? new Date().toISOString().replace(/\.\d{3}Z$/, "Z")
  const recipes = readdirSync(v.recipes)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => {
      const parsed = PackRecipeSchema.safeParse(
        JSON.parse(readFileSync(join(v.recipes ?? "", f), "utf8"))
      )
      if (!parsed.success) throw new Error(`${f}: ${parsed.error.message}`)
      return parsed.data
    })
  mkdirSync(v.out, { recursive: true })
  const thumbs = await Thumbnailer.start()
  const built: BuiltPack[] = []
  try {
    for (const recipe of recipes) {
      console.log(`${recipe.pack}: ${recipe.components.length} components`)
      const pack = await buildPack(recipe, { dir: v.sources, tag: v["kicad-tag"] }, thumbs, {
        builtAt,
        app: v.app,
        tag: v.tag,
        log: (s) => console.log(s),
      })
      for (const f of pack.files) writeFileSync(join(v.out, f.name), f.bytes)
      built.push(pack)
    }
  } finally {
    await thumbs.close()
  }
  const published = {
    builtAt,
    tag: v.tag,
    packs: Object.fromEntries(built.flatMap((b) => Object.entries(b.packs))),
    components: built.flatMap((b) => b.components),
    previewPacks: Object.fromEntries(built.flatMap((b) => Object.entries(b.previewPacks))),
    bundles: built.map((b) => b.bundle),
  }
  writeFileSync(join(v.out, "published.json"), `${JSON.stringify(published, null, 2)}\n`)
  console.log(`${built.length} packs, ${published.components.length} components → ${v.out}`)
  return 0
}
