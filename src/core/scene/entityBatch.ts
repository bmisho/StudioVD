import {
  AnchorSchema,
  checkIntegrity,
  ComponentDefSnapshotSchema,
  ComponentInstanceSchema,
  GeometryAssetSchema,
  GroupSchema,
  LicenseTextSchema,
  MaterialSchema,
  MateSchema,
  PartSchema,
  TextureSchema,
  type Anchor,
  type ComponentDefSnapshot,
  type ComponentInstance,
  type GeometryAsset,
  type Group,
  type LicenseText,
  type Mate,
  type Material,
  type Part,
  type SceneDocument,
  type Texture,
} from "@/core/schema"

/** Entities inserted together as ONE undoable change (the test rig, an import, a component). */
export interface EntityBatch {
  assets?: readonly GeometryAsset[]
  textures?: readonly Texture[]
  materials?: readonly Material[]
  /** Parents may be in the document or earlier in this list. */
  groups?: readonly Group[]
  parts?: readonly Part[]
  anchors?: readonly Anchor[]
  mates?: readonly Mate[]
  /** Content-keyed like assets: one already in the document is kept as it is. */
  componentDefs?: readonly ComponentDefSnapshot[]
  components?: readonly ComponentInstance[]
  /** By the SHA-256 of the text. */
  licenseTexts?: readonly { sha256: string; text: LicenseText }[]
}

const has = (record: object, id: string) => Object.hasOwn(record, id)

/**
 * Validates a batch against the document it goes into. Returns the problems, empty when the
 * batch is valid: each entity passes its schema, ids are new (an asset may already exist,
 * since assets are content addressed), and every reference resolves in the document or the
 * batch. Then the merged document must pass the same integrity rules as an opened file (caps,
 * group depth, mates across two parts): store actions never write a document that Open would
 * refuse (PLAN 5.1).
 */
export function entityBatchProblems(doc: SceneDocument, batch: EntityBatch): string[] {
  const problems: string[] = []
  const check = (ok: boolean, message: string) => {
    if (!ok) problems.push(message)
  }
  const assets = new Set(batch.assets?.map((a) => a.id))
  const groups = new Set<string>()
  const parts = new Set(batch.parts?.map((p) => p.id))
  const anchors = new Set(batch.anchors?.map((a) => a.id))

  for (const a of batch.assets ?? []) {
    check(GeometryAssetSchema.safeParse(a).success, `asset ${a.id} fails its schema`)
  }
  for (const g of batch.groups ?? []) {
    check(GroupSchema.safeParse(g).success, `group ${g.id} fails its schema`)
    check(!has(doc.groups, g.id) && !groups.has(g.id), `group ${g.id} already exists`)
    const parentKnown = g.parentId === null || has(doc.groups, g.parentId) || groups.has(g.parentId)
    check(parentKnown, `group ${g.id}: unknown parent`)
    groups.add(g.id)
  }
  for (const p of batch.parts ?? []) {
    check(PartSchema.safeParse(p).success, `part ${p.id} fails its schema`)
    check(!has(doc.parts, p.id), `part ${p.id} already exists`)
    check(has(doc.assets, p.assetId) || assets.has(p.assetId), `part ${p.id}: unknown asset`)
    const groupKnown = p.parentId === null || has(doc.groups, p.parentId) || groups.has(p.parentId)
    check(groupKnown, `part ${p.id}: unknown group`)
  }
  for (const a of batch.anchors ?? []) {
    check(AnchorSchema.safeParse(a).success, `anchor ${a.id} fails its schema`)
    check(!has(doc.anchors, a.id), `anchor ${a.id} already exists`)
    check(has(doc.parts, a.partId) || parts.has(a.partId), `anchor ${a.id}: unknown part`)
  }
  for (const m of batch.mates ?? []) {
    check(MateSchema.safeParse(m).success, `mate ${m.id} fails its schema`)
    check(!has(doc.mates, m.id), `mate ${m.id} already exists`)
    for (const end of [m.anchorA, m.anchorB]) {
      check(has(doc.anchors, end) || anchors.has(end), `mate ${m.id}: unknown anchor`)
    }
  }
  for (const t of batch.textures ?? [])
    check(TextureSchema.safeParse(t).success, `texture ${t.id} fails its schema`)
  for (const m of batch.materials ?? []) {
    check(MaterialSchema.safeParse(m).success, `material ${m.id} fails its schema`)
    check(!has(doc.materials, m.id), `material ${m.id} already exists`)
  }
  for (const d of batch.componentDefs ?? [])
    check(ComponentDefSnapshotSchema.safeParse(d).success, `definition ${d.key} fails its schema`)
  for (const c of batch.components ?? []) {
    check(ComponentInstanceSchema.safeParse(c).success, `component ${c.id} fails its schema`)
    check(!has(doc.components, c.id), `component ${c.id} already exists`)
  }
  for (const l of batch.licenseTexts ?? [])
    check(LicenseTextSchema.safeParse(l.text).success, `licence text ${l.sha256} fails its schema`)
  if (problems.length > 0) return problems
  return checkIntegrity(mergeBatch(doc, batch)).map((p) => `${p.path}: ${p.message}`)
}

function add<K extends string, T extends { id: K }>(
  into: Readonly<Record<K, T>>,
  list: readonly T[] = []
): Record<K, T> {
  const out: Record<K, T> = { ...into }
  for (const e of list) out[e.id] = e // ids passed their schema above: UUIDs or hashes
  return out
}

/** Content-keyed records: the document's copy wins (the same key names the same content). */
function keep<K extends string, T>(into: Readonly<Record<K, T>>, list: readonly [string, T][]) {
  const out: Record<string, T> = { ...into }
  for (const [key, value] of list) if (!Object.hasOwn(out, key)) out[key] = value
  return out as Record<K, T>
}

/** The document with the batch in it (what `insertEntities` writes). */
export const mergeBatch = (doc: SceneDocument, batch: EntityBatch): SceneDocument => ({
  ...doc,
  assets: keep(
    doc.assets,
    (batch.assets ?? []).map((a) => [a.id, a])
  ),
  textures: keep(
    doc.textures,
    (batch.textures ?? []).map((t) => [t.id, t])
  ),
  materials: add(doc.materials, batch.materials),
  groups: add(doc.groups, batch.groups),
  parts: add(doc.parts, batch.parts),
  anchors: add(doc.anchors, batch.anchors),
  mates: add(doc.mates, batch.mates),
  componentDefs: keep(
    doc.componentDefs,
    (batch.componentDefs ?? []).map((d) => [d.key, d])
  ),
  components: add(doc.components, batch.components),
  licenseTexts: keep(
    doc.licenseTexts,
    (batch.licenseTexts ?? []).map((l) => [l.sha256, l.text])
  ),
})
