import { describe, expect, it } from "vitest"
import type { Binding, BindingId, SceneDocument } from "@/core/schema"
import type { SimResult } from "@/core/sim/engine/results"
import { visualsOf } from "./visuals"

describe("what a solve shows in 3D", () => {
  it("maps block outputs onto a glow (clamped to 1) and a tint", () => {
    const glow: Binding = {
      id: "g" as BindingId,
      from: { kind: "output", node: "n" as never, port: "light", quantity: "value" },
      to: { kind: "glow", part: "p" as never, color: "green" },
      scale: 10,
      offset: 0,
    }
    const tint: Binding = {
      ...glow,
      id: "t" as BindingId,
      from: { kind: "output", node: "n" as never, port: "a", quantity: "flow" },
      to: { kind: "tint", part: "q" as never },
      scale: 2,
    }
    const doc = {
      bindings: { g: glow, t: tint },
      anchors: {},
      mates: {},
      parts: {},
    } as unknown as Pick<SceneDocument, "bindings" | "anchors" | "mates" | "parts">
    const result = {
      signals: { "n/light": 0.3 },
      ports: { "n/a": { effort: 5, flow: 0.2 } },
    } as unknown as SimResult
    const v = visualsOf(doc, result)
    expect(v.glow).toEqual({ p: 1 }) // 3, clamped
    expect(v.glowColor).toEqual({ p: "green" })
    expect(v.tint.q).toBeCloseTo(0.4, 12)
    expect(visualsOf(doc, null).glow).toEqual({})
  })
})
