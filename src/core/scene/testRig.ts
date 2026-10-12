import {
  AssetIdSchema,
  newId,
  type Anchor,
  type AnchorId,
  type GeometryAsset,
  type Mate,
  type MateId,
  type Part,
  type PartId,
  type Vec3,
} from "@/core/schema"

/**
 * Phase 3 physics test rig (PLAN 3.8) as REAL document entities, so selection, pruning, the
 * scene tree, undo and the physics world builder all work on it unchanged. In headless tests
 * the assets are placeholders (a valid content address whose `bboxMm` is the box to draw, no
 * file); the app inserts real box GLBs. The hinge is
 * a real revolute mate between two axial anchors (what Phase 8 produces), contacts enabled.
 *
 * Geometry (world mm, Y up): the base spans y 0..80 and x -60..60; the leaf lies on top with
 * a 1 mm gap (y 81..89, x 61..121). The hinge axis is +Z through (60.5, 81, 0), 0.5 mm from
 * both bodies, so the leaf swings down until its far edge hits the base's +X face at
 * -(90° + asin(0.5 / 60.5)) = -90.4735° (TEST_RIG_STOP_RAD).
 */
interface RigBox {
  name: string
  sizeMm: Vec3
  centerMm: Vec3
  grounded: boolean
}

export const TEST_RIG_BASE: RigBox = {
  name: "Base",
  sizeMm: [120, 80, 60],
  centerMm: [0, 40, 0],
  grounded: true,
}
export const TEST_RIG_LEAF: RigBox = {
  name: "Leaf",
  sizeMm: [60, 8, 60],
  centerMm: [91, 85, 0],
  grounded: false,
}
/** Hinge axis (+Z) through this world point. */
export const TEST_RIG_HINGE_MM: Vec3 = [60.5, 81, 0]
/** Leaf rotation about the hinge at which its far bottom edge touches the base's +X face. */
export const TEST_RIG_STOP_RAD = -(Math.PI / 2 + Math.asin(0.5 / 60.5))

export interface TestRig {
  assets: GeometryAsset[]
  parts: Part[]
  anchors: Anchor[]
  mates: Mate[]
}

/** Placeholder content address for headless tests ("7e57" = test): never a real SHA-256. */
const placeholderAssetId = (n: number) =>
  AssetIdSchema.parse(`7e57${n.toString(16).padStart(60, "0")}`)

/** Whether `id` is a test-rig placeholder: drawn as its box, no file to load. */
export const isPlaceholderAssetId = (id: string): boolean => /^7e570{52}[0-9a-f]{8}$/.test(id)

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]

function placeholderAsset(box: RigBox, n: number): GeometryAsset {
  const id = placeholderAssetId(n)
  const half: Vec3 = [box.sizeMm[0] / 2, box.sizeMm[1] / 2, box.sizeMm[2] / 2]
  return {
    id,
    path: `geometry/${id}.glb`,
    triangleCount: 12,
    bboxMm: { min: [-half[0], -half[1], -half[2]], max: half },
  }
}

function boxEntities(box: RigBox, asset: GeometryAsset): { asset: GeometryAsset; part: Part } {
  const id = asset.id
  return {
    asset,
    part: {
      id: newId<PartId>(),
      name: box.name,
      assetId: id,
      parentId: null,
      pose: { positionMm: [...box.centerMm], quaternion: [0, 0, 0, 1] },
      materialId: null,
      grounded: box.grounded,
      visible: true,
      collider: "box",
    },
  }
}

function hingeAnchor(part: Part, center: Vec3): Anchor {
  return {
    id: newId<AnchorId>(),
    partId: part.id,
    kind: "axial",
    frame: { originMm: sub(TEST_RIG_HINGE_MM, center), z: [0, 0, 1], x: [1, 0, 0] },
    name: "Hinge",
    source: { kind: "manual" },
  }
}

/**
 * Fresh ids on every call, so inserting the rig twice never collides (CLAUDE.md §3). The app
 * passes real box assets (`prepareTestRigAssets`); headless tests use placeholders.
 */
export function createTestRig(
  assets: readonly [GeometryAsset, GeometryAsset] = [
    placeholderAsset(TEST_RIG_BASE, 1),
    placeholderAsset(TEST_RIG_LEAF, 2),
  ]
): TestRig {
  const base = boxEntities(TEST_RIG_BASE, assets[0])
  const leaf = boxEntities(TEST_RIG_LEAF, assets[1])
  const anchorA = hingeAnchor(base.part, TEST_RIG_BASE.centerMm)
  const anchorB = hingeAnchor(leaf.part, TEST_RIG_LEAF.centerMm)
  const hinge: Mate = {
    id: newId<MateId>(),
    type: "revolute",
    anchorA: anchorA.id,
    anchorB: anchorB.id,
    flip: false,
    angleOffsetRad: 0,
    contactsEnabled: true, // PLAN 3.8: the leaf must hit the base's side face
    suppressed: false,
  }
  return {
    assets: [base.asset, leaf.asset],
    parts: [base.part, leaf.part],
    anchors: [anchorA, anchorB],
    mates: [hinge],
  }
}
