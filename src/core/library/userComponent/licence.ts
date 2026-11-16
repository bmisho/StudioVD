import type {
  AssetLicense,
  ComponentDefSnapshot,
  ComponentLicense,
  LicenseGrant,
  Part,
  SceneDocument,
} from "@/core/schema"

// Licences of a saved component (PLAN 9.7, §4.3): the user's own grant for what they made,
// and every library licence inside it inherited automatically (the user cannot drop them).

export type UserLicence = "private" | "cc0" | "cc-by-4.0"
export type Inherited = NonNullable<ComponentLicense["inherited"]>[number]

export const USER_LICENCES: Record<
  UserLicence,
  { label: string; grant: Omit<LicenseGrant, "creators">; needsAuthor: boolean }
> = {
  private: {
    label: "All rights reserved (mine)",
    grant: {
      spdx: "LicenseRef-StudioVD-UserPrivate",
      attributionRequired: false,
      redistributable: false,
    },
    needsAuthor: false,
  },
  cc0: {
    label: "CC0 1.0 (public domain)",
    grant: {
      spdx: "CC0-1.0",
      licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
      attributionRequired: false,
      redistributable: true,
    },
    needsAuthor: false,
  },
  "cc-by-4.0": {
    label: "CC BY 4.0 (credit me)",
    grant: {
      spdx: "CC-BY-4.0",
      licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
      attributionRequired: true,
      redistributable: true,
    },
    needsAuthor: true,
  },
}

/** A scene asset's licence as a manifest grant: its text by pack path. */
export function grantOf(license: AssetLicense): LicenseGrant {
  const { licenseText, ...rest } = license
  return {
    ...rest,
    ...(licenseText && {
      licenseText: { path: `licenses/${licenseText}.txt`, sha256: licenseText },
    }),
  }
}

/** The definition a part came from: its instance's, else one whose manifest has its GLB. */
export function definitionOfPart(doc: SceneDocument, part: Part): ComponentDefSnapshot | undefined {
  const ref = part.componentRef
  const instance =
    ref && Object.hasOwn(doc.components, ref.instance) ? doc.components[ref.instance] : undefined
  if (instance?.def && Object.hasOwn(doc.componentDefs, instance.def))
    return doc.componentDefs[instance.def]
  return Object.values(doc.componentDefs).find((d) =>
    Object.values(d.manifest.parts).some(
      (p) => p.geometry.kind === "asset" && p.geometry.sha256 === part.assetId
    )
  )
}

/**
 * What `parts` inherit: each library component's geometry grant and what it inherited in turn,
 * or a part's own asset licence when no definition names it. The app's generators are ours
 * (CC0, no attribution) and add nothing; neither does the user's own earlier work (components
 * in `ownNamespace`: re-saving one must not bind it to its previous version's terms), though
 * what that work inherited from others still travels.
 */
export function inheritedLicences(
  doc: SceneDocument,
  parts: readonly Part[],
  ownNamespace?: string
): Inherited[] {
  const found = new Map<string, Inherited>()
  const add = (i: Inherited) => found.set(JSON.stringify(i), i)
  for (const part of parts) {
    const def = definitionOfPart(doc, part)
    if (def) {
      if (def.origin === "generator") continue
      const own = ownNamespace !== undefined && def.id.startsWith(`${ownNamespace}/`)
      if (!own)
        add({ component: def.id, version: def.version, grant: def.manifest.license.geometry })
      for (const i of def.manifest.license.inherited ?? []) add(i)
      continue
    }
    const asset = Object.hasOwn(doc.assets, part.assetId) ? doc.assets[part.assetId] : undefined
    if (asset?.license) add({ grant: grantOf(asset.license) })
  }
  return [...found.values()]
}

/** `A AND B AND (C WITH D)`: each distinct term once, compound ones in parentheses. */
export function andSpdx(terms: readonly string[]): string {
  const unique = [...new Set(terms)]
  if (unique.length === 1) return unique[0] ?? ""
  return unique.map((t) => (/\s/.test(t) ? `(${t})` : t)).join(" AND ")
}

/**
 * The component's licence: the user's grant for the data (anchors, names) and, joined with
 * everything inherited, for the geometry, which needs attribution when any part of it does
 * and may be passed on only when every part of it may.
 */
export function componentLicence(
  choice: UserLicence,
  author: string,
  year: number,
  inherited: readonly Inherited[]
): ComponentLicense {
  const own: LicenseGrant = {
    ...USER_LICENCES[choice].grant,
    creators: author ? [{ name: author }] : [],
    ...(author && choice !== "cc0" && { copyright: `© ${year} ${author}` }),
  }
  const spdx = andSpdx([own.spdx, ...inherited.map((i) => i.grant.spdx)])
  const { licenseUrl, ...rest } = own
  const geometry: LicenseGrant = {
    ...rest,
    ...(spdx === own.spdx && licenseUrl && { licenseUrl }),
    spdx,
    attributionRequired:
      own.attributionRequired || inherited.some((i) => i.grant.attributionRequired),
    redistributable: own.redistributable && inherited.every((i) => i.grant.redistributable),
  }
  return { geometry, data: own, ...(inherited.length > 0 && { inherited: [...inherited] }) }
}
