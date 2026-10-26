import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { GENERATORS } from "./registry"
import { goldenRun, type GoldenRun } from "./testing/golden"

// Golden tests (PLAN 9.9): anchor keys must stay stable (mates and wires point at them), and
// geometry within tolerance, not bytes: Math.sin differs in the last bits between V8 and
// JavaScriptCore (PLAN §5 risks). `UPDATE_GOLDEN=1 npx vitest run golden` rewrites the file
// after a deliberate change; review its diff.
const FILE = resolve(process.cwd(), "src/core/generators/testing/golden.json")
const update = process.env.UPDATE_GOLDEN === "1"
const stored: Record<string, Record<string, GoldenRun>> = !update && existsSync(FILE)
  ? (JSON.parse(readFileSync(FILE, "utf8")) as Record<string, Record<string, GoldenRun>>)
  : {}

const close = (a: number, b: number) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b))

describe("generator golden runs", () => {
  const fresh: Record<string, Record<string, GoldenRun>> = {}
  for (const gen of GENERATORS) {
    const runs = [{ key: "defaults", params: gen.defaults }, ...gen.presets]
    it(`${gen.id}: keys and geometry match the golden file`, async () => {
      const id = `${gen.id}@${gen.major}`
      fresh[id] = {}
      for (const run of runs) {
        const got = await goldenRun(gen, run.params)
        fresh[id][run.key] = got
        if (update) continue
        const want = stored[id]?.[run.key]
        expect(want, `${id} ${run.key} is not in the golden file`).toBeDefined()
        if (!want) continue
        expect(got.anchors, `${run.key} anchors`).toEqual(want.anchors)
        expect(got.mates, `${run.key} mates`).toEqual(want.mates)
        expect(Object.keys(got.bodies)).toEqual(Object.keys(want.bodies))
        for (const [key, body] of Object.entries(got.bodies)) {
          const w = want.bodies[key]
          expect(body.triangles, `${run.key}.${key} triangles`).toBe(w?.triangles)
          expect(body.faces, `${run.key}.${key} faces`).toBe(w?.faces)
          const numbers = [body.volumeMm3, ...body.offsetMm, ...body.bboxMm]
          const wanted = [w?.volumeMm3 ?? 0, ...(w?.offsetMm ?? []), ...(w?.bboxMm ?? [])]
          numbers.forEach((v, i) =>
            expect(
              close(v, wanted[i] ?? Number.NaN),
              `${run.key}.${key}[${i}]: ${v} vs ${wanted[i]}`
            ).toBe(true)
          )
        }
      }
    })
  }
  it.runIf(update)("writes the golden file", () => {
    writeFileSync(FILE, `${JSON.stringify(fresh, null, 2)}\n`)
  })
})
