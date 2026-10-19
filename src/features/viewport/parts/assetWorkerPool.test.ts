import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

interface Posted {
  message: { kind: string; requestId: number } & Record<string, unknown>
  transfer: Transferable[] | undefined
}

class FakeWorker {
  static all: FakeWorker[] = []
  onmessage: ((e: MessageEvent) => void) | null = null
  onerror: ((e: ErrorEvent) => void) | null = null
  onmessageerror: (() => void) | null = null
  posted: Posted[] = []
  terminated = false
  constructor() {
    FakeWorker.all.push(this)
  }
  postMessage(message: Posted["message"], transfer?: Transferable[]) {
    this.posted.push({ message, transfer })
  }
  terminate() {
    this.terminated = true
  }
  /** Answers the last request it was given. */
  reply(data: Record<string, unknown>) {
    const last = this.posted.at(-1)
    if (!last || !this.onmessage) throw new Error("nothing to answer")
    this.onmessage({ data: { requestId: last.message.requestId, ...data } } as MessageEvent)
  }
}

describe("asset worker pool", () => {
  beforeEach(() => {
    vi.stubGlobal("Worker", FakeWorker)
    vi.stubGlobal("navigator", { hardwareConcurrency: 2 }) // a pool of one
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
    FakeWorker.all = []
  })

  it("a worker that dies rejects its requests and is replaced on the next one", async () => {
    const { decodeInWorker } = await import("./assetWorkerPool")
    const first = decodeInWorker(new ArrayBuffer(8))
    const [worker] = FakeWorker.all
    if (!worker?.onerror) throw new Error("worker not wired")
    worker.onerror(Object.assign(new Event("error"), { message: "out of memory" }) as ErrorEvent)
    await expect(first).rejects.toThrow("out of memory")
    expect(worker.terminated).toBe(true)

    const second = decodeInWorker(new ArrayBuffer(8))
    expect(FakeWorker.all).toHaveLength(2)
    FakeWorker.all[1]?.reply({ ok: false, message: "bad glb" })
    await expect(second).rejects.toThrow("bad glb")
  })

  it("transfers the GLB bytes to decode and resolves with the decoded asset", async () => {
    const { decodeInWorker } = await import("./assetWorkerPool")
    const bytes = new ArrayBuffer(8)
    const decoded = decodeInWorker(bytes)
    const worker = FakeWorker.all[0]
    expect(worker?.posted[0]?.message).toMatchObject({ kind: "decode", bytes })
    expect(worker?.posted[0]?.transfer).toEqual([bytes])
    const asset = { positions: new Float32Array(3) }
    worker?.reply({ kind: "decode", ok: true, asset })
    await expect(decoded).resolves.toBe(asset)
  })

  it("copies the mesh to find feature edges (never transfers it) and resolves with them", async () => {
    const { edgesInWorker } = await import("./assetWorkerPool")
    const positions = new Float32Array(9)
    const indices = new Uint32Array([0, 1, 2])
    const face = { first: 0, last: 0, kind: "plane", normal: [0, 0, 1] }
    const found = edgesInWorker(positions, indices, [face])
    const worker = FakeWorker.all[0]
    const posted = worker?.posted[0]
    expect(posted?.transfer ?? []).toHaveLength(0) // structured clone: the GPU keeps its arrays
    expect(posted?.message).toMatchObject({ kind: "edges", positions, indices })
    expect(posted?.message.faces).toEqual([{ first: 0, last: 0 }]) // bare ranges only
    expect(posted?.message).not.toHaveProperty("angleDeg")
    const edges = new Uint32Array([0, 1, 1, 2, 2, 0])
    worker?.reply({ kind: "edges", ok: true, edges })
    await expect(found).resolves.toBe(edges)

    void edgesInWorker(positions, indices, [], 15)
    expect(worker?.posted[1]?.message.angleDeg).toBe(15)
  })

  it("rejects a reply of the wrong kind and keeps the worker", async () => {
    const { decodeInWorker, edgesInWorker } = await import("./assetWorkerPool")
    const found = edgesInWorker(new Float32Array(9), new Uint32Array([0, 1, 2]), [])
    const worker = FakeWorker.all[0]
    worker?.reply({ kind: "decode", ok: true, asset: {} })
    await expect(found).rejects.toThrow("decode reply does not match its edges request")

    const decoded = decodeInWorker(new ArrayBuffer(8))
    worker?.reply({ kind: "edges", ok: true, edges: new Uint32Array(0) })
    await expect(decoded).rejects.toThrow("edges reply does not match its decode request")
    expect(FakeWorker.all).toHaveLength(1) // a confused reply is not a dead worker
  })
})
