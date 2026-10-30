import type { AnyGenerator } from "@/core/generators/types"
import {
  readManifest,
  type ComponentManifest,
  type GeneratorParams,
  type LicenseGrant,
  type ValueSource,
} from "@/core/schema"

export type LibrarySource = "generators" | "installed" | "user"
export type LibraryBadge = "official" | "user" | "unverified" | "newer" | "invalid"

/** How a card is inserted (PLAN 4.6): run a generator, or copy an installed component. */
export type InsertRef =
  | { kind: "generator"; id: string; major: number; params: GeneratorParams }
  | {
      kind: "installed"
      id: string
      version: string
      origin: InstalledRecord["origin"]
      manifest: ComponentManifest
      manifestSha256: string
      text: string
    }

export interface LicenceLine {
  what: string
  spdx: string
  creators: string[]
  source?: string
  modifications?: string
  attributionRequired: boolean
}

/** One card of the Library tab. */
export interface LibraryItem {
  key: string
  source: LibrarySource
  name: string
  /** The family or kind under the name: the generator's name, the summary. */
  detail: string
  category: string[]
  tags: string[]
  badges: LibraryBadge[]
  /** A PNG in the library store, by SHA-256. */
  thumbnail?: string
  /** Null when it cannot be inserted (made for a newer StudioVD, or invalid). */
  insert: InsertRef | null
  licence: LicenceLine[]
  /** Where its numbers come from (generators' dimension tables). */
  sources: { what: string; source: ValueSource }[]
  /** Why it cannot be inserted. */
  note?: string
}

/** An installed component as the library lists it (src/lib/tauri/library.ts). */
export interface InstalledRecord {
  id: string
  version: string
  manifestSha256: string
  origin: "official" | "user" | "sideloaded"
  verified: boolean
  manifest: string
}

const line = (what: string, g: LicenseGrant): LicenceLine => ({
  what,
  spdx: g.spdx,
  creators: g.creators.map((c) => c.name),
  ...(g.sourceUrl && {
    source: g.sourceRevision ? `${g.sourceUrl} @ ${g.sourceRevision}` : g.sourceUrl,
  }),
  ...(g.modifications && { modifications: g.modifications }),
  attributionRequired: g.attributionRequired,
})

/** One card per preset of every generator (PLAN 9.4 "Generators"). */
export function generatorItems(generators: readonly AnyGenerator[]): LibraryItem[] {
  const ours: LicenceLine = {
    what: "Geometry and data",
    spdx: "CC0-1.0",
    creators: ["StudioVD"],
    attributionRequired: false,
  }
  return generators.flatMap((g) =>
    g.presets.map((p) => ({
      key: `gen:${g.id}@${g.major}:${p.key}`,
      source: "generators" as const,
      name: p.name,
      detail: g.name,
      category: g.category,
      tags: g.tags,
      badges: [],
      insert: { kind: "generator" as const, id: g.id, major: g.major, params: p.params },
      licence: [ours],
      sources: g.sources,
    }))
  )
}

/**
 * One card per installed component, its manifest read here as untrusted input (only a
 * signed catalog's are trusted): one made for a newer StudioVD lists as such, a broken one
 * as invalid, neither insertable.
 */
export function installedItems(
  records: readonly InstalledRecord[],
  appVersion: string
): LibraryItem[] {
  return records.map((r) => {
    const read = readManifest(
      new TextEncoder().encode(r.manifest),
      appVersion,
      r.origin === "official"
    )
    const origin: LibraryBadge =
      r.origin === "official" ? "official" : r.origin === "user" ? "user" : "unverified"
    const base = {
      key: `inst:${r.id}@${r.version}`,
      source: r.origin === "user" ? ("user" as const) : ("installed" as const),
      category: [],
      tags: [],
      licence: [],
      sources: [],
    }
    if (!read.ok) {
      const newer = read.reason === "newer"
      return {
        ...base,
        name: r.id,
        detail: `Version ${r.version}`,
        badges: [origin, newer ? "newer" : "invalid"],
        insert: null,
        note: newer ? `Needs StudioVD ${read.needs}.` : read.message,
      }
    }
    const m = read.manifest
    const { geometry, data } = m.license
    return {
      ...base,
      name: m.identity.name,
      detail: m.identity.summary ?? `${m.identity.id} ${m.identity.version}`,
      category: m.identity.category,
      tags: m.identity.tags,
      badges: [origin],
      ...(m.thumbnails[0] && { thumbnail: m.thumbnails[0].sha256 }),
      insert: {
        kind: "installed",
        id: r.id,
        version: r.version,
        origin: r.origin,
        manifest: m,
        manifestSha256: r.manifestSha256,
        text: r.manifest,
      },
      licence: [line("Geometry", geometry), line("Data", data)],
    }
  })
}
