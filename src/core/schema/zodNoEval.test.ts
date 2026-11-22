import { describe, expect, it, vi } from "vitest"
import { z } from "zod"

// "zod" here is the alias (src/core/schema/zodNoEval.ts), as everywhere in the app.
describe("zod without eval (PLAN 15.1)", () => {
  it("parses objects without constructing functions", () => {
    expect(z.config().jitless).toBe(true)
    const spy = vi.spyOn(globalThis, "Function")
    const schema = z.object({ a: z.number(), b: z.string() }).strict()
    expect(schema.parse({ a: 1, b: "x" })).toEqual({ a: 1, b: "x" })
    expect(spy).not.toHaveBeenCalled()
  })
})
