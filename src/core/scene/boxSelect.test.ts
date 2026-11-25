import { describe, expect, it } from "vitest"
import {
  newId,
  type ComponentInstanceId,
  type GroupId,
  type Part,
  type PartId,
} from "@/core/schema"
import { boxBetween, boxSelection, partsInBox, type ScreenRect } from "./boxSelect"

const rect = (left: number, top: number, right: number, bottom: number): ScreenRect => ({
  left,
  top,
  right,
  bottom,
})

describe("box selection in the 3D view (0.2.1)", () => {
  it("is a window dragged rightward and a crossing box dragged leftward", () => {
    expect(boxBetween({ x: 10, y: 50 }, { x: 90, y: 20 })).toEqual({
      rect: rect(10, 20, 90, 50),
      mode: "window",
    })
    expect(boxBetween({ x: 90, y: 20 }, { x: 10, y: 50 }).mode).toBe("crossing")
  })

  it("a window holds what lies entirely inside; a crossing box, what it touches", () => {
    const [a, b, c, d] = [newId<PartId>(), newId<PartId>(), newId<PartId>(), newId<PartId>()]
    const screen = new Map<PartId, ScreenRect | null>([
      [a, rect(20, 20, 40, 40)], // inside
      [b, rect(80, 20, 120, 40)], // half in
      [c, rect(200, 200, 220, 220)], // outside
      [d, null], // partly behind the camera
    ])
    expect(partsInBox(boxBetween({ x: 0, y: 0 }, { x: 100, y: 100 }), screen)).toEqual([a])
    expect(partsInBox(boxBetween({ x: 100, y: 100 }, { x: 0, y: 0 }), screen)).toEqual([a, b])
  })

  it("selects a library component whole, once, unless it is the one entered", () => {
    const group = newId<GroupId>()
    const instance = newId<ComponentInstanceId>()
    const [p1, p2, loose] = [newId<PartId>(), newId<PartId>(), newId<PartId>()]
    const part = (id: PartId, inComponent: boolean) =>
      ({ id, ...(inComponent && { componentRef: { instance, key: id } }) }) as unknown as Part
    const doc = {
      parts: { [p1]: part(p1, true), [p2]: part(p2, true), [loose]: part(loose, false) },
      components: { [instance]: { groupId: group } },
    } as unknown as Parameters<typeof boxSelection>[0]
    expect(boxSelection(doc, [p1, loose, p2], null)).toEqual([
      { kind: "group", id: group },
      { kind: "part", id: loose },
    ])
    expect(boxSelection(doc, [p1, p2], instance)).toEqual([
      { kind: "part", id: p1 },
      { kind: "part", id: p2 },
    ])
  })
})
