import { satisfies } from "@/core/schema/component/semver"
import type { CatalogIndex } from "@/core/schema"
import { installedItems, type InstalledRecord, type LibraryBadge, type LibraryItem } from "../items"

const MB = 1_000_000

/** A pack size as the cards say it. */
export const packSize = (bytes: number): string =>
  bytes < MB ? `${Math.max(1, Math.round(bytes / 1000))} kB` : `${(bytes / MB).toFixed(1)} MB`

/**
 * One card per catalog component (PLAN 14.5), searchable before anything is downloaded. An
 * installed one inserts like its installed card (and is listed only under Online catalog,
 * the Installed card standing for it elsewhere); the rest say which pack to download.
 */
export function catalogItems(
  index: CatalogIndex,
  installed: readonly InstalledRecord[],
  appVersion: string
): LibraryItem[] {
  const byKey = new Map(installed.map((r) => [`${r.id}@${r.version}`, r]))
  const revoked = new Map(
    index.revoked.map((r) => [`${r.id}@${r.version}`, { severity: r.severity, reason: r.reason }])
  )
  return index.components.map((c) => {
    const at = `${c.id}@${c.version}`
    const record = byKey.get(at)
    const ready = record ? installedItems([record], appVersion)[0] : undefined
    const bytes = Object.hasOwn(index.packs, c.pack) ? (index.packs[c.pack]?.bytes ?? 0) : 0
    const fits = satisfies(appVersion, c.requires.app)
    const withdrawn = revoked.get(at)
    const badges: LibraryBadge[] = ["official"]
    if (!fits) badges.push("newer")
    if (withdrawn) badges.push("revoked")
    const note = !fits
      ? `Needs StudioVD ${c.requires.app}.`
      : withdrawn
        ? `Withdrawn (${withdrawn.severity}): ${withdrawn.reason}`
        : c.deprecated
          ? `Deprecated: ${c.deprecated.reason}`
          : record
            ? undefined
            : `Download its pack (${packSize(bytes)}) to insert it.`
    return {
      key: `cat:${at}`,
      source: "catalog" as const,
      name: c.name,
      detail: c.summary,
      category: c.category,
      tags: [...c.tags, ...(c.vendor ? [c.vendor.toLowerCase()] : []), ...(c.mpn ? [c.mpn] : [])],
      badges,
      catalogThumbnail: c.thumbnail.sha256,
      insert: fits && ready?.insert ? ready.insert : null,
      licence: [
        { what: "Geometry", spdx: c.license.geometry, creators: [], attributionRequired: false },
        { what: "Data", spdx: c.license.data, creators: [], attributionRequired: false },
      ],
      sources: [],
      ...(note && { note }),
      ...(record && { ownSourceOnly: true }),
      catalog: {
        id: c.id,
        version: c.version,
        pack: c.pack,
        bytes,
        installed: record !== undefined,
        ...(withdrawn && { revoked: withdrawn }),
        ...(c.deprecated && { deprecated: c.deprecated.reason }),
      },
    }
  })
}
