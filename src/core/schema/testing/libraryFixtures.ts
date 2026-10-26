// Test helper (not app code): the library fixture files, shared with the Rust tests.
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const DIR = "src/core/schema/testing/fixtures/library"

/** The fixture's bytes. */
export const libraryFixtureBytes = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(resolve(process.cwd(), DIR, name)))

/** A fresh parsed copy of the fixture, to mutate into an invalid case. */
export function libraryFixture(name: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(new TextDecoder().decode(libraryFixtureBytes(name)))
  if (typeof parsed !== "object" || parsed === null) throw new Error(`${name}: not an object`)
  return parsed as Record<string, unknown>
}

/** Sets a value at a path of keys and indexes (creating nothing: the path must exist). */
export function setAt(root: unknown, path: readonly (string | number)[], value: unknown): void {
  let at: unknown = root
  for (const key of path.slice(0, -1)) at = (at as Record<string | number, unknown>)[key]
  const last = path.at(-1)
  if (last === undefined) throw new Error("empty path")
  if (value === undefined) delete (at as Record<string | number, unknown>)[last]
  else (at as Record<string | number, unknown>)[last] = value
}
