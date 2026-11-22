import { compareVersions, parseVersion } from "@/core/schema/component/semver"
import type { CatalogIndex } from "@/core/schema"
import type { InstalledRecord } from "../items"

// The catalog's packs as the Library manages them (PLAN 14.5): install, update, remove,
// revocations, old versions. Pure: the controller does the downloads.

export type PackStatus = "available" | "installed" | "partial" | "update"

export interface PackRow {
  pack: string
  label: string
  bytes: number
  components: { id: string; version: string }[]
  /** How many of its components are installed at exactly its version. */
  installed: number
  status: PackStatus
}

const at = (c: { id: string; version: string }) => `${c.id}@${c.version}`

/** One row per bundle, then one per pack no bundle names (labelled by its first component). */
export function packRows(index: CatalogIndex, installed: readonly InstalledRecord[]): PackRow[] {
  const have = new Set(installed.map(at))
  const ids = new Set(installed.map((r) => r.id))
  const row = (pack: string, label: string, components: PackRow["components"]): PackRow => {
    const n = components.filter((c) => have.has(at(c))).length
    const older = components.some((c) => !have.has(at(c)) && ids.has(c.id))
    const status: PackStatus =
      n === components.length && n > 0
        ? "installed"
        : older
          ? "update"
          : n > 0
            ? "partial"
            : "available"
    const bytes = Object.hasOwn(index.packs, pack) ? (index.packs[pack]?.bytes ?? 0) : 0
    return { pack, label, bytes, components, installed: n, status }
  }
  const rows = index.bundles.map((b) => row(b.pack, b.label, b.components))
  const named = new Set(index.bundles.map((b) => b.pack))
  const loose = new Map<string, { id: string; version: string; name: string }[]>()
  for (const c of index.components)
    if (!named.has(c.pack)) loose.set(c.pack, [...(loose.get(c.pack) ?? []), c])
  for (const [pack, list] of loose) {
    const first = list[0]?.name ?? pack.slice(0, 8)
    const label = list.length > 1 ? `${first} and ${list.length - 1} more` : first
    rows.push(
      row(
        pack,
        label,
        list.map(({ id, version }) => ({ id, version }))
      )
    )
  }
  return rows
}

/** Installed versions with a newer installed version of the same component. */
export function oldVersions(installed: readonly InstalledRecord[]): InstalledRecord[] {
  const newest = new Map<string, string>()
  for (const r of installed) {
    const best = newest.get(r.id)
    const [a, b] = [parseVersion(r.version), best ? parseVersion(best) : null]
    if (a && (!b || compareVersions(a, b) > 0)) newest.set(r.id, r.version)
  }
  return installed.filter((r) => newest.has(r.id) && newest.get(r.id) !== r.version)
}

export interface RevokedInstall {
  id: string
  version: string
  reason: string
  severity: "yanked" | "security"
}

/** Installed components the catalog has withdrawn, with why. */
export function revokedInstalls(
  index: CatalogIndex,
  installed: readonly InstalledRecord[]
): RevokedInstall[] {
  const have = new Set(installed.map(at))
  return index.revoked
    .filter((r) => have.has(at(r)))
    .map(({ id, version, reason, severity }) => ({ id, version, reason, severity }))
}
