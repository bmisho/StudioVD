// Names → the identifiers a component.json uses (PLAN 9.7): local keys, slugs, tags.

const RESERVED_KEYS = new Set(["__proto__", "constructor", "prototype"])
const MAX_KEY = 32

/** Letters and digits only, accents dropped: "Ø8 Welle" → "8 Welle" → ["8", "Welle"]. */
const words = (name: string): string[] =>
  name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)

/**
 * A manifest local key for `name` (letters, digits, `_`; a letter first; at most 32), not yet
 * in `taken` (which it joins): `fallback` leads when the name does not start with a letter,
 * and `_2`, `_3`... tell equal names apart.
 */
export function localKey(name: string, taken: Set<string>, fallback: string): string {
  const joined = words(name).join("_")
  const stem = (/^[A-Za-z]/.test(joined) ? joined : `${fallback}${joined ? `_${joined}` : ""}`)
    .slice(0, MAX_KEY)
    .replace(/_+$/, "")
  const free = (k: string) => !taken.has(k) && !RESERVED_KEYS.has(k)
  let key = stem
  for (let n = 2; !free(key); n++) key = `${stem.slice(0, MAX_KEY - `_${n}`.length)}_${n}`
  taken.add(key)
  return key
}

/** A component slug for `name`: lowercase words joined by `-`, at most 64 ("component" if none). */
export function slugFor(name: string): string {
  const slug = words(name).join("-").toLowerCase().slice(0, 64).replace(/-+$/, "")
  return slug || "component"
}

/** Tags as the schema takes them, from text the user typed ("motor, NEMA 17" → two tags). */
export function tagsFrom(text: string): string[] {
  const tags = text
    .split(",")
    .map((t) =>
      t
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9 ._+-]/g, "")
        .replace(/\s+/g, " ")
        .slice(0, 32)
        .trim()
    )
    .filter((t) => /^[a-z0-9]/.test(t))
  return [...new Set(tags)].slice(0, 32)
}

/** Free text as `plainText` takes it: no control characters, trimmed, at most `max`. */
export const plain = (text: string, max: number): string =>
  text
    .replace(/\p{Cc}/gu, " ")
    .trim()
    .slice(0, max)
    .trim()
