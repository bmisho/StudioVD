import { existsSync, readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { join } from "node:path"
import { sha256Hex } from "@/core/geometry/prepareAsset"
import type { ComponentManifest } from "@/core/schema"
import { readFootprint, sceneOffset, type FootprintModel } from "./footprint"
import { kicadGrants, kicadLicenceText, stepHeader } from "./kicadLicence"
import { kicadManifest } from "./kicadManifest"
import type { ComponentRecipe } from "./recipe"
import { stepAsset } from "./stepAsset"
import type { Thumbnailer } from "./thumbnail"

/** Where the pinned KiCad files are (a checkout, or only the files the recipes name). */
export interface KicadSources {
  dir: string
  tag: string
}

/** A built component: its manifest's exact bytes and every file the pack needs for it. */
export interface BuiltComponent {
  manifest: ComponentManifest
  manifestBytes: Uint8Array
  manifestPath: string
  /** Pack path → bytes (geometry, licence text, thumbnail). */
  files: Map<string, Uint8Array>
  thumbnail: { path: string; sha256: string; png: Uint8Array }
}

const text = (b: Uint8Array) => new TextDecoder().decode(b)
const read = (dir: string, path: string): Uint8Array => {
  if (path.split("/").some((p) => p === ".." || p === "")) throw new Error(`bad path ${path}`)
  return new Uint8Array(readFileSync(join(dir, path)))
}

type Validator = {
  validateBytes(
    b: Uint8Array
  ): Promise<{ issues: { numErrors: number; numWarnings: number; messages: unknown[] } }>
}
const gltfValidator = createRequire(import.meta.url)("gltf-validator") as Validator

/** The Khronos glTF validator must find nothing wrong with a GLB the pack ships. */
async function validateGlb(glb: Uint8Array, name: string): Promise<void> {
  const { issues } = await gltfValidator.validateBytes(glb)
  if (issues.numErrors > 0 || issues.numWarnings > 0)
    throw new Error(`${name}: glTF validator: ${JSON.stringify(issues.messages).slice(0, 2000)}`)
}

const libraryPath = (m: FootprintModel) =>
  m.path.replace(/^\$\{KICAD\d*_3DMODEL_DIR\}\//, "").replace(/\.wrl$/, ".step")

/** The model to use (the recipe's, else the footprint's only shown one) and its placement. */
function modelOf(
  recipe: ComponentRecipe,
  models: FootprintModel[]
): FootprintModel & { lib: string } {
  const shown = models.filter((m) => !m.hidden)
  const pick = recipe.model ? models.find((m) => libraryPath(m) === recipe.model) : shown[0]
  if (!pick || (!recipe.model && shown.length > 1))
    throw new Error(
      `${recipe.id}: the footprint does not place ${recipe.model ?? "exactly one model"}`
    )
  return { ...pick, lib: libraryPath(pick) }
}

/** One KiCad part through the app's importer into a manifest and its files (PLAN 14.7). */
export async function buildComponent(
  recipe: ComponentRecipe,
  src: KicadSources,
  thumbs: Thumbnailer,
  options: { builtAt: string; app: string }
): Promise<BuiltComponent> {
  const footprint = readFootprint(text(read(join(src.dir, "kicad-footprints"), recipe.footprint)))
  const model = modelOf(recipe, footprint.models)
  const modelPath = model.lib
  const models = join(src.dir, "kicad-packages3D")
  const step = read(models, modelPath)
  const { asset, colours } = await stepAsset(step, modelPath)
  await validateGlb(asset.glb, modelPath)

  const folder = modelPath.split("/")[0] ?? ""
  const credits = join(models, folder, "CREDITS.md")
  const licence = new TextEncoder().encode(
    kicadLicenceText({
      tag: src.tag,
      licenseMd: text(read(models, "LICENSE.md")),
      ...(existsSync(credits) && { credits: readFileSync(credits, "utf8") }),
      modelPath,
      header: stepHeader(step),
    })
  )
  const licenceSha = await sha256Hex(licence)
  const licenceRef = { path: `licenses/${licenceSha}.txt`, sha256: licenceSha }

  const dir = `components/${recipe.id}/${recipe.version}`
  const shot = await thumbs.render(asset.glb)
  const thumbnail = {
    path: `${dir}/thumbnail.png`,
    sha256: await sha256Hex(shot.png),
    png: shot.png,
  }

  const manifest = kicadManifest({
    recipe,
    footprint,
    modelPath,
    modelOffsetMm: sceneOffset(model.offset),
    asset,
    colours,
    ...kicadGrantsAsInputs(src.tag, modelPath, recipe.footprint, licenceRef),
    thumbnail: {
      path: thumbnail.path,
      sha256: thumbnail.sha256,
      widthPx: shot.widthPx,
      heightPx: shot.heightPx,
    },
    builtAt: options.builtAt,
    app: options.app,
  })
  const manifestBytes = new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`)
  const files = new Map<string, Uint8Array>([
    [`geometry/${asset.id}.glb`, asset.glb],
    [licenceRef.path, licence],
    [thumbnail.path, thumbnail.png],
  ])
  return { manifest, manifestBytes, manifestPath: `${dir}/component.json`, files, thumbnail }
}

function kicadGrantsAsInputs(
  tag: string,
  modelPath: string,
  footprintPath: string,
  licenseText: { path: string; sha256: string }
) {
  const g = kicadGrants({ tag, modelPath, footprintPath, licenseText })
  return { geometryGrant: g.geometry, dataGrant: g.data }
}
