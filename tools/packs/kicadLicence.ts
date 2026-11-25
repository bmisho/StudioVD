import type { LicenseGrant } from "@/core/schema"

/** Licences official content may carry (CLAUDE.md §12); anything else stops the build. */
export const ALLOWED_SPDX = [
  "CC0-1.0",
  "CC-BY-3.0",
  "CC-BY-4.0",
  "CC-BY-SA-4.0",
  "CC-BY-SA-4.0 WITH KiCad-libraries-exception",
  "MIT",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "Apache-2.0",
] as const

export const KICAD_SPDX = "CC-BY-SA-4.0 WITH KiCad-libraries-exception"
const REPOS = {
  packages3D: "https://gitlab.com/kicad/libraries/kicad-packages3D",
  footprints: "https://gitlab.com/kicad/libraries/kicad-footprints",
} as const

export function checkAllowed(spdx: string): void {
  if (!(ALLOWED_SPDX as readonly string[]).includes(spdx))
    throw new Error(`licence ${spdx} is not on the official content allowlist`)
}

/** A file's page at the pinned tag (each path segment encoded: names hold commas). */
export const blobUrl = (repo: keyof typeof REPOS, tag: string, path: string): string =>
  `${REPOS[repo]}/-/blob/${encodeURIComponent(tag)}/${path.split("/").map(encodeURIComponent).join("/")}`

/** The STEP file's own HEADER section (authors, organisation, licence notice), verbatim. */
export function stepHeader(step: Uint8Array): string {
  const head = new TextDecoder("latin1").decode(step.subarray(0, 64 * 1024))
  const m = head.match(/HEADER;[\s\S]*?ENDSEC;/)
  return m ? m[0].replace(/\r\n?/g, "\n") : "(no HEADER section)"
}

/**
 * The licence text a KiCad-derived component carries (CC BY-SA 4.0 §3(a)(1)): the libraries'
 * LICENSE.md, the model folder's CREDITS.md when it has one, and the STEP file's own header,
 * which names its author and often embeds the licence notice.
 */
export function kicadLicenceText(i: {
  tag: string
  licenseMd: string
  credits?: string
  modelPath: string
  header: string
}): string {
  const parts = [
    `KiCad libraries ${i.tag}: LICENSE.md (${REPOS.packages3D})`,
    i.licenseMd.trim(),
    ...(i.credits ? [`--- ${i.modelPath.split("/")[0]}/CREDITS.md ---`, i.credits.trim()] : []),
    `--- ${i.modelPath}: STEP header ---`,
    i.header,
  ]
  return `${parts.join("\n\n")}\n`
}

const common = (tag: string, licenseText: { path: string; sha256: string }) => ({
  spdx: KICAD_SPDX,
  sourceRevision: tag,
  licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
  licenseText,
  attributionRequired: true,
  redistributable: true,
})

/** Geometry from kicad-packages3D, anchors from kicad-footprints, both at `tag`. */
export function kicadGrants(i: {
  tag: string
  modelPath: string
  footprintPath: string
  licenseText: { path: string; sha256: string }
}): { geometry: LicenseGrant; data: LicenseGrant } {
  const geometry: LicenseGrant = {
    ...common(i.tag, i.licenseText),
    creators: [{ name: "KiCad Libraries team and contributors", url: REPOS.packages3D }],
    sourceUrl: blobUrl("packages3D", i.tag, i.modelPath),
    modifications:
      "STEP tessellated to GLB by StudioVD's importer (occt-import-js, normal quality), Z-up turned Y-up, recentred; colours kept as material slots.",
  }
  const data: LicenseGrant = {
    ...common(i.tag, i.licenseText),
    creators: [{ name: "KiCad Libraries team and contributors", url: REPOS.footprints }],
    sourceUrl: blobUrl("footprints", i.tag, i.footprintPath),
    modifications:
      "Pad positions turned into anchors; names, categories, pin names and schematic parameters added by StudioVD.",
  }
  checkAllowed(geometry.spdx)
  checkAllowed(data.spdx)
  return { geometry, data }
}
