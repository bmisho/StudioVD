// @vitest-environment node
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

// Files copied into public/ so the webview never fetches them from a CDN (CLAUDE.md §6). They
// must stay byte-identical to the installed packages; after upgrading three or occt-import-js,
// copy them again (paths below).
const VENDORED = [
  [
    "public/draco/draco_wasm_wrapper.js",
    "node_modules/three/examples/jsm/libs/draco/gltf/draco_wasm_wrapper.js",
  ],
  [
    "public/draco/draco_decoder.wasm",
    "node_modules/three/examples/jsm/libs/draco/gltf/draco_decoder.wasm",
  ],
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
