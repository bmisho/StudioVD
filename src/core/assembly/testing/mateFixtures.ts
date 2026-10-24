// Test helper (not app code): parts, anchors and mates for assembly tests, no geometry.
import {
  newId,
  type Anchor,
  type AnchorId,
  type AssetId,
  type Mate,
  type MateId,
  type MateType,
  type Part,
  type PartId,
  type Pose,
  type SceneDocument,
  type Vec3,
} from "@/core/schema"

export type MateDoc = Pick<SceneDocument, "parts" | "anchors" | "mates">

export function part(name: string, grounded = false, pose?: Pose): Part {
  return {
    id: newId<PartId>(),
    name,
    assetId: "a".repeat(64) as AssetId,
    parentId: null,
    pose: pose ?? { positionMm: [0, 0, 0], quaternion: [0, 0, 0, 1] },
    materialId: null,
    grounded,
    visible: true,
    collider: "box",
  }
}

export function anchor(
  on: Part,
  originMm: Vec3,
  z: Vec3 = [0, 0, 1],
  x: Vec3 = [1, 0, 0],
  kind: Anchor["kind"] = "axial"
): Anchor {
  return {
    id: newId<AnchorId>(),
    partId: on.id,
    kind,
    frame: { originMm, z, x },
    source: { kind: "manual" },
  }
}

export function mate(
  a: Anchor,
  b: Anchor,
  type: MateType = "revolute",
  extra: Partial<Mate> = {}
): Mate {
  return {
    id: newId<MateId>(),
    type,
    anchorA: a.id,
    anchorB: b.id,
    flip: false,
    angleOffsetRad: 0,
    contactsEnabled: false,
    suppressed: false,
    ...extra,
  }
}

const byId = <T extends { id: string }>(items: readonly T[]) =>
  Object.fromEntries(items.map((i) => [i.id, i])) as Record<T["id"], T>

export const mateDoc = (parts: Part[], anchors: Anchor[], mates: Mate[] = []): MateDoc => ({
  parts: byId(parts),
  anchors: byId(anchors),
  mates: byId(mates),
})

/** A small deterministic generator (tests must not depend on Math.random). */
export function prng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}
