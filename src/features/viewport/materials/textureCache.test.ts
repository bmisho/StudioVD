import { NoColorSpace, RepeatWrapping, SRGBColorSpace } from "three"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { TextureId } from "@/core/schema"
import { MAX_TEXTURE_SIDE_PX, TEXTURE_BUDGET_PX, textureCache } from "./textureCache"

vi.mock("@/lib/tauri/files", () => ({
  textureUrl: (id: string, ext: string) => `stvd://localhost/${id}.${ext}`,
}))

/** A stored image file: only its pixel size matters to the fakes. */
class FakeFile {
  constructor(
    readonly width: number,
    readonly height: number
  ) {}
}
class FakeBitmap {
  readonly close = vi.fn()
  constructor(
    readonly width: number,
    readonly height: number
  ) {}
}

let next = 1
/** A fresh content address per call: the cache is module state shared by these tests. */
const newId = () => (next++).toString(16).padStart(64, "0") as TextureId
const record = (id: TextureId, ext = "png") => ({ id, path: `textures/${id}.${ext}` })
/** Lets the fetch → blob → decode chain run to its end. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

/** Files on the fake `stvd` scheme, by id. */
const files = new Map<string, FakeFile>()
const fetchMock = vi.fn()
const decodeMock = vi.fn()

beforeEach(() => {
  fetchMock.mockImplementation((url: string) => {
    const file = files.get(url.slice(url.lastIndexOf("/") + 1, url.lastIndexOf(".")))
    return Promise.resolve({
      ok: !!file,
      status: file ? 200 : 404,
      blob: () => Promise.resolve(file),
    })
  })
  decodeMock.mockImplementation((source: unknown, options: ImageBitmapOptions = {}) => {
    if (source instanceof FakeFile)
      return Promise.resolve(new FakeBitmap(source.width, source.height))
    if (source instanceof FakeBitmap && options.resizeWidth && options.resizeHeight)
      return Promise.resolve(new FakeBitmap(options.resizeWidth, options.resizeHeight))
    return Promise.reject(new Error("not an image"))
  })
  vi.stubGlobal("fetch", fetchMock)
  vi.stubGlobal("createImageBitmap", decodeMock)
})

afterEach(async () => {
  await settle()
  textureCache.retain(new Set())
  files.clear()
  fetchMock.mockReset()
  decodeMock.mockReset()
  vi.unstubAllGlobals()
})

function stored(width = 512, height = 256): TextureId {
  const id = newId()
  files.set(id, new FakeFile(width, height))
  return id
}

