import type { SceneDocument } from "@/core/schema"

/** Prefix for components whose manifest names none (a generic unit). */
export const DEFAULT_PREFIX = "U"

/**
 * The next free designator for `prefix` (PLAN 9.5: `M2`, `LED3`): one past the highest number
 * in use with that prefix, so deleting M1 never makes a new part M1 while M2 exists.
 */
export function nextDesignator(doc: Pick<SceneDocument, "components">, prefix: string): string {
  const pattern = new RegExp(`^${prefix}(\\d{1,5})$`)
  let highest = 0
  for (const c of Object.values(doc.components)) {
    const n = pattern.exec(c.designator)?.[1]
    if (n !== undefined) highest = Math.max(highest, Number(n))
  }
  return `${prefix}${Math.min(highest + 1, 99_999)}`
}
