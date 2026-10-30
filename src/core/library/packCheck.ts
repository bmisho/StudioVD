import { readManifest } from "@/core/schema"

export interface PackComponentCheck {
  id: string
  version: string
  name: string
  licence: string
  status: "ok" | "newer" | "invalid"
  message?: string
}

/**
 * Install from file (PLAN 9.2): every component.json of a staged pack read as untrusted
 * input (reserved namespaces refused), and matched against what pack.json says it is. A pack
 * installs only when none is invalid; one made for a newer StudioVD installs and lists as
 * such.
 */
export function checkStagedPack(
  components: readonly { id: string; version: string; manifest: string }[],
  appVersion: string
): { checks: PackComponentCheck[]; installable: boolean } {
  const checks = components.map((c): PackComponentCheck => {
    const base = { id: c.id, version: c.version, name: c.id, licence: "unknown" }
    const read = readManifest(new TextEncoder().encode(c.manifest), appVersion, false)
    if (!read.ok)
      return read.reason === "newer"
        ? { ...base, status: "newer", message: `Needs StudioVD ${read.needs}.` }
        : { ...base, status: "invalid", message: read.message }
    const { identity, license } = read.manifest
    if (identity.id !== c.id || identity.version !== c.version)
      return { ...base, status: "invalid", message: "It is not what pack.json says it is." }
    return { ...base, name: identity.name, licence: license.geometry.spdx, status: "ok" }
  })
  const installable = checks.length > 0 && checks.every((c) => c.status !== "invalid")
  return { checks, installable }
}
