import type { GeometryAsset, Part, SceneDocument } from "@/core/schema"
import { TRIANGLE_BUDGET } from "./importOptions"

/** Triangles drawn for these parts: every part draws its asset, shared assets included. */
export function triangleCount(
  parts: readonly Pick<Part, "assetId">[],
  assets: Readonly<Record<string, Pick<GeometryAsset, "triangleCount">>>
): number {
  let total = 0
  for (const part of parts) {
    if (Object.hasOwn(assets, part.assetId)) total += assets[part.assetId]?.triangleCount ?? 0
  }
  return total
}

/**
 * Warning shown after an import that leaves the scene over the triangle budget (CLAUDE.md §6:
 * ~2-3 M triangles orbit at 60 fps on an integrated GPU). Counts every part, hidden ones too,
 * since they can be shown again. Null when the scene is within budget.
 */
export function triangleBudgetWarning(
  doc: Pick<SceneDocument, "parts" | "assets">,
  added: { parts: readonly Pick<Part, "assetId">[]; assets: readonly GeometryAsset[] },
  budget: number = TRIANGLE_BUDGET
): string | null {
  const assets: Record<string, Pick<GeometryAsset, "triangleCount">> = { ...doc.assets }
  for (const a of added.assets) assets[a.id] = a
  const total = triangleCount([...Object.values(doc.parts), ...added.parts], assets)
  if (total <= budget) return null
  const millions = (n: number) => (n / 1e6).toFixed(1)
  return (
    `The scene now has ${millions(total)} M triangles, more than the ${millions(budget)} M ` +
    "budget, so the 3D view may stutter. Re-import STEP/IGES files with coarse quality, " +
    "or hide parts you do not need."
  )
}
