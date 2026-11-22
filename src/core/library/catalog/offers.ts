import { compareVersions, parseVersion, type Version } from "@/core/schema/component/semver"
import type { CatalogIndex, ComponentInstanceId, SceneDocument } from "@/core/schema"
import type { InstalledRecord } from "../items"

// Component updates in a project (PLAN 4.6, 14.6): a newer version of a placed component,
// installed or in the catalog. Same MAJOR is an Update (ids kept by key); a higher MAJOR is a
// Replace (new entities in the same place). Offered only from what the user refreshed or
// installed, never fetched for this.

export interface ComponentOffer {
  kind: "update" | "replace"
  id: string
  from: string
  to: string
  /** The newer version is installed; otherwise its pack must be downloaded first. */
  installed: boolean
  /** The catalog pack holding it, when it is not installed. */
  pack?: string
}

type Doc = Pick<SceneDocument, "components" | "componentDefs">

/** The best offer per placed component (generators and unlinked ones get none). */
export function componentOffers(
  doc: Doc,
  installed: readonly InstalledRecord[],
  index: CatalogIndex | null
): Partial<Record<ComponentInstanceId, ComponentOffer>> {
  const versions = new Map<
    string,
    { version: string; v: Version; installed: boolean; pack?: string }[]
  >()
  const add = (id: string, version: string, isInstalled: boolean, pack?: string) => {
    const v = parseVersion(version)
    if (!v) return
    const list = versions.get(id) ?? []
    const same = list.find((e) => e.version === version)
    if (same) same.installed ||= isInstalled
    else list.push({ version, v, installed: isInstalled, ...(pack && { pack }) })
    versions.set(id, list)
  }
  for (const r of installed) add(r.id, r.version, true)
  for (const c of index?.components ?? []) add(c.id, c.version, false, c.pack)

  const out: Partial<Record<ComponentInstanceId, ComponentOffer>> = {}
  for (const c of Object.values(doc.components)) {
    const def =
      c.def && Object.hasOwn(doc.componentDefs, c.def) ? doc.componentDefs[c.def] : undefined
    if (!def || c.unlinked || def.origin === "generator") continue
    const now = parseVersion(def.version)
    if (!now) continue
    const newer = (versions.get(def.id) ?? []).filter(
      (e) => compareVersions(e.v, now) > 0 && e.v.pre.length === 0
    )
    const best = (pick: typeof newer) =>
      pick.reduce<(typeof newer)[number] | undefined>(
        (a, e) => (!a || compareVersions(e.v, a.v) > 0 ? e : a),
        undefined
      )
    const update = best(newer.filter((e) => e.v.core[0] === now.core[0]))
    const replace = best(newer.filter((e) => e.v.core[0] > now.core[0]))
    const chosen = update ?? replace
    if (!chosen) continue
    out[c.id] = {
      kind: update ? "update" : "replace",
      id: def.id,
      from: def.version,
      to: chosen.version,
      installed: chosen.installed,
      ...(!chosen.installed && chosen.pack && { pack: chosen.pack }),
    }
  }
  return out
}
