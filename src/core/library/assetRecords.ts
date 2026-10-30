import type { PreparedAsset } from "@/core/geometry/prepareAsset"
import {
  AssetIdSchema,
  type AssetLicense,
  type GeometryAsset,
  type GeometryRef,
  type LicenseGrant,
} from "@/core/schema"

/** The scene record of an asset prepared in this app (a generator's body, an import). */
export function assetFromPrepared(a: Omit<PreparedAsset, "glb" | "name">): GeometryAsset {
  // `+ 0`: no -0 (JSON would read it back as 0, and scene.json must reopen unchanged).
  const v = (p: readonly [number, number, number]): [number, number, number] => [
    p[0] + 0,
    p[1] + 0,
    p[2] + 0,
  ]
  return {
    id: a.id,
    path: `geometry/${a.id}.glb`,
    triangleCount: a.triangleCount,
    bboxMm: { min: v(a.bboxMm.min), max: v(a.bboxMm.max) },
    watertight: a.watertight,
    ...(a.volumeMm3 !== undefined && { volumeMm3: a.volumeMm3 }),
    ...(a.centroidMm && { centroidMm: v(a.centroidMm) }),
    ...(a.slots.length >= 2 && { slots: [...a.slots] }),
  }
}

/** A manifest licence grant as an asset's licence: its text by hash (one of `licenseTexts`). */
export function assetLicense(grant: LicenseGrant): AssetLicense {
  const { licenseText, ...rest } = grant
  return { ...rest, ...(licenseText && { licenseText: licenseText.sha256 }) }
}

/** The scene record of a pack's GLB, as its manifest describes it, under the geometry licence. */
export function assetFromManifest(
  ref: Extract<GeometryRef, { kind: "asset" }>,
  license: LicenseGrant
): GeometryAsset {
  return {
    id: AssetIdSchema.parse(ref.sha256),
    path: `geometry/${ref.sha256}.glb`,
    triangleCount: ref.triangles,
    bboxMm: { min: [...ref.bboxMm.min], max: [...ref.bboxMm.max] },
    ...(ref.watertight !== undefined && { watertight: ref.watertight }),
    ...(ref.volumeMm3 !== undefined && { volumeMm3: ref.volumeMm3 }),
    ...(ref.centroidMm && { centroidMm: [...ref.centroidMm] }),
    ...(ref.slots && { slots: [...ref.slots] }),
    license: assetLicense(license),
  }
}