describe("texture cache", () => {
  it("fetches and decodes each image once, from the stvd scheme, for both uses", async () => {
    const id = stored()
    textureCache.request(record(id))
    textureCache.request(record(id))
    await settle()
    textureCache.request(record(id))
    expect(fetchMock.mock.calls).toEqual([[`stvd://localhost/${id}.png`]])
    expect(decodeMock).toHaveBeenCalledOnce()
    const color = textureCache.get(id, "color")
    expect(color).not.toBe(textureCache.get(id, "data"))
    expect(color?.image).toBe(textureCache.get(id, "data")?.image) // one bitmap
    expect(textureCache.get(id, "color")).toBe(color)
  })

  it("decodes one image at a time (a full-size decode holds up to 256 MB)", async () => {
    let active = 0
    let most = 0
    decodeMock.mockImplementation(async (source: FakeFile) => {
      most = Math.max(most, ++active)
      await settle()
      active--
      return new FakeBitmap(source.width, source.height)
    })
    const ids = [stored(), stored(), stored()]
    for (const id of ids) textureCache.request(record(id))
    for (let i = 0; i < 6; i++) await settle()
    expect(ids.map((id) => textureCache.get(id, "color") !== undefined)).toEqual([true, true, true])
    expect(most).toBe(1)
  })

  it("keeps at most the pixel budget, and decodes nothing more past it", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    const fit = TEXTURE_BUDGET_PX / MAX_TEXTURE_SIDE_PX ** 2
    const ids = Array.from({ length: fit + 2 }, () =>
      stored(MAX_TEXTURE_SIDE_PX, MAX_TEXTURE_SIDE_PX)
    )
    for (const id of ids) textureCache.request(record(id))
    await settle()
    const loaded = ids.filter((id) => textureCache.get(id, "color") !== undefined)
    expect(loaded).toEqual(ids.slice(0, fit))
    expect(fetchMock).toHaveBeenCalledTimes(fit) // the rest are not even fetched
    expect(warn).toHaveBeenCalledTimes(2)

    textureCache.retain(new Set()) // the next document starts with the whole budget
    const next = stored(MAX_TEXTURE_SIDE_PX, MAX_TEXTURE_SIDE_PX)
    textureCache.request(record(next))
    await settle()
    expect(textureCache.get(next, "color")).toBeDefined()
  })

  it("takes the file extension from the texture's path", async () => {
    const id = stored()
    textureCache.request(record(id, "jpg"))
    await settle()
    expect(fetchMock).toHaveBeenCalledWith(`stvd://localhost/${id}.jpg`)
    expect(textureCache.get(id, "color")).toBeDefined()
  })

  it("makes repeating textures, sRGB for colour and raw for data, flipped at decode", async () => {
    const id = stored(300, 200)
    textureCache.request(record(id))
    textureCache.request(record(id))
    await settle()
    const color = textureCache.get(id, "color")
    const data = textureCache.get(id, "data")
    expect(color?.colorSpace).toBe(SRGBColorSpace)
    expect(data?.colorSpace).toBe(NoColorSpace)
    for (const texture of [color, data]) {
      expect(texture?.image).toBeInstanceOf(FakeBitmap)
      expect(texture?.flipY).toBe(false)
      expect([texture?.wrapS, texture?.wrapT]).toEqual([RepeatWrapping, RepeatWrapping])
      expect(texture?.generateMipmaps).toBe(true)
      expect(texture?.version).toBeGreaterThan(0) // needsUpdate: uploaded on first use
    }
    expect(decodeMock).toHaveBeenCalledWith(expect.any(FakeFile), {
      imageOrientation: "flipY",
      premultiplyAlpha: "none",
      colorSpaceConversion: "none",
    })
    expect(decodeMock).toHaveBeenCalledOnce() // within the limit: no resample
  })

  it("resamples a large image to the side limit, keeping its aspect", async () => {
    const wide = stored(8192, 2048)
    const tall = stored(3000, 8192)
    textureCache.request(record(wide))
    textureCache.request(record(tall))
    await settle()
    const resamples = decodeMock.mock.calls.filter(([source]) => source instanceof FakeBitmap)
    expect(resamples.map(([, options]) => options as ImageBitmapOptions)).toEqual([
      {
        premultiplyAlpha: "none",
        colorSpaceConversion: "none",
        resizeWidth: MAX_TEXTURE_SIDE_PX,
        resizeHeight: 512,
        resizeQuality: "high",
      },
      {
        premultiplyAlpha: "none",
        colorSpaceConversion: "none",
        resizeWidth: 750,
        resizeHeight: MAX_TEXTURE_SIDE_PX,
        resizeQuality: "high",
      },
    ])
    // The full-size decode is released; the texture holds the resampled bitmap.
    for (const [source] of resamples) expect((source as FakeBitmap).close).toHaveBeenCalledOnce()
    expect(textureCache.get(wide, "color")?.image).toMatchObject({ width: 2048, height: 512 })
    expect(textureCache.get(tall, "data")?.image).toMatchObject({ width: 750, height: 2048 })
  })

  it("tells subscribers when a texture is ready", async () => {
    const listener = vi.fn()
    const unsubscribe = textureCache.subscribe(listener)
    const id = stored()
    textureCache.request(record(id))
    expect(textureCache.get(id, "color")).toBeUndefined()
    await settle()
    expect(listener).toHaveBeenCalledOnce()
    unsubscribe()
    textureCache.request(record(stored()))
    await settle()
    expect(listener).toHaveBeenCalledOnce()
  })

  it("remembers a failed load until the next document", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    const missing = newId()
    const broken = stored()
    decodeMock.mockRejectedValueOnce(new Error("corrupt"))
    textureCache.request(record(missing))
    textureCache.request(record(broken))
    await settle()
    expect(warn).toHaveBeenCalledTimes(2)
    textureCache.request(record(missing))
    textureCache.request(record(broken))
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(textureCache.get(broken, "color")).toBeUndefined()

    textureCache.retain(new Set([missing, broken]))
    files.set(missing, new FakeFile(64, 64))
    textureCache.request(record(missing))
    textureCache.request(record(broken))
    await settle()
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(textureCache.get(missing, "color")).toBeDefined()
    expect(textureCache.get(broken, "color")).toBeDefined()
  })

  it("frees the textures a new document does not list", async () => {
    const kept = stored()
    const dropped = stored()
    textureCache.request(record(kept))
    textureCache.request(record(dropped))
    textureCache.request(record(dropped))
    await settle()
    const texture = textureCache.get(dropped, "color")
    const bitmap = texture?.image as FakeBitmap
    const disposed = vi.fn()
    texture?.addEventListener("dispose", disposed)
    const listener = vi.fn()
    const unsubscribe = textureCache.subscribe(listener)

    textureCache.retain(new Set([kept]))
    expect(disposed).toHaveBeenCalledOnce()
    expect(textureCache.get(dropped, "color")).toBeUndefined()
    expect(bitmap.close).toHaveBeenCalledOnce()
    expect(textureCache.get(dropped, "color")).toBeUndefined()
    expect(textureCache.get(dropped, "data")).toBeUndefined()
    expect(textureCache.get(kept, "color")).toBeDefined()
    expect(listener).toHaveBeenCalledOnce() // materials re-sync and drop the freed one
    unsubscribe()

    textureCache.request(record(dropped))
    await settle()
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it("keeps a load in flight the next document lists, and drops the others", async () => {
    const responses: ((value: unknown) => void)[] = []
    fetchMock.mockImplementation(() => new Promise((resolve) => responses.push(resolve)))
    const [kept, dropped, queued] = [newId(), newId(), newId()]
    textureCache.request(record(kept))
    textureCache.request(record(dropped))
    textureCache.request(record(queued))
    await settle()
    const file = { ok: true, status: 200, blob: () => Promise.resolve(new FakeFile(16, 16)) }
    responses.shift()?.(file)
    await settle()
    textureCache.retain(new Set([kept])) // `dropped` is in flight, `queued` still waits
    responses.shift()?.(file)
    await settle()
    expect(textureCache.get(kept, "color")).toBeDefined()
    expect(textureCache.get(dropped, "color")).toBeUndefined()
    const decoded = decodeMock.mock.results.map((r) => r.value as Promise<FakeBitmap>)
    const bitmaps = await Promise.all(decoded)
    expect(bitmaps.map((b) => b.close.mock.calls.length)).toEqual([0, 1]) // dropped's is freed
    expect(fetchMock).toHaveBeenCalledTimes(2) // `queued` never started
  })
})
