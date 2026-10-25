import { describe, expect, it } from "vitest"
import { tagsFit } from "./interfaceTags"
import { suggestedAnchors } from "./suggestions"
import { anchor, mateDoc, part } from "./testing/mateFixtures"

const TAGS = [
  "shaft-8mm",
  "bore-8mm",
  "Bore_8mm",
  "shaft-8mm",
  "pin 5",
  "socket 5",
  "rail-2020",
  "rail-2020",
  "bolt-hole",
  "M3-screw",
  "m3 hole",
  "8mm",
  undefined,
  "",
]

describe("Mate tool suggestions", () => {
  it("are exactly the anchors on other shown parts whose tags fit (tagsFit), by lookup", () => {
    const parts = TAGS.map((_, i) => part(`P${i}`))
    const anchors = TAGS.map((tag, i) => {
      const a = anchor(parts[i] ?? part("?"), [0, 0, 0])
      return tag === undefined ? a : { ...a, interface: tag }
    })
    const doc = mateDoc(parts, anchors)
    const hidden = parts[1]?.id
    const shown = (id: string) => id !== hidden
    for (const first of anchors) {
      const brute = anchors
        .filter((a) => a.partId !== first.partId && shown(a.partId))
        .filter((a) => tagsFit(first.interface, a.interface))
        .map((a) => a.id)
      expect(suggestedAnchors(doc.anchors, first.id, shown)).toEqual(brute)
    }
    const shaft = anchors[0]
    if (!shaft) throw new Error("no anchors")
    // bore-8mm sits on the hidden part: only Bore_8mm is suggested.
    expect(suggestedAnchors(doc.anchors, shaft.id, shown)).toEqual([anchors[2]?.id])
  })
})
