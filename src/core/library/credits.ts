import type { LicenseGrant, PartId, SceneDocument } from "@/core/schema"
import { definitionOfPart, grantOf } from "./userComponent/licence"

/** One licence the project (or an export of some of its parts) must credit (PLAN 4.8). */
export interface Credit {
  key: string
  /** The component's name, or the part's for a model no definition names. */
  title: string
  /** `<id> <version>` of the component, when known. */
  origin?: string
  /** "Geometry", "Data", "Built from <id> <version>", or "Model". */
  role: string
  grant: LicenseGrant
  /** How many of the credited parts it covers. */
  parts: number
}

/**
 * What `parts` (default: every part) owe attribution for: each library component's geometry
 * grant (and its data grant with `data`), everything it inherited, and the licence of a model
 * no definition names. The app's generators are ours (CC0) and need no credit.
 */
export function projectCredits(
  doc: SceneDocument,
  parts?: Iterable<PartId>,
  options: { data?: boolean } = {}
): Credit[] {
  const found = new Map<string, Credit>()
  const add = (c: Omit<Credit, "parts">, counted: Set<string>) => {
    if (counted.has(c.key)) return
    counted.add(c.key)
    found.set(c.key, { ...c, parts: (found.get(c.key)?.parts ?? 0) + 1 })
  }
  const ids = parts ? [...parts] : (Object.keys(doc.parts) as PartId[])
  for (const id of ids) {
    const part = Object.hasOwn(doc.parts, id) ? doc.parts[id] : undefined
    if (!part) continue
    const counted = new Set<string>()
    const def = definitionOfPart(doc, part)
    if (def) {
      if (def.origin === "generator") continue
      const base = { title: def.manifest.identity.name, origin: `${def.id} ${def.version}` }
      const { geometry, data, inherited } = def.manifest.license
      add({ ...base, key: `${def.key}#geometry`, role: "Geometry", grant: geometry }, counted)
      if (options.data) add({ ...base, key: `${def.key}#data`, role: "Data", grant: data }, counted)
      for (const i of inherited ?? []) {
        const from = i.component ? `${i.component} ${i.version ?? ""}`.trim() : "a model"
        const key = `inherited#${JSON.stringify(i)}`
        add({ ...base, key, role: `Built from ${from}`, grant: i.grant }, counted)
      }
      continue
    }
    const asset = Object.hasOwn(doc.assets, part.assetId) ? doc.assets[part.assetId] : undefined
    if (!asset?.license) continue
    const grant = grantOf(asset.license)
    add({ key: `model#${JSON.stringify(grant)}`, title: part.name, role: "Model", grant }, counted)
  }
  return [...found.values()]
}

/** The creators of a grant, as one line. */
export const creditedTo = (g: LicenseGrant): string => g.creators.map((c) => c.name).join(", ")

/** The `.credits.txt` sidecar of an export: every credit as plain text, or "" for none. */
export function creditsText(credits: readonly Credit[], file: string): string {
  if (credits.length === 0) return ""
  const blocks = credits.map((c) => {
    const g = c.grant
    const revision = g.sourceRevision ? ` @ ${g.sourceRevision}` : ""
    return [
      `${c.title}${c.origin ? ` (${c.origin})` : ""}: ${c.role}`,
      `  Licence: ${g.spdx}${g.licenseUrl ? ` (${g.licenseUrl})` : ""}`,
      creditedTo(g) && `  By: ${creditedTo(g)}`,
      g.copyright && `  ${g.copyright}`,
      g.sourceUrl && `  Source: ${g.sourceUrl}${revision}`,
      g.modifications && `  Changes: ${g.modifications}`,
    ]
      .filter(Boolean)
      .join("\n")
  })
  const head = `Credits for ${file}\nMade with StudioVD. Parts of this model are licensed as follows.`
  return `${head}\n\n${blocks.join("\n\n")}\n`
}

/** glTF `asset.copyright` (one line) and `asset.extras` (structured) for a GLB export. */
export function glbCredits(
  credits: readonly Credit[]
): { copyright: string; extras: Record<string, unknown> } | null {
  if (credits.length === 0) return null
  const lines = credits.map(
    (c) => `${c.grant.copyright ?? (creditedTo(c.grant) || c.title)} (${c.grant.spdx})`
  )
  return {
    copyright: [...new Set(lines)].join("; "),
    extras: {
      studiovdCredits: credits.map((c) => ({
        title: c.title,
        ...(c.origin && { component: c.origin }),
        role: c.role,
        spdx: c.grant.spdx,
        creators: c.grant.creators.map((x) => x.name),
        ...(c.grant.copyright && { copyright: c.grant.copyright }),
        ...(c.grant.sourceUrl && { sourceUrl: c.grant.sourceUrl }),
        ...(c.grant.sourceRevision && { sourceRevision: c.grant.sourceRevision }),
        ...(c.grant.modifications && { modifications: c.grant.modifications }),
        ...(c.grant.licenseUrl && { licenseUrl: c.grant.licenseUrl }),
      })),
    },
  }
}
