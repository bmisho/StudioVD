import { describe, expect, it } from "vitest"
import { DEFAULT_PREFERENCES, createPreferencesStore } from "./preferencesStore"

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    data,
  }
}

const KEY = "studiovd.preferences.v1"

describe("preferences store", () => {
  it("falls back to defaults on missing, corrupt or invalid data", () => {
    for (const raw of [undefined, "{not json", JSON.stringify({ navigationPreset: "maya" })]) {
      const store = createPreferencesStore(memoryStorage(raw === undefined ? {} : { [KEY]: raw }))
      expect(store.getState()).toMatchObject(DEFAULT_PREFERENCES)
    }
  })

  it("keeps a 0.2.0 file's choices: keys added later take their defaults", () => {
    const old = { navigationPreset: "blender", zoomToCursor: false, zoomSpeed: 2 }
    const store = createPreferencesStore(memoryStorage({ [KEY]: JSON.stringify(old) }))
    expect(store.getState()).toMatchObject({ ...old, showSelectionAnchors: false })
  })

  it("survives storage that throws", () => {
    const throwing = {
      getItem: () => {
        throw new Error("denied")
      },
      setItem: () => {
        throw new Error("quota")
      },
    }
    const store = createPreferencesStore(throwing)
    expect(store.getState().navigationPreset).toBe("solidworks")
    expect(() => store.getState().setNavigationPreset("blender")).not.toThrow()
    expect(store.getState().navigationPreset).toBe("blender")
  })

  it("persists changes and reads them back", () => {
    const storage = memoryStorage()
    createPreferencesStore(storage).getState().setNavigationPreset("onshape")
    expect(createPreferencesStore(storage).getState().navigationPreset).toBe("onshape")
  })
})
