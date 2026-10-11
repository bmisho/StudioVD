import { Group, Mesh } from "three"
import { describe, expect, it } from "vitest"
import type { PartId } from "@/core/schema"
import { pickRefOf, setPickRef } from "./pickTarget"

describe("pick registry", () => {
  it("resolves a hit on an overlay child to its marked part group", () => {
    const part = new Group()
    const overlay = new Mesh()
    part.add(new Group().add(overlay))
    const item = { kind: "part" as const, id: "p1" as PartId }
    const unmark = setPickRef(part, item)
    expect(pickRefOf(overlay)).toBe(item)
    expect(pickRefOf(new Mesh())).toBeNull() // unmarked tree
    unmark()
    expect(pickRefOf(overlay)).toBeNull()
  })
})
