// @vitest-environment node
import { MeshPhysicalMaterial } from "three"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createPreviewCache, MAX_PREVIEWS, RETRY_MS } from "./previewCache"

const image = (tag: number) => ({ tag }) as unknown as ImageData

function setup(ready = true) {
  const state = { ready, fail: false }
  const render = vi.fn((materials: readonly unknown[]) =>
    Promise.resolve(state.fail ? null : materials.map((_, i) => image(i)))
  )
  const cache = createPreviewCache({ isReady: () => state.ready, renderMaterialPreviews: render })
  return { cache, render, state }
}

/** Lets the scheduled microtask and the awaited render settle. */
const settle = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve()
}

describe("material preview cache", () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ["setTimeout", "Date"] }))
  afterEach(() => vi.useRealTimers())

  it("renders the requests of one tick in one call and notifies", async () => {
    const { cache, render } = setup()
    const listener = vi.fn()
    cache.subscribe(listener)
    const a = new MeshPhysicalMaterial()
    const b = new MeshPhysicalMaterial()
    cache.request("p:a", a, 80)
    cache.request("p:b", b, 80)
    cache.request("p:a", a, 80) // already asked: once
    await settle()
    expect(render).toHaveBeenCalledTimes(1)
    expect(render.mock.calls[0]?.[0]).toEqual([a, b])
    expect(cache.get("p:b", 80)).toEqual(image(1))
    expect(listener).toHaveBeenCalled()
    cache.request("p:a", a, 80) // cached: no new render
    await settle()
    vi.advanceTimersByTime(RETRY_MS)
    await settle()
    expect(render).toHaveBeenCalledTimes(1)
  })

  it("waits while the 3D view cannot render, then retries", async () => {
    const { cache, render, state } = setup(false)
    cache.request("p:a", new MeshPhysicalMaterial(), 80)
    await settle()
    expect(render).not.toHaveBeenCalled()
    state.ready = true
    vi.advanceTimersByTime(RETRY_MS)
    await settle()
    expect(render).toHaveBeenCalledTimes(1)
    expect(cache.get("p:a", 80)).toBeDefined()
  })

  it("keeps requests the renderer could not serve, and asks again later", async () => {
    const { cache, render, state } = setup()
    state.fail = true
    cache.request("p:a", new MeshPhysicalMaterial(), 80)
    await settle()
    expect(cache.get("p:a", 80)).toBeUndefined()
    state.fail = false
    vi.advanceTimersByTime(RETRY_MS)
    await settle()
    expect(render).toHaveBeenCalledTimes(2)
    expect(cache.get("p:a", 80)).toBeDefined()
  })

  it("drops a preview of values the material no longer has", async () => {
    const { cache } = setup()
    const material = new MeshPhysicalMaterial()
    cache.request("m:old", material, 80)
    cache.request("m:new", material, 80) // edited in the same tick
    await settle()
    expect(cache.get("m:old", 80)).toBeUndefined()
    expect(cache.get("m:new", 80)).toBeDefined()
  })

  it(`keeps at most ${MAX_PREVIEWS} images, least recently used first out`, async () => {
    const { cache } = setup()
    const material = (i: number) => Object.assign(new MeshPhysicalMaterial(), { name: `${i}` })
    for (let i = 0; i <= MAX_PREVIEWS; i++) {
      cache.request(`p:${i}`, material(i), 8)
      await settle()
      vi.advanceTimersByTime(RETRY_MS)
    }
    await settle()
    expect(cache.get("p:0", 8)).toBeUndefined()
    expect(cache.get(`p:${MAX_PREVIEWS}`, 8)).toBeDefined()
  })
})
