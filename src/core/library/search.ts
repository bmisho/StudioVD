import type { LibraryItem } from "./items"

/** What the search sees of a card: its key, name and the rest of its words. */
export interface SearchDoc {
  key: string
  source: LibraryItem["source"]
  name: string
  text: string
}

/** Lowercase, accents and the × sign folded, so "608 2rs" finds "608-2RS" and "M3x10" "M3 × 10". */
export const fold = (s: string): string =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/×/g, "x").toLowerCase()

export const searchDoc = (item: LibraryItem): SearchDoc => ({
  key: item.key,
  source: item.source,
  name: fold(item.name),
  text: fold([item.detail, ...item.category, ...item.tags].join(" ")),
})

/** Words of a query; "3x10" (a size) is two words, but "hex" keeps its x. */
const tokens = (query: string) =>
  fold(query)
    .replace(/(\d)\s*x\s*(?=\d)/g, "$1 ")
    .split(/[\s,;/*()-]+/)
    .filter(Boolean)

/** A name word starting with the token scores higher than one merely containing it. */
function score(doc: SearchDoc, token: string): number {
  if (doc.name.startsWith(token)) return 4
  if (new RegExp(`(^|[^a-z0-9])${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(doc.name))
    return 3
  if (doc.name.includes(token)) return 2
  if (doc.text.includes(token)) return 1
  return 0
}

/**
 * The keys of the cards matching every word of `query` (PLAN 9.4), best first, ties in their
 * listed order; all of `source`'s cards when the query is empty. Pure: runs in the search
 * worker and in tests.
 */
export function search(
  docs: readonly SearchDoc[],
  query: string,
  source: SearchDoc["source"] | "all"
): string[] {
  const words = tokens(query)
  const pool = docs.filter((d) => source === "all" || d.source === source)
  if (words.length === 0) return pool.map((d) => d.key)
  const scored: { key: string; score: number; at: number }[] = []
  pool.forEach((d, at) => {
    let total = 0
    for (const w of words) {
      const s = score(d, w)
      if (s === 0) return
      total += s
    }
    scored.push({ key: d.key, score: total, at })
  })
  return scored.sort((a, b) => b.score - a.score || a.at - b.at).map((s) => s.key)
}
