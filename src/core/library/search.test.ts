import { describe, expect, it } from "vitest"
import { GENERATORS } from "@/core/generators/registry"
import { generatorItems } from "./items"
import { search, searchDoc } from "./search"

const docs = generatorItems(GENERATORS).map(searchDoc)
const names = (keys: string[]) => {
  const byKey = new Map(generatorItems(GENERATORS).map((i) => [i.key, i.name]))
  return keys.map((k) => byKey.get(k))
}

describe("library search", () => {
  it("lists a source's cards in order for an empty query", () => {
    expect(search(docs, "  ", "all")).toEqual(docs.map((d) => d.key))
    expect(search(docs, "", "installed")).toEqual([])
  })

  it("needs every word, folds case and the × sign, and ranks names first", () => {
    const hits = names(search(docs, "m3x10", "all"))
    expect(hits[0]).toBe("M3 × 10 socket head")
    expect(names(search(docs, "BEARING 608", "all"))).toEqual(["608-2RS (8 × 22 × 7)"])
    // "nut" names the hex nuts and the T8 nuts before anything that only mentions nuts.
    const nuts = names(search(docs, "nut", "generators"))
    expect(nuts.slice(0, 3)).toEqual(["M2 nut", "M2.5 nut", "M3 nut"])
    expect(search(docs, "gear zzz", "all")).toEqual([])
    expect(names(search(docs, "hex m6", "all"))).toEqual(["M6 × 20 hex head", "M6 nut"]) // by tag
  })

  it("finds by tag and category, not only by name", () => {
    expect(names(search(docs, "skate", "all"))).toEqual([]) // no generator tags 'skate'
    expect(names(search(docs, "timing belt", "all"))).toContain("20 teeth, bore 5")
  })
})
