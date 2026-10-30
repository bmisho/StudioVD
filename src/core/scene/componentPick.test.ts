import { describe, expect, it } from "vitest"
import { sampleComponentDocument, SAMPLE_INSTANCE } from "@/core/schema/testing/sampleComponent"
import type { PartId } from "@/core/schema"
import { componentOfPart, pickTarget } from "./componentPick"

describe("component picking (PLAN 9.5)", () => {
  const doc = sampleComponentDocument()
  const [outer] = Object.values(doc.parts)
  const group = doc.components[SAMPLE_INSTANCE]?.groupId
  const part = { kind: "part" as const, id: outer?.id as PartId }

  it("picks a component part as the component's group", () => {
    expect(componentOfPart(doc, part.id)).toEqual({
      instance: SAMPLE_INSTANCE,
      group: { kind: "group", id: group },
    })
    expect(pickTarget(doc, part, null)).toEqual({ kind: "group", id: group })
  })

  it("picks the part itself inside the component double-clicked into, and plain parts as they are", () => {
    expect(pickTarget(doc, part, SAMPLE_INSTANCE)).toEqual(part)
    const plain = { ...doc, components: {} }
    expect(pickTarget(plain, part, null)).toEqual(part)
    expect(pickTarget(doc, null, null)).toBeNull()
    const anchor = { kind: "anchor" as const, id: "a" }
    expect(pickTarget(doc, anchor, null)).toBe(anchor)
  })
})
