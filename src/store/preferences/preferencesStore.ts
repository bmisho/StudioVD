import { z } from "zod"
import { create } from "zustand"
import type { NavigationPresetId } from "@/core/navigation/mousePresets"

// Per-machine app preferences (CLAUDE.md §4, kind 4): not in scene.json, not undoable.
// Stored in the webview's localStorage; every access is guarded and falls back to defaults.

const KEY = "studiovd.preferences.v1"

const PRESETS = [
  "solidworks",
  "fusion",
  "onshape",
  "blender",
] as const satisfies readonly NavigationPresetId[]

const PreferencesSchema = z
  .object({
    navigationPreset: z.enum(PRESETS),
    zoomToCursor: z.boolean(),
    zoomSpeed: z.number().min(0.1).max(5),
    // 0.2.1: files saved before it lack the key; they keep their other choices.
    showSelectionAnchors: z.boolean().default(false),
  })
  .strict()

export type Preferences = z.infer<typeof PreferencesSchema>

export const DEFAULT_PREFERENCES: Preferences = {
  navigationPreset: "solidworks",
  zoomToCursor: true,
  zoomSpeed: 1,
  showSelectionAnchors: false,
}

export interface PreferencesState extends Preferences {
  setNavigationPreset: (id: NavigationPresetId) => void
  setZoomToCursor: (on: boolean) => void
  setShowSelectionAnchors: (on: boolean) => void
}

type StorageLike = Pick<Storage, "getItem" | "setItem">

function load(storage: StorageLike | null): Preferences {
  try {
    const raw = storage?.getItem(KEY)
    if (!raw) return DEFAULT_PREFERENCES
    const parsed = PreferencesSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : DEFAULT_PREFERENCES
  } catch {
    return DEFAULT_PREFERENCES
  }
}

function save(storage: StorageLike | null, p: Preferences): void {
  try {
    storage?.setItem(KEY, JSON.stringify(p))
  } catch {
    // Private mode or a full quota: keep the in-memory value.
  }
}

export function createPreferencesStore(storage: StorageLike | null) {
  return create<PreferencesState>()((set, get) => {
    const update = (patch: Partial<Preferences>) => {
      set(patch)
      const { navigationPreset, zoomToCursor, zoomSpeed, showSelectionAnchors } = get()
      save(storage, { navigationPreset, zoomToCursor, zoomSpeed, showSelectionAnchors })
    }
    return {
      ...load(storage),
      setNavigationPreset: (navigationPreset) => update({ navigationPreset }),
      setZoomToCursor: (zoomToCursor) => update({ zoomToCursor }),
      setShowSelectionAnchors: (showSelectionAnchors) => update({ showSelectionAnchors }),
    }
  })
}

export type PreferencesStore = ReturnType<typeof createPreferencesStore>

function browserStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage
  } catch {
    return null
  }
}

export const usePreferencesStore = createPreferencesStore(browserStorage())
