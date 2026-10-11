// @vitest-environment node
import { describe, expect, it } from "vitest"
import { ALLOWLIST, findUrls } from "./scanBundle.mjs"

describe("offline bundle scanner", () => {
  it("reports CDN and network URLs", () => {
    const text = [
      '"https://www.gstatic.com/draco/versioned/decoders/1.5.6/"',
      "fetch('https://cdn.jsdelivr.net/gh/lojjic/unicode-font-resolver@v1.0.1/')",
      '"https://unpkg.com/detect-gpu@5.0.70/dist/benchmarks"',
      '"https://raw.githack.com/pmndrs/drei-assets/hdri/city.hdr"',
      '"//fonts.googleapis.com/css?family=Inter"',
      '"wss://example.com/socket"',
    ].join(";")
    expect(findUrls(text)).toEqual([
      "https://www.gstatic.com/draco/versioned/decoders/1.5.6/",
      "https://cdn.jsdelivr.net/gh/lojjic/unicode-font-resolver@v1.0.1/",
      "https://unpkg.com/detect-gpu@5.0.70/dist/benchmarks",
      "https://raw.githack.com/pmndrs/drei-assets/hdri/city.hdr",
      "wss://example.com/socket",
      "//fonts.googleapis.com/css?family=Inter",
    ])
  })

  it("ignores reviewed inert strings", () => {
    const text =
      '"http://www.w3.org/2000/svg" "https://react.dev/errors/418" "https://bit.ly/3cXEKWf" `http://[${e}]`'
    expect(findUrls(text)).toEqual([])
  })

  it("is fail-closed: without the allowlist everything is reported", () => {
    expect(findUrls('"http://www.w3.org/2000/svg"', [])).toEqual(["http://www.w3.org/2000/svg"])
  })

  it("gives every allowlist entry a reason", () => {
    for (const entry of ALLOWLIST) {
      expect(entry.why.trim()).not.toBe("")
      expect(Boolean(entry.exact) !== Boolean(entry.prefix)).toBe(true)
    }
  })
})
