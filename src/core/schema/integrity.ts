import { COLLECTION_CAPS, SCENE_LIMITS, SCHEMATIC_CAPS } from "./caps"
import type { SceneDocument } from "./document"
import type { DocumentProblem } from "./scanJson"

type Entity = { id?: unknown }
type Collection = Readonly<Record<string, Entity>>

const has = (record: object, id: unknown): boolean =>
  typeof id === "string" && Object.hasOwn(record, id)

/** Collections whose entities carry their own minted id (unique across all of them). */
const mintedCollections = (doc: SceneDocument): [string, Collection][] => [
  ["materials", doc.materials],
  ["groups", doc.groups],
  ["parts", doc.parts],
  ["anchors", doc.anchors],
  ["mates", doc.mates],
  ["couplings", doc.couplings],
  ["schematic.nodes", doc.schematic.nodes],
  ["schematic.edges", doc.schematic.edges],
  ["schematic.blockDefs", doc.schematic.blockDefs],
  ["bindings", doc.bindings],
  ["components", doc.components],
]

/**
 * One reference rule per field that names another entity. Phases that lift a gate
 * (`gates.ts`) add their rules here; GC and delete cascades can reuse the table.
 */
const REFERENCES = (doc: SceneDocument) =>
  [
    ["parts", doc.parts, "assetId", doc.assets, false],
    ["parts", doc.parts, "parentId", doc.groups, true],
    ["parts", doc.parts, "materialId", doc.materials, true],
    ["groups", doc.groups, "parentId", doc.groups, true],
    ["anchors", doc.anchors, "partId", doc.parts, false],
    ["mates", doc.mates, "anchorA", doc.anchors, false],
    ["mates", doc.mates, "anchorB", doc.anchors, false],
    ["couplings", doc.couplings, "mateA", doc.mates, false],
    ["couplings", doc.couplings, "mateB", doc.mates, false],
    ["schematic.nodes", doc.schematic.nodes, "blockDefId", doc.schematic.blockDefs, false],
    ["schematic.edges", doc.schematic.edges, "source", doc.schematic.nodes, false],
    ["schematic.edges", doc.schematic.edges, "target", doc.schematic.nodes, false],
  ] as const

/**
 * Cross-entity rules zod cannot express (PLAN 5.1), run on every opened scene.json before it
 * reaches the store, and before every save: record keys equal ids, minted ids are unique
 * across kinds, references resolve, group parents form no cycle, collections stay within
 * their caps. Returns at most `maxProblems` problems; empty means the document is sound.
 */
export function checkIntegrity(doc: SceneDocument, maxProblems = 50): DocumentProblem[] {
  const problems: DocumentProblem[] = []
  const report = (path: string, message: string) => {
    if (problems.length < maxProblems) problems.push({ path, message })
  }

  for (const [name, cap] of Object.entries(COLLECTION_CAPS)) {
    const count = Object.keys(doc[name as keyof typeof COLLECTION_CAPS]).length
    if (count > cap) report(name, `${count} entries; at most ${cap} are allowed`)
  }
  for (const [name, cap] of Object.entries(SCHEMATIC_CAPS)) {
    const count = Object.keys(doc.schematic[name as keyof typeof SCHEMATIC_CAPS]).length
    if (count > cap) report(`schematic.${name}`, `${count} entries; at most ${cap} are allowed`)
  }
  if (problems.length > 0) return problems // the rest would be slow on a hostile file

  const keyed: [string, Collection][] = [
    ["assets", doc.assets],
    ["textures", doc.textures],
    ...mintedCollections(doc),
  ]
  for (const [name, collection] of keyed)
    for (const [key, entity] of Object.entries(collection))
      if (entity.id !== key) report(`${name}.${key}.id`, "does not match its key")
  for (const [key, def] of Object.entries(doc.componentDefs))
    if (def.key !== key) report(`componentDefs.${key}.key`, "does not match its key")
  for (const [key, text] of Object.entries(doc.licenseTexts))
    if (text.path !== `licenses/${key}.txt`) report(`licenseTexts.${key}.path`, "does not match")

  const seen = new Map<string, string>()
  for (const [name, collection] of mintedCollections(doc))
    for (const key of Object.keys(collection)) {
      const first = seen.get(key)
      if (first !== undefined) report(`${name}.${key}`, `id already used in ${first}`)
      else seen.set(key, name)
    }

  for (const [name, from, field, to, nullable] of REFERENCES(doc))
    for (const [key, entity] of Object.entries(from)) {
      const ref = (entity as Record<string, unknown>)[field]
      if (nullable && ref === null) continue
      if (!has(to, ref)) report(`${name}.${key}.${field}`, "refers to something that is missing")
    }

  for (const [key, mate] of Object.entries(doc.mates)) {
    const a = has(doc.anchors, mate.anchorA) ? doc.anchors[mate.anchorA] : undefined
    const b = has(doc.anchors, mate.anchorB) ? doc.anchors[mate.anchorB] : undefined
    if (a && b && a.partId === b.partId) report(`mates.${key}`, "both anchors are on one part")
  }

  for (const key of groupsTooDeep(doc.groups, SCENE_LIMITS.maxGroupDepth))
    report(`groups.${key}.parentId`, "group parents form a cycle or nest too deeply")
  return problems
}

/** Groups whose parent chain loops or holds more than `maxDepth` groups. O(groups × depth). */
/** Groups whose chain of parents is longer than `maxDepth` (or ends in a cycle). */
export function groupsTooDeep(
  parents: Readonly<Record<string, { parentId: string | null }>>,
  maxDepth: number
): string[] {
  const bad: string[] = []
  for (const start of Object.keys(parents)) {
    let id: string | null = start
    let steps = 0
    // A missing parent ends the walk: that dangling reference is reported on its own.
    while (id !== null && has(parents, id) && steps <= maxDepth) {
      id = parents[id]?.parentId ?? null
      steps++
    }
    if (steps > maxDepth) bad.push(start)
  }
  return bad
}

/** Asset files the document names that the bundle does not hold (paths, sorted). */
export function missingFiles(doc: SceneDocument, present: ReadonlySet<string>): string[] {
  const needed = [
    ...Object.values(doc.assets).map((a) => a.path),
    ...Object.values(doc.textures).map((t) => t.path),
    ...Object.values(doc.licenseTexts).map((l) => l.path),
  ]
  return needed.filter((path) => !present.has(path)).sort()
}
