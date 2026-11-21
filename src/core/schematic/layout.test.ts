import { describe, expect, it } from "vitest"
import type { BlockDefId } from "@/core/schema"
import { blockDefOf, MODELS } from "@/core/sim/models/registry"
import { blockLayout, GRID } from "./layout"
import { symbolPath, SYMBOL_NAMES } from "./symbols"

describe("block layout", () => {
  it("puts every port of every built-in block on the grid, once, on the outline", () => {
    for (const model of MODELS) {
      const layout = blockLayout(
        blockDefOf(model, "00000000-0000-4000-8000-000000000000" as BlockDefId)
      )
      expect(layout.ports).toHaveLength(model.ports.length)
      expect(layout.width % GRID).toBe(0)
      expect(layout.height % GRID).toBe(0)
      const seen = new Set<string>()
      for (const s of layout.ports) {
        expect(s.x % GRID, `${model.id} ${s.port.key}`).toBe(0)
        expect(s.y % GRID, `${model.id} ${s.port.key}`).toBe(0)
        const onEdge = s.x === 0 || s.y === 0 || s.x === layout.width || s.y === layout.height
        expect(onEdge).toBe(true)
        const spot = `${s.x},${s.y}`
        expect(seen.has(spot), `${model.id}: two ports at ${spot}`).toBe(false)
        seen.add(spot)
      }
    }
  })

  it("draws a symbol for every built-in block", () => {
    for (const model of MODELS) expect(SYMBOL_NAMES, model.id).toContain(model.symbol)
    expect(symbolPath("__proto__")).toBe(symbolPath(undefined))
  })
})
