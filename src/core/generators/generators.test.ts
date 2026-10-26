import { describe, expect, it } from "vitest"
import { GENERATORS } from "./registry"
import { checkGenerated } from "./testing/check"

describe.each(GENERATORS.map((g) => [g.id, g] as const))("generator %s", (_, gen) => {
  const runs = [{ key: "defaults", params: gen.defaults }, ...gen.presets]
  it.each(runs.map((r) => [r.key, r.params] as const))(
    "%s: closed bodies, analytic volume, valid manifest",
    async (_key, params) => {
      const check = await checkGenerated(gen, params)
      expect(check.problems).toEqual([])
    }
  )
})
