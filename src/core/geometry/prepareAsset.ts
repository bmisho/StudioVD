import { computeHullNormals } from "@/core/math/hullNormals"
import { AssetIdSchema, MAX_COORDINATE_MM, type AssetId, type Vec3 } from "@/core/schema"
import { classifyFaces } from "./classify"
import { creasedNormals } from "./creasedNormals"
import { encodeGlb } from "./glbWrite"
import { volumeAndCentroid } from "./massProperties"
import { dropUnusedVertices, meshBounds, type Bounds, type MeshData } from "./meshData"
import { growFaces, orderByFace } from "./segment"
import { groupBySlot, normalizeSlots, slotNames, type AssetSlot, type SourceSlot } from "./slots"
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
  /** Linear RGB 0..1, for a single-colour mesh (ignored when `slots` is given). */
  color?: Vec3 | null
  /** Material regions (PLAN 6.1), with `triangleSlots[t]` the slot of source triangle `t`. */
  slots?: SourceSlot[]
  triangleSlots?: Uint16Array
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
  /** Slot names when the asset has two or more material slots, else empty. */
  slots: string[]
  /** Source materials beyond the slot limit were merged into the last slot. */
  slotsFolded: boolean
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
  const raw = dropUnusedVertices({
    positions: source.positions,
    normals: source.normals ?? new Float32Array(source.positions.length),
    indices,
  })
  let mesh = toSceneFrame(raw, frame)
  const triangles = indices.length / 3
  const multi = source.slots && source.triangleSlots?.length === triangles
  const sourceSlots: SourceSlot[] = multi
    ? (source.slots ?? [])
    : [{ name: null, color: source.color ?? null }]
  const normalized = normalizeSlots(
    sourceSlots,
    multi ? (source.triangleSlots ?? []) : new Uint16Array(triangles)
  )
  let slotOf = normalized.slotOf
  // An empty occt face (no triangles) would otherwise fail the range check and drop all faces.
  const faceRanges = source.faceRanges?.filter((r) => r.last >= r.first)
  const brep =
    validRanges(faceRanges, triangles) && faceRanges?.every((r) => sameSlot(slotOf, r))
      ? faceRanges
      : undefined
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
    const grown = growFaces(
      mesh,
      undefined,
      topology,
      normalized.slots.length > 1 ? slotOf : undefined
    )
    const ordered = orderByFace(mesh.indices, grown.faceOf, grown.count)
    mesh = { ...mesh, indices: ordered.indices }
    ranges = ordered.ranges
    const before = slotOf
    slotOf = Uint16Array.from(ordered.order, (t) => before[t] ?? 0)
  }
  const grouped = groupBySlot(
    mesh.indices,
    ranges,
    ranges.map((r) => slotOf[r.first] ?? 0),
    normalized.slots.length
  )
  mesh = { ...mesh, indices: grouped.indices }
  const present = normalized.slots.flatMap((slot, i) => {
    const range = grouped.slotRanges[i]
    return range && range.first >= 0 ? [{ ...slot, ...range }] : []
  })
  const names = slotNames(present)
  const slots: AssetSlot[] =
    present.length > 1 ? present.map((s, i) => ({ ...s, name: names[i] ?? null })) : present
  const faces = classifyFaces(mesh, grouped.ranges)
  const hullNormals = computeHullNormals(mesh.positions, mesh.indices, mesh.normals)
  const glb = encodeGlb({ mesh, hullNormals, faces, slots })
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
    slots: slots.length > 1 ? names : [],
    slotsFolded: normalized.folded,
  }
}

/** Every triangle of a B-rep face is in one slot (faces must not straddle slots). */
function sameSlot(slotOf: Uint16Array, range: { first: number; last: number }): boolean {
  for (let t = range.first; t <= range.last; t++)
    if (slotOf[t] !== slotOf[range.first]) return false
  return true
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
