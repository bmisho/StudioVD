import type { Draft } from "immer"
import { cleanName } from "@/core/import/importBatch"
import { componentMaterials } from "@/core/library/componentMaterials"
import { copyFrame } from "@/core/library/instantiate"
import { compose, fromPose, invert, toPose } from "@/core/math/rigid"
import {
  newId,
  type AnchorId,
  type ComponentDefSnapshot,
  type ComponentInstanceId,
  type GeometryAsset,
  type MateId,
  type PartId,
  type SceneDocument,
} from "@/core/schema"
import { removeAnchors, removeMates, removeParts } from "./deletion"

const keyed = <T>(record: Record<string, T>, key: string): T | undefined =>
  Object.hasOwn(record, key) ? record[key] : undefined

/**
 * Edit parameters (PLAN 9.5): the instance takes definition `def`, keeping the ids of every
 * key both versions have, so mates from other parts to its anchors survive. Parts move with
 * the component frame (read off a surviving part); names the user changed and materials the
 * user set stay; keys the new version lacks go with what hangs on them; keys only the new one
 * has are created; what the user had deleted stays deleted. Throws when nothing is left to
 * locate the component by.
 */
export function regenerateInstance(
  d: Draft<SceneDocument>,
  id: ComponentInstanceId,
  def: ComponentDefSnapshot,
  assets: Record<string, GeometryAsset>
): void {
  const c = d.components[id]
  const old = c?.def ? keyed(d.componentDefs, c.def)?.manifest : undefined
  if (!c || !old) throw new Error("This component has no definition to regenerate from.")
  const next = def.manifest
  const anchorKey = [old.rootPart, ...Object.keys(c.parts)].find(
    (k) => keyed(c.parts, k) && keyed(old.parts, k)
  )
  const anchorPart = anchorKey ? d.parts[c.parts[anchorKey] as PartId] : undefined
  const anchorDef = anchorKey ? keyed(old.parts, anchorKey) : undefined
  if (!anchorKey || !anchorPart || !anchorDef) throw new Error("No part left to place it by.")
  const frame = compose(fromPose(anchorPart.pose), invert(fromPose(anchorDef.transform)))

  if (!Object.hasOwn(d.componentDefs, def.key)) d.componentDefs[def.key] = def
  for (const a of Object.values(assets)) if (!Object.hasOwn(d.assets, a.id)) d.assets[a.id] = a
  const wanted = {
    ...next,
    materials: Object.fromEntries(
      Object.entries(next.materials).filter(([k]) => !keyed(c.materials, k))
    ),
  }
  const fresh = componentMaterials(d, wanted)
  for (const m of fresh.added) d.materials[m.id] = m
  for (const t of fresh.textures) if (!Object.hasOwn(d.textures, t.id)) d.textures[t.id] = t
  Object.assign(c.materials, fresh.ids)
  const deleted = (map: Record<string, string>, key: string, before: object) =>
    Object.hasOwn(before, key) && !keyed(map, key)

  // Obsolete keys go last: removing first could leave the instance without parts (pruned).
  const obsolete = (map: Record<string, string>, keep: object) =>
    Object.entries(map).flatMap(([k, v]) => (Object.hasOwn(keep, k) ? [] : [v]))
  const gone = {
    parts: obsolete(c.parts, next.parts) as PartId[],
    anchors: obsolete(c.anchors, next.anchors) as AnchorId[],
    mates: obsolete(c.mates, next.mates) as MateId[],
  }
  for (const [key, p] of Object.entries(next.parts)) {
    if (deleted(c.parts, key, old.parts)) continue
    const asset = keyed(assets, key)
    if (!asset) throw new Error(`No geometry for part ${key}.`)
    const pose = toPose(compose(frame, fromPose(p.transform)))
    const existing = keyed(c.parts, key)
    const part = existing ? d.parts[existing] : undefined
    if (part) {
      if (part.name === cleanName(keyed(old.parts, key)?.name ?? "", "Part"))
        part.name = cleanName(p.name, "Part")
      part.assetId = asset.id
      part.pose = pose
      part.collider = p.collider
      const slots = part.materialSlots?.filter((s) => asset.slots?.includes(s.slot))
      if (slots && slots.length > 0) part.materialSlots = slots
      else delete part.materialSlots
      continue
    }
    const pid = newId<PartId>()
    c.parts[key] = pid
    d.parts[pid] = {
      id: pid,
      name: cleanName(p.name, "Part"),
      assetId: asset.id,
      parentId: c.groupId,
      pose,
      materialId: keyed(c.materials, p.material) ?? null,
      grounded: false,
      visible: true,
      collider: p.collider,
      componentRef: { instance: id, key },
    }
  }

  for (const [key, a] of Object.entries(next.anchors)) {
    const partId = keyed(c.parts, a.part)
    if (!partId || deleted(c.anchors, key, old.anchors)) continue
    const existing = keyed(c.anchors, key)
    const anchor = existing ? d.anchors[existing] : undefined
    const frame = copyFrame(a.frame)
    const fields = { partId, kind: a.kind, frame, ...(a.interface && { interface: a.interface }) }
    const name = cleanName(a.name, "Anchor")
    if (anchor) {
      const renamed = anchor.name !== cleanName(keyed(old.anchors, key)?.name ?? "", "Anchor")
      Object.assign(anchor, fields, renamed ? {} : { name })
      if (!a.interface) delete anchor.interface
      continue
    }
    const aid = newId<AnchorId>()
    c.anchors[key] = aid
    d.anchors[aid] = { id: aid, ...fields, name, source: { kind: "component", instance: id, key } }
  }

  for (const [key, m] of Object.entries(next.mates)) {
    const [anchorA, anchorB] = [keyed(c.anchors, m.anchorA), keyed(c.anchors, m.anchorB)]
    if (!anchorA || !anchorB || deleted(c.mates, key, old.mates)) continue
    const existing = keyed(c.mates, key)
    const mate = existing ? d.mates[existing] : undefined
    const fields = {
      type: m.type,
      anchorA,
      anchorB,
      flip: m.flip,
      angleOffsetRad: m.angleOffsetRad,
      contactsEnabled: m.contactsEnabled,
    }
    if (mate) {
      Object.assign(mate, fields)
      if (m.limits) mate.limits = { ...m.limits }
      else delete mate.limits
      continue
    }
    const mid = newId<MateId>()
    c.mates[key] = mid
    d.mates[mid] = {
      id: mid,
      ...fields,
      ...(m.limits && { limits: { ...m.limits } }),
      suppressed: false,
    }
  }
  for (const k of Object.keys(c.materials)) if (!keyed(next.materials, k)) delete c.materials[k]
  c.def = def.key
  removeMates(d, gone.mates)
  removeAnchors(d, gone.anchors)
  removeParts(d, gone.parts)
}
