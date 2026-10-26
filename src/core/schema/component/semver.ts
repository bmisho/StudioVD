/**
 * SemVer 2.0 versions without build metadata (`1.2.0`, `1.0.0-beta.2`) and the range subset
 * component manifests use (`>=0.14.0 <1.0.0`, `^1.2.0`, `~1.2.0`): enough for `requires.app`,
 * with no dependency. Precedence follows semver.org §11 (a prerelease sorts before its release).
 */
export const SEMVER_PATTERN =
  /^(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+){0,7}))?$/

const COMPARATOR = /^(>=|<=|>|<|=|\^|~)?(.+)$/

interface Version {
  core: [number, number, number]
  pre: string[]
}

export function parseVersion(text: string): Version | null {
  const m = SEMVER_PATTERN.exec(text)
  if (!m) return null
  return { core: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4]?.split(".") ?? [] }
}

const numeric = (s: string) => /^(0|[1-9]\d*)$/.test(s)

function comparePre(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 || b.length === 0) return b.length - a.length // a release beats its prereleases
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const [x, y] = [a[i] ?? "", b[i] ?? ""]
    if (x === y) continue
    if (numeric(x) && numeric(y)) return Number(x) - Number(y)
    if (numeric(x) !== numeric(y)) return numeric(x) ? -1 : 1 // numbers sort before words
    return x < y ? -1 : 1
  }
  return a.length - b.length
}

/** Negative, zero or positive as `a` is older than, the same as or newer than `b`. */
export function compareVersions(a: Version, b: Version): number {
  for (let i = 0; i < 3; i++)
    if (a.core[i] !== b.core[i]) return (a.core[i] ?? 0) - (b.core[i] ?? 0)
  return comparePre(a.pre, b.pre)
}

/** The comparators of a range, or null when it is not one this subset reads (at most 4). */
function comparators(range: string) {
  const parts = range.trim().split(/\s+/)
  if (parts.length === 0 || parts.length > 4) return null
  const out: { op: string; version: Version }[] = []
  for (const part of parts) {
    const m = COMPARATOR.exec(part)
    const version = m?.[2] ? parseVersion(m[2]) : null
    if (!m || !version) return null
    out.push({ op: m[1] ?? "=", version })
  }
  return out
}

export const isVersionRange = (range: string): boolean =>
  range.length <= 128 && comparators(range) !== null

function holds(op: string, v: Version, bound: Version): boolean {
  const c = compareVersions(v, bound)
  const [major, minor] = bound.core
  switch (op) {
    case ">=":
      return c >= 0
    case "<=":
      return c <= 0
    case ">":
      return c > 0
    case "<":
      return c < 0
    case "^": // same major (same minor below 1.0.0), not older
      return c >= 0 && v.core[0] === major && (major !== 0 || v.core[1] === minor)
    case "~": // same major and minor, not older
      return c >= 0 && v.core[0] === major && v.core[1] === minor
    default:
      return c === 0
  }
}

/** Whether `version` is in every comparator of `range`; false for text neither reads as. */
export function satisfies(version: string, range: string): boolean {
  const v = parseVersion(version)
  const cs = comparators(range)
  return !!v && !!cs && cs.every((c) => holds(c.op, v, c.version))
}
