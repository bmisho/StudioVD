import type { LicenseGrant } from "./component/license"
import type { SceneDocument } from "./document"
import type { ComponentDefSnapshot } from "./library"

const has = (record: object, id: unknown): boolean =>
  typeof id === "string" && Object.hasOwn(record, id)

/** The licence texts a component definition's manifest names (geometry, data, thumbnail). */
export function manifestLicenseTexts(def: ComponentDefSnapshot): string[] {
  const { geometry, data, thumbnail } = def.manifest.license
  return [geometry, data, thumbnail]
    .filter((g): g is LicenseGrant => g !== undefined)
    .flatMap((g) => (g.licenseText ? [g.licenseText.sha256] : []))
}

/**
 * Library references (PLAN 4.6, Phase 9): each component instance names an existing
 * definition and its own group, and every entity it lists exists and points back to it
 * (parts by `componentRef`, anchors by a `component` source); designators are unique; licence
 * texts named by asset licences and definitions are in the bundle.
 */
export function checkComponentRefs(
  doc: SceneDocument,
  report: (path: string, message: string) => void
): void {
  const missing = "refers to something that is missing"
  const designators = new Map<string, string>()
  const groups = new Map<string, string>()
  for (const [id, c] of Object.entries(doc.components)) {
    const at = `components.${id}`
    if (c.def !== null && !has(doc.componentDefs, c.def)) report(`${at}.def`, missing)
    if (!has(doc.groups, c.groupId)) report(`${at}.groupId`, missing)
    const sameGroup = groups.get(c.groupId)
    if (sameGroup !== undefined) report(`${at}.groupId`, `is also component ${sameGroup}'s group`)
    groups.set(c.groupId, id)
    const sameName = designators.get(c.designator)
    if (sameName !== undefined) report(`${at}.designator`, "is already used")
    designators.set(c.designator, id)
    for (const [key, partId] of Object.entries(c.parts)) {
      const part = has(doc.parts, partId) ? doc.parts[partId] : undefined
      if (!part) report(`${at}.parts.${key}`, missing)
      else if (part.componentRef?.instance !== id || part.componentRef.key !== key)
        report(`${at}.parts.${key}`, "names a part that does not name it back")
    }
    for (const [key, anchorId] of Object.entries(c.anchors)) {
      const source = has(doc.anchors, anchorId) ? doc.anchors[anchorId]?.source : undefined
      if (!source) report(`${at}.anchors.${key}`, missing)
      else if (source.kind !== "component" || source.instance !== id || source.key !== key)
        report(`${at}.anchors.${key}`, "names an anchor that does not name it back")
    }
    for (const [key, mateId] of Object.entries(c.mates))
      if (!has(doc.mates, mateId)) report(`${at}.mates.${key}`, missing)
    for (const [key, materialId] of Object.entries(c.materials))
      if (!has(doc.materials, materialId)) report(`${at}.materials.${key}`, missing)
    for (const [key, bindingId] of Object.entries(c.bindings))
      if (!has(doc.bindings, bindingId)) report(`${at}.bindings.${key}`, missing)
    if (c.nodeId !== undefined && !has(doc.schematic.nodes, c.nodeId))
      report(`${at}.nodeId`, missing)
  }

  const listed = (instance: string, map: "parts" | "anchors", key: string, id: string) =>
    has(doc.components, instance) &&
    doc.components[instance as keyof typeof doc.components]?.[map][key] === id
  for (const [id, part] of Object.entries(doc.parts))
    if (
      part.componentRef &&
      !listed(part.componentRef.instance, "parts", part.componentRef.key, id)
    )
      report(`parts.${id}.componentRef`, "names a component that does not list it")
  for (const [id, anchor] of Object.entries(doc.anchors)) {
    const s = anchor.source
    if (s.kind === "component" && !listed(s.instance, "anchors", s.key, id))
      report(`anchors.${id}.source`, "names a component that does not list it")
  }

  for (const [id, asset] of Object.entries(doc.assets)) {
    const text = asset.license?.licenseText
    if (text !== undefined && !has(doc.licenseTexts, text))
      report(`assets.${id}.license.licenseText`, missing)
  }
  for (const [key, def] of Object.entries(doc.componentDefs))
    for (const sha of manifestLicenseTexts(def))
      if (!has(doc.licenseTexts, sha)) report(`componentDefs.${key}.manifest.license`, missing)
}
