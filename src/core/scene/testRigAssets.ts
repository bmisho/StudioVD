import { boxMesh } from "@/core/geometry/box"
import { prepareAsset } from "@/core/geometry/prepareAsset"
import type { GeometryAsset } from "@/core/schema"
import { TEST_RIG_BASE, TEST_RIG_LEAF } from "./testRig"

export interface RigAsset {
  asset: GeometryAsset
  glb: Uint8Array
}

/**
 * The rig's two boxes as real assets: GLBs and their SHA-256 addresses, through the same
 * normalization as an import. So an inserted rig loads, saves and reopens like any import.
 */
export async function prepareTestRigAssets(): Promise<[RigAsset, RigAsset]> {
  const prepare = async (size: readonly [number, number, number], name: string) => {
    const mesh = boxMesh(...size)
    const prepared = await prepareAsset(
      { name, positions: mesh.positions, normals: mesh.normals, indices: mesh.indices },
      { mmPerUnit: 1, upAxis: "y" }
    )
    if (!prepared) throw new Error("the rig box has no triangles")
    const { id, triangleCount, bboxMm, watertight, volumeMm3, centroidMm, glb } = prepared
    const asset: GeometryAsset = {
      id,
      path: `geometry/${id}.glb`,
      triangleCount,
      bboxMm: { min: [...bboxMm.min], max: [...bboxMm.max] },
      watertight,
      ...(volumeMm3 !== undefined ? { volumeMm3 } : {}),
      ...(centroidMm ? { centroidMm: [...centroidMm] } : {}),
    }
    return { asset, glb }
  }
  return Promise.all([
    prepare(TEST_RIG_BASE.sizeMm, TEST_RIG_BASE.name),
    prepare(TEST_RIG_LEAF.sizeMm, TEST_RIG_LEAF.name),
  ])
}
