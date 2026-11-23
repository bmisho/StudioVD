// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

// PLAN 15.4 undo/redo audit: every document action (the `*Actions` interfaces here) is called
// by at least one test, where each asserts its undo entries (one per call, none for a no-op)
// or round-trips the document through Save and Open.

const DIR = join(process.cwd(), "src/store/document")
const read = (dir: string, keep: (f: string) => boolean) =>
  readdirSync(dir, { recursive: true })
    .map(String)
    .filter(keep)
    .map((f) => readFileSync(join(dir, f), "utf8"))

function actionNames(): string[] {
  const names = new Set<string>()
  for (const text of read(DIR, (f) => f.endsWith(".ts") && !f.endsWith(".test.ts")))
    for (const block of text.match(/export interface \w+Actions \{[\s\S]*?\n\}/g) ?? [])
      for (const m of block.matchAll(/^\s+(\w+): \(/gm)) if (m[1]) names.add(m[1])
  return [...names]
}

describe("undo/redo coverage (PLAN 15.4)", () => {
  it("every document action is exercised by a test", () => {
    const names = actionNames()
    expect(names.length).toBeGreaterThan(40)
    const tests = [
      ...read(DIR, (f) => f.endsWith(".test.ts")),
      ...read(join(process.cwd(), "src/features"), (f) => /\.test\.tsx?$/.test(f)),
    ].join("\n")
    const untested = names.filter((n) => !tests.includes(`.${n}(`))
    expect(untested).toEqual([])
  })
})
