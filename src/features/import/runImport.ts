import type { Occt } from "occt-import-js"
import { mmPerUnit, type ImportFormat, type ImportOptions } from "@/core/import/importOptions"
import { prepareAsset, type PreparedAsset } from "@/core/geometry/prepareAsset"
import { MAX_SLOTS } from "@/core/schema"
import type { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js"
import { parseGltf } from "./parsers/gltfParser"
import { parseStl, parseObj } from "./parsers/meshParsers"
import { mergeMeshes } from "./parsers/mergeMeshes"
import { parseCad } from "./parsers/occtParser"
import type { ParsedMesh } from "./parsers/parsedMesh"

/** What the main thread hands the import worker for one file. */
export interface ImportJob {
  fileName: string
  format: ImportFormat
  bytes: ArrayBuffer
  /** OBJ's material library text, read next to the OBJ. */
  mtlText?: string
  /** Files a .gltf refers to (its .bin buffers), by the URI written in the file. */
  resources?: Record<string, ArrayBuffer>
  options: ImportOptions
}

export interface ImportedPart {
  name: string
  /** Group names from the file's hierarchy, outermost first. */
  path: string[]
  asset: PreparedAsset
}

export interface ImportOutcome {
  parts: ImportedPart[]
  warnings: string[]
}

export type Progress = (done: number, total: number, stage: string) => void

/** Decoders the worker creates lazily (occt is 7.6 MB of WASM; DRACO spawns its own workers). */
export interface ImportDecoders {
  occt: () => Promise<Occt>
  draco?: () => DRACOLoader
  meshopt?: unknown
}

function parse(job: ImportJob, decoders: ImportDecoders): Promise<ParsedMesh[]> | ParsedMesh[] {
  const base = job.fileName.replace(/\.[^.]+$/, "")
  const bytes = job.bytes
  switch (job.format) {
    case "stl":
      return parseStl(bytes, base)
    case "obj":
      return parseObj(new TextDecoder().decode(bytes), base, job.mtlText)
    case "step":
    case "iges": {
      const format = job.format
      return decoders
        .occt()
        .then((o) => parseCad(o, new Uint8Array(bytes), format, job.options.quality, job.fileName))
    }
    case "glb":
    case "gltf": {
      const resources = job.resources ?? {}
      return parseGltf({
        bytes,
        fileName: job.fileName,
        resource: (uri) => {
          const found = resources[uri]
          return found
            ? Promise.resolve(found)
            : Promise.reject(new Error(`${job.fileName}: missing ${uri}.`))
        },
        ...(decoders.draco ? { draco: decoders.draco() } : {}),
        meshopt: decoders.meshopt,
      })
    }
  }
}

/** Parse, then normalize every mesh into a stored asset (PLAN 4.3-4.6). */
export async function runImport(
  job: ImportJob,
  decoders: ImportDecoders,
  progress: Progress = () => undefined
): Promise<ImportOutcome> {
  progress(0, 1, "Reading")
  let meshes = await parse(job, decoders)
  const warnings: string[] = []
  if (job.options.split === "single" && meshes.length > 1) {
    meshes = [mergeMeshes(meshes, job.fileName.replace(/\.[^.]+$/, ""))]
  }
  const frame = { mmPerUnit: mmPerUnit(job.format, job.options.unit), upAxis: job.options.upAxis }
  const parts: ImportedPart[] = []
  for (const [i, mesh] of meshes.entries()) {
    progress(i, meshes.length, "Processing")
    const asset = await prepareAsset(mesh, frame)
    if (asset) parts.push({ name: mesh.name, path: mesh.path, asset })
    else warnings.push(`${job.fileName}: skipped "${mesh.name}" (no triangles).`)
    if (asset?.slotsFolded)
      warnings.push(
        `${job.fileName}: "${mesh.name}" has more than ${MAX_SLOTS} materials; the rest share the last one.`
      )
  }
  progress(meshes.length, meshes.length, "Done")
  if (parts.length === 0) warnings.push(`${job.fileName}: nothing to import.`)
  return { parts, warnings }
}
