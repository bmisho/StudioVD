// @vitest-environment node
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

// Files copied into public/ (licence texts shipped with the app). They must stay
// byte-identical to the installed packages; after upgrading occt-import-js, copy them again.
const VENDORED = [
  [
    "public/licenses/occt-import-js.LGPL-2.1.txt",
    "node_modules/occt-import-js/dist/license.occt-import-js.txt",
  ],
  ["public/licenses/opencascade.LGPL-2.1.txt", "node_modules/occt-import-js/dist/license.occt.txt"],
]

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url))

describe("vendored files", () => {
  for (const [copy, source] of VENDORED) {
    it(`${copy} matches ${source}`, () => {
      expect(read(copy).equals(read(source))).toBe(true)
    })
  }
})
