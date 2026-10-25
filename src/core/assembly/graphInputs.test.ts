import { describe, expect, it } from "vitest"
import { sameGraphInputs } from "./graphInputs"
import { anchor, mate, mateDoc, part } from "./testing/mateFixtures"

describe("sameGraphInputs (security review)", () => {
  it("ignores names, visibility and tags; sees poses, grounding, frames and mates", () => {
    const [p, q] = [part("P", true), part("Q")]
    const [a, b] = [anchor(p, [0, 0, 0]), anchor(q, [0, 0, 0])]
    const doc = mateDoc([p, q], [a, b], [mate(a, b)])
    const withPart = (patch: object) => ({
      ...doc,
      parts: { ...doc.parts, [q.id]: { ...q, ...patch } },
    })
    const withAnchor = (patch: object) => ({
      ...doc,
      anchors: { ...doc.anchors, [b.id]: { ...b, ...patch } },
    })
    expect(sameGraphInputs(doc, withPart({ name: "Renamed", visible: false }))).toBe(true)
    expect(sameGraphInputs(doc, withAnchor({ name: "Pin", interface: "shaft-8mm" }))).toBe(true)
    expect(sameGraphInputs(doc, withPart({ grounded: true }))).toBe(false)
    expect(sameGraphInputs(doc, withPart({ pose: { ...q.pose } }))).toBe(false)
    expect(sameGraphInputs(doc, withAnchor({ frame: { ...b.frame } }))).toBe(false)
    expect(sameGraphInputs(doc, { ...doc, mates: { ...doc.mates } })).toBe(false)
    const fewer = mateDoc([p], [a, b], Object.values(doc.mates))
    expect(sameGraphInputs(doc, { ...fewer, mates: doc.mates })).toBe(false)
  })
})
