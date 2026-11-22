import { CATEGORY_NAMES } from "@/core/sim/models/catalog"
import type { ModelDef } from "@/core/sim/models/define"
import { modelKey } from "@/core/sim/models/registry"
import type { LibraryItem } from "./items"

/**
 * The Library's "Schematic primitives" (PLAN 2.14, 9.4, 11.3): one card per built-in block;
 * inserting one adds it to the schematic, as the schematic toolbar's Add block does.
 */
export function primitiveItems(models: readonly ModelDef[]): LibraryItem[] {
  return models.map((m) => ({
    key: `blk:${modelKey(m)}`,
    source: "primitives" as const,
    name: m.name,
    detail: m.summary,
    category: ["schematic", m.category],
    tags: [m.id, CATEGORY_NAMES[m.category].toLowerCase()],
    badges: [],
    insert: { kind: "block" as const, model: modelKey(m) },
    licence: [],
    sources: [],
  }))
}
