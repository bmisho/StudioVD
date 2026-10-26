import { describe, expect, it } from "vitest"
import { compareVersions, isVersionRange, parseVersion, satisfies } from "./semver"

const v = (text: string) => {
  const parsed = parseVersion(text)
  if (!parsed) throw new Error(`not a version: ${text}`)
  return parsed
}

describe("semver", () => {
  it("reads strict versions only", () => {
    for (const ok of ["0.0.0", "1.2.3", "10.20.30", "1.0.0-alpha.1", "1.0.0-0.3.7"])
      expect(parseVersion(ok)).not.toBeNull()
    for (const bad of ["1.2", "01.2.3", "1.2.3+build", "v1.2.3", "1.2.3-", " 1.2.3", "1.2.3-a..b"])
      expect(parseVersion(bad)).toBeNull()
  })

  it("orders by semver precedence (semver.org §11)", () => {
    const order = [
      "1.0.0-alpha",
      "1.0.0-alpha.1",
      "1.0.0-alpha.beta",
      "1.0.0-beta.2",
      "1.0.0-beta.11",
      "1.0.0-rc.1",
      "1.0.0",
      "1.0.1",
      "1.1.0",
      "2.0.0",
    ]
    for (let i = 1; i < order.length; i++)
      expect(compareVersions(v(order[i - 1] ?? ""), v(order[i] ?? ""))).toBeLessThan(0)
  })

  it("checks ranges: comparators, caret and tilde", () => {
    expect(satisfies("0.14.2", ">=0.14.0 <1.0.0")).toBe(true)
    expect(satisfies("1.0.0", ">=0.14.0 <1.0.0")).toBe(false)
    expect(satisfies("1.9.0", "^1.2.0")).toBe(true)
    expect(satisfies("2.0.0", "^1.2.0")).toBe(false)
    expect(satisfies("0.3.1", "^0.3.0")).toBe(true)
    expect(satisfies("0.4.0", "^0.3.0")).toBe(false)
    expect(satisfies("1.2.9", "~1.2.0")).toBe(true)
    expect(satisfies("1.3.0", "~1.2.0")).toBe(false)
    expect(satisfies("1.2.0", "1.2.0")).toBe(true)
    expect(satisfies("1.0.0-beta", ">=1.0.0")).toBe(false)
    expect(isVersionRange(">=1 <2")).toBe(false)
    expect(isVersionRange("a b c d e")).toBe(false)
  })
})
