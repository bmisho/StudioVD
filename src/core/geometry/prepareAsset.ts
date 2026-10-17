import { computeHullNormals } from "@/core/math/hullNormals"
import { AssetIdSchema, MAX_COORDINATE_MM, type AssetId, type Vec3 } from "@/core/schema"
import { classifyFaces } from "./classify"
import { creasedNormals } from "./creasedNormals"
import { encodeGlb } from "./glbWrite"
import { volumeAndCentroid } from "./massProperties"
import { meshBounds, type Bounds, type MeshData } from "./meshData"
import { growFaces, orderByFace } from "./segment"
import { buildTopology, isWatertight } from "./topology"
import { recentre, toSceneFrame, type SourceFrame } from "./transform"

/** One mesh as a loader hands it over, in the source file's units and axes. */
export interface SourceMesh {
  name: string
  positions: Float32Array
  /** Authored normals (STEP B-rep, glTF). Omit for facet-only formats (STL): rebuilt. */
  normals?: Float32Array
  /** Omit for triangle soup (3 vertices per triangle). */
  indices?: Uint32Array
  /** B-rep faces as inclusive triangle ranges (occt `brep_faces`); else faces are grown. */
  faceRanges?: { first: number; last: number }[]
  /** Linear RGB 0..1. */
  color?: Vec3 | null
}

/** A normalized asset ready to store, plus what the document needs to place it. */
export interface PreparedAsset {
  name: string
  id: AssetId
  glb: Uint8Array
  /** Where the part goes so it appears where it was in the source (bbox centre, mm). */
  offsetMm: Vec3
  triangleCount: number
  /** Part-local bounds (centred). */
  bboxMm: Bounds
  watertight: boolean
  /** Only for watertight meshes: the formulas need a closed surface. */
  volumeMm3?: number
  centroidMm?: Vec3
  faceCount: number
}

/** SHA-256 as lowercase hex: the content address of an asset (Web Crypto: Node, browsers, workers). */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes.slice().buffer)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("")
}

const validRanges = (ranges: { first: number; last: number }[] | undefined, triangles: number) =>
  ranges !== undefined &&
  ranges.length > 0 &&
  ranges.every(
    (r, i) =>
      r.first <= r.last &&
      r.last < triangles &&
      (i === 0 || r.first === (ranges[i - 1]?.last ?? -1) + 1)
  ) &&
  (ranges.at(-1)?.last ?? -1) === triangles - 1

/**
 * Normalizes one mesh (PLAN 4.5/4.6): scene units and axes, normals, recentring, faces and
 * their classification, outline normals, mass properties when closed, GLB bytes and their
 * SHA-256. Pure and deterministic, so it runs the same in the import worker and in Node (the
 * Phase 14 pack builder). Returns null for a mesh with no triangles.
 */
export async function prepareAsset(
  source: SourceMesh,
  frame: SourceFrame
): Promise<PreparedAsset | null> {
  const count = source.positions.length / 3
  const indices = source.indices ?? Uint32Array.from({ length: count }, (_, i) => i)
  if (indices.length < 3) return null
  const raw: MeshData = {
    positions: source.positions,
    normals: source.normals ?? new Float32Array(source.positions.length),
    indices,
  }
  let mesh = toSceneFrame(raw, frame)
  const brep = validRanges(source.faceRanges, indices.length / 3) ? source.faceRanges : undefined
  if (!source.normals) mesh = creasedNormals(mesh) // keeps triangle order, so B-rep ranges hold
  const centred = recentre(mesh)
  mesh = centred.mesh
  const bounds = meshBounds(mesh)
  const reach = [...centred.offsetMm, ...bounds.min, ...bounds.max].map(Math.abs)
  // NaN fails the comparison too, so it is refused as well.
  if (!reach.every((v) => v <= MAX_COORDINATE_MM))
    throw new Error("It reaches more than 100 km from the origin: check the import unit.")
  const topology = buildTopology(mesh)
  const watertight = isWatertight(topology)
  let mass = watertight ? volumeAndCentroid(mesh) : undefined
  if (mass && mass.volumeMm3 < 0) {
    mesh = turnInsideOut(mesh) // closed but wound inward: flip so normals face outward
    mass = volumeAndCentroid(mesh)
  }
  let ranges = brep
  if (!ranges) {
    const grown = growFaces(mesh, undefined, topology)
    const ordered = orderByFace(mesh.indices, grown.faceOf, grown.count)
    mesh = { ...mesh, indices: ordered.indices }
    ranges = ordered.ranges
  }
  const faces = classifyFaces(mesh, ranges)
  const hullNormals = computeHullNormals(mesh.positions, mesh.indices, mesh.normals)
  const glb = encodeGlb({ mesh, hullNormals, faces, baseColor: source.color ?? null })
  return {
    name: source.name,
    id: AssetIdSchema.parse(await sha256Hex(glb)),
    glb,
    offsetMm: centred.offsetMm,
    triangleCount: mesh.indices.length / 3,
    bboxMm: bounds,
    watertight,
    ...(mass ?? {}),
    faceCount: faces.length,
  }
}

/** Reverses every triangle's winding and every normal. */
function turnInsideOut(mesh: MeshData): MeshData {
  const indices = mesh.indices.slice()
  for (let t = 0; t < indices.length; t += 3) {
    const b = indices[t + 1] ?? 0
    indices[t + 1] = indices[t + 2] ?? 0
    indices[t + 2] = b
  }
  return { ...mesh, indices, normals: mesh.normals.map((n) => -n) }
}
