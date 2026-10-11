import type { PreparedAsset } from "@/core/geometry/prepareAsset"
import type { EntityBatch } from "@/core/scene/entityBatch"
import {
  newId,
  NameSchema,
  type GeometryAsset,
  type Group,
  type GroupId,
  type Part,
  type PartId,
  type SceneDocument,
} from "@/core/schema"

/** One imported part as the worker reports it, without the GLB bytes (stored separately). */
export interface ImportedPartInfo {
  name: string
  /** Group names from the file's hierarchy, outermost first. */
  path: string[]
  asset: Omit<PreparedAsset, "glb" | "name">
}

export interface ImportedFile {
  fileName: string
  parts: ImportedPartInfo[]
}

export interface ImportBatch extends EntityBatch {
  groups: Group[]
  parts: Part[]
  assets: GeometryAsset[]
  /** What to select afterwards: each file's outermost new group, or its part. */
  topLevel: ({ kind: "group"; id: GroupId } | { kind: "part"; id: PartId })[]
}

const MAX_NAME = 120

/** A display name the schema accepts: trimmed, never empty, at most 120 characters. */
export function cleanName(raw: string, fallback: string): string {
  const name = raw.replace(/\s+/g, " ").trim().slice(0, MAX_NAME).trim()
  return NameSchema.safeParse(name).success ? name : fallback
}

const baseName = (fileName: string) => fileName.replace(/\.[^.]+$/, "")

/**
 * Turns import results into document entities (PLAN 4.7). Each part is placed at its
 * recentring offset, so the assembly appears exactly where the file had it. A file with
 * several parts gets a group named after the file, unless all its parts already share one
 * outermost assembly node, which then becomes that group. Deeper hierarchy becomes nested
 * groups. A single-part file adds no group. The first part of an empty document is grounded.
 */
export function buildImportBatch(
  doc: Pick<SceneDocument, "parts">,
  files: readonly ImportedFile[]
): ImportBatch {
  const batch: ImportBatch = { assets: [], groups: [], parts: [], topLevel: [] }
  const seenAssets = new Set<string>()
  let groundNext = Object.keys(doc.parts).length === 0

  for (const file of files) {
    if (file.parts.length === 0) continue
    const single = file.parts.length === 1
    const firstHeads = new Set(file.parts.map((p) => p.path[0]))
    const sharedRoot = !single && firstHeads.size === 1 && file.parts[0]?.path[0] !== undefined
    const groupByKey = new Map<string, GroupId>()

    const groupFor = (path: readonly string[]): GroupId | null => {
      let parent: GroupId | null = null
      for (let depth = 1; depth <= path.length; depth++) {
        const key = path.slice(0, depth).join("\u0000")
        let id = groupByKey.get(key)
        if (!id) {
          id = newId<GroupId>()
          groupByKey.set(key, id)
          batch.groups.push({
            id,
            name: cleanName(path[depth - 1] ?? "", "Group"),
            parentId: parent,
          })
          if (parent === null) batch.topLevel.push({ kind: "group", id })
        }
        parent = id
      }
      return parent
    }

    for (const info of file.parts) {
      const path = single ? [] : sharedRoot ? info.path : [baseName(file.fileName), ...info.path]
      const parentId = groupFor(path)
      const { asset } = info
      if (!seenAssets.has(asset.id)) {
        seenAssets.add(asset.id)
        batch.assets.push({
          id: asset.id,
          path: `geometry/${asset.id}.glb`,
          triangleCount: asset.triangleCount,
          bboxMm: { min: [...asset.bboxMm.min], max: [...asset.bboxMm.max] },
          watertight: asset.watertight,
          ...(asset.volumeMm3 !== undefined ? { volumeMm3: asset.volumeMm3 } : {}),
          ...(asset.centroidMm ? { centroidMm: [...asset.centroidMm] } : {}),
        })
      }
      const part: Part = {
        id: newId<PartId>(),
        name: cleanName(info.name, cleanName(baseName(file.fileName), "Part")),
        assetId: asset.id,
        parentId,
        pose: { positionMm: [...asset.offsetMm], quaternion: [0, 0, 0, 1] },
        materialId: null,
        grounded: groundNext,
        visible: true,
        // The intended default (PLAN §2). Until Phase 10 builds hulls, physics uses the bbox.
        collider: "hull",
      }
      groundNext = false
      batch.parts.push(part)
      if (parentId === null) batch.topLevel.push({ kind: "part", id: part.id })
    }
  }
  return batch
}
