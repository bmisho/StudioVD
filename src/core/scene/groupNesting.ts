import { groupsTooDeep, SCENE_LIMITS, type SceneDocument } from "@/core/schema"

/**
 * Whether giving some groups new parents (`moves`: group id → parent id, new groups
 * included) would nest a group deeper than a saved file may (PLAN 5.1: Open refuses it).
 */
export function nestsTooDeep(
  groups: SceneDocument["groups"],
  moves: Readonly<Record<string, string | null>>
): boolean {
  const parents: Record<string, { parentId: string | null }> = {}
  for (const [id, group] of Object.entries(groups)) parents[id] = { parentId: group.parentId }
  for (const [id, parentId] of Object.entries(moves)) parents[id] = { parentId }
  return groupsTooDeep(parents, SCENE_LIMITS.maxGroupDepth).length > 0
}
