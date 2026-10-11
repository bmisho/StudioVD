import type { Occt } from "occt-import-js"
import { mmPerUnit, type ImportFormat, type ImportOptions } from "@/core/import/importOptions"
import { prepareAsset, type PreparedAsset } from "@/core/geometry/prepareAsset"
import type { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js"
import { parseGltf } from "./parsers/gltfParser"
import { parseStl, parseObj } from "./parsers/meshParsers"
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

/** Concatenates meshes into one (split mode "single"). Normals survive only if all have them. */
export function mergeMeshes(meshes: ParsedMesh[], name: string): ParsedMesh {
  const keepNormals = meshes.every((m) => m.normals)
  const indexOf = (m: ParsedMesh) =>
    m.indices ?? Uint32Array.from({ length: m.positions.length / 3 }, (_, i) => i)
  const vertexFloats = meshes.reduce((n, m) => n + m.positions.length, 0)
  const indexCount = meshes.reduce((n, m) => n + indexOf(m).length, 0)
  const positions = new Float32Array(vertexFloats)
  const normals = keepNormals ? new Float32Array(vertexFloats) : undefined
  const indices = new Uint32Array(indexCount)
  const faceRanges: { first: number; last: number }[] = []
  let allRanges = true
  let floatAt = 0
  let indexAt = 0
  for (const m of meshes) {
    const base = floatAt / 3
    const triangleBase = indexAt / 3
    positions.set(m.positions, floatAt)
    if (normals && m.normals) normals.set(m.normals, floatAt)
    for (const i of indexOf(m)) indices[indexAt++] = base + i
    floatAt += m.positions.length
    if (m.faceRanges) {
      for (const r of m.faceRanges) {
        faceRanges.push({ first: r.first + triangleBase, last: r.last + triangleBase })
      }
    } else allRanges = false
  }
  return {
    name,
    path: [],
    positions,
    ...(normals ? { normals } : {}),
    indices,
    ...(allRanges ? { faceRanges } : {}),
    color: meshes.find((m) => m.color)?.color ?? null,
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
  }
  progress(meshes.length, meshes.length, "Done")
  if (parts.length === 0) warnings.push(`${job.fileName}: nothing to import.`)
  return { parts, warnings }
}
