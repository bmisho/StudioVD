import { describe, expect, it, vi } from "vitest"

const call = vi.fn(() => Promise.resolve({ ok: true as const, value: undefined }))
vi.mock("./invoke", () => ({ call }))

describe("webview error log (PLAN 15.5)", () => {
  it("sends uncaught errors and rejections to Rust as one bounded message", async () => {
    const { logError, logUncaughtErrors } = await import("./log")
    logError("panel", new Error("boom"))
    const first = call.mock.calls[0] as unknown as [string, { message: string }]
    expect(first[0]).toBe("log_webview_error")
    expect(first[1].message).toContain("panel: Error: boom")
    const target = new EventTarget()
    logUncaughtErrors(target)
    target.dispatchEvent(
      Object.assign(new Event("unhandledrejection"), { reason: "x".repeat(9000) })
    )
    const last = call.mock.calls.at(-1) as unknown as [string, { message: string }]
    expect(last[1].message.length).toBe(8192)
  })
})
