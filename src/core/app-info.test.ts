// @vitest-environment node
/// <reference types="node" />
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import pkg from "../../package.json"
import tauriConf from "../../src-tauri/tauri.conf.json"
import { APP_VERSION } from "./app-info"

describe("version consistency", () => {
  it("matches package.json, tauri.conf.json and Cargo.toml", () => {
    const cargo = readFileSync(new URL("../../src-tauri/Cargo.toml", import.meta.url), "utf8")
    const cargoVersion = /^version\s*=\s*"([^"]+)"/m.exec(cargo)?.[1]
    expect(pkg.version).toBe(APP_VERSION)
    expect(tauriConf.version).toBe(APP_VERSION)
    expect(cargoVersion).toBe(APP_VERSION)
  })
})
