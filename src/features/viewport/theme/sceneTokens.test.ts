// @vitest-environment node
/// <reference types="node" />
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { SCENE_TOKEN_VARS, parseSceneTokens } from "./sceneTokens"

const css = readFileSync(new URL("../../../styles/globals.css", import.meta.url), "utf8")
const root = /:root\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? ""
const declared = new Map(
  Array.from(root.matchAll(/(--[\w-]+):\s*([^;]+);/g), (m) => [m[1] ?? "", m[2]?.trim() ?? ""])
)

describe("scene tokens", () => {
  it("reads every 3D token from globals.css", () => {
    const tokens = parseSceneTokens((name) => declared.get(name) ?? "")
    for (const key of Object.keys(SCENE_TOKEN_VARS)) {
      expect(tokens[key as keyof typeof SCENE_TOKEN_VARS]).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it("accepts minified and named colours and names a missing token", () => {
    const all = (value: string) => parseSceneTokens(() => value)
    expect(all("#fff").surface).toBe("#fff")
    expect(all("white").text).toBe("white")
    expect(() => all("")).toThrow(/--viewport-top/)
    expect(() => all("rgb(1, 2")).toThrow(/not a colour/)
  })
})
