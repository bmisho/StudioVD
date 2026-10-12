import { clearMocks, mockIPC } from "@tauri-apps/api/mocks"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { getAppInfo } from "./commands"
import { commitProject } from "./project"
import { toAppError } from "./result"

type TauriGlobal = typeof globalThis & { isTauri?: boolean }

describe("tauri wrappers", () => {
  beforeEach(() => {
    ;(globalThis as TauriGlobal).isTauri = true
  })
  afterEach(() => {
    clearMocks()
    delete (globalThis as TauriGlobal).isTauri
  })

  it("returns the command value on success", async () => {
    mockIPC((cmd) => {
      if (cmd === "app_info") {
        return {
          name: "StudioVD",
          version: "0.1.0",
          tauriVersion: "2",
          os: "linux",
          arch: "x86_64",
        }
      }
    })
    const result = await getAppInfo()
    expect(result).toEqual({
      ok: true,
      value: { name: "StudioVD", version: "0.1.0", tauriVersion: "2", os: "linux", arch: "x86_64" },
    })
  })

  it("maps a Rust AppError into a typed error", async () => {
    mockIPC(() => {
      // Tauri rejects with the serialized Rust AppError object, not an Error instance.
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw { kind: "invalidInput", message: "Nothing is being opened." }
    })
    const result = await commitProject()
    expect(result).toEqual({
      ok: false,
      error: { kind: "invalidInput", message: "Nothing is being opened." },
    })
  })

  it("reports 'unavailable' in a plain browser instead of crashing", async () => {
    delete (globalThis as TauriGlobal).isTauri
    const result = await commitProject()
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.kind).toBe("unavailable")
  })
})

describe("toAppError", () => {
  it("normalizes anything thrown", () => {
    expect(toAppError({ kind: "io", message: "disk full" })).toEqual({
      kind: "io",
      message: "disk full",
    })
    expect(toAppError({ kind: "weird", message: "x" })).toEqual({ kind: "internal", message: "x" })
    expect(toAppError("boom")).toEqual({ kind: "internal", message: "boom" })
    expect(toAppError(new Error("bad"))).toEqual({ kind: "internal", message: "bad" })
    expect(toAppError(42)).toEqual({ kind: "internal", message: "Unknown error" })
  })
})
