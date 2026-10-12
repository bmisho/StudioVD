import { afterEach, describe, expect, it, vi } from "vitest"

class FakeWorker {
  static all: FakeWorker[] = []
  onmessage: ((e: MessageEvent) => void) | null = null
  onerror: ((e: ErrorEvent) => void) | null = null
  onmessageerror: (() => void) | null = null
  posted: unknown[] = []
  terminated = false
  constructor() {
    FakeWorker.all.push(this)
  }
  postMessage(message: unknown) {
    this.posted.push(message)
  }
  terminate() {
    this.terminated = true
  }
}

describe("asset worker pool", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
    FakeWorker.all = []
  })

  it("a worker that dies rejects its requests and is replaced on the next one", async () => {
    vi.stubGlobal("Worker", FakeWorker)
    vi.stubGlobal("navigator", { hardwareConcurrency: 2 }) // a pool of one
    const { decodeInWorker } = await import("./assetWorkerPool")
    const first = decodeInWorker(new ArrayBuffer(8))
    const [worker] = FakeWorker.all
    if (!worker?.onerror) throw new Error("worker not wired")
    worker.onerror(Object.assign(new Event("error"), { message: "out of memory" }) as ErrorEvent)
    await expect(first).rejects.toThrow("out of memory")
    expect(worker.terminated).toBe(true)

    const second = decodeInWorker(new ArrayBuffer(8))
    expect(FakeWorker.all).toHaveLength(2)
    const replacement = FakeWorker.all[1]
    const request = replacement?.posted[0] as { requestId: number }
    replacement?.onmessage?.({
      data: { requestId: request.requestId, ok: false, message: "bad glb" },
    } as MessageEvent)
    await expect(second).rejects.toThrow("bad glb")
  })
})
