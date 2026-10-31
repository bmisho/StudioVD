import {
  compareVersions,
  parseVersion,
  type ComponentManifest,
  type LicenseGrant,
} from "@/core/schema"

type Keys = Pick<ComponentManifest, "parts" | "anchors" | "mates" | "materials">

/** Every local key a manifest holds, by section (`parts.base`, `anchors.top`...). */
const keysOf = (m: Keys): Set<string> =>
  new Set(
    (["parts", "anchors", "mates", "materials"] as const).flatMap((section) =>
      Object.keys(m[section]).map((k) => `${section}.${k}`)
    )
  )

/**
 * The version a re-saved component gets (PLAN 4.3): MAJOR when a key went (mates, wires and
 * bindings to it would break), MINOR when keys were only added, else PATCH; 1.0.0 for a new
 * one. `versions` are those installed under the id; the bump starts from the highest.
 */
export function suggestVersion(
  versions: readonly string[],
  previous: Keys | undefined,
  next: Keys
): string {
  const highest = versions
    .flatMap((v) => parseVersion(v) ?? [])
    .sort(compareVersions)
    .at(-1)
  if (!highest) return "1.0.0"
  const [major, minor, patch] = highest.core
  const [before, after] = [previous ? keysOf(previous) : new Set<string>(), keysOf(next)]
  if ([...before].some((k) => !after.has(k))) return `${major + 1}.0.0`
  if ([...after].some((k) => !before.has(k))) return `${major}.${minor + 1}.0`
  // A prerelease (1.1.0-beta) is followed by its release.
  return highest.pre.length > 0 ? `${major}.${minor}.${patch}` : `${major}.${minor}.${patch + 1}`
}

/**
 * Why Export pack refuses a component (PLAN 9.7), or null: a grant whose terms forbid passing
 * it on, unless it is the user's own (their All rights reserved is theirs to share); anything
 * it inherited that may not be passed on is never theirs to share.
 */
export function exportRefusal(manifest: ComponentManifest, own: boolean): string | null {
  const blocked = manifest.license.inherited?.find((i) => !i.grant.redistributable)
  if (blocked)
    return `It is built from ${blocked.component ?? "a model"} whose licence does not allow passing it on.`
  const grants: (LicenseGrant | undefined)[] = [
    manifest.license.geometry,
    manifest.license.data,
    manifest.license.thumbnail,
  ]
  if (!own && grants.some((g) => g && !g.redistributable))
    return "Its licence does not allow passing it on."
  return null
}
