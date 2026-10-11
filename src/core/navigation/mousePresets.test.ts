import { describe, expect, it } from "vitest"
import { isClick, isDoubleClick } from "./clickGesture"
import {
  NAVIGATION_PRESETS,
  NAVIGATION_PRESET_IDS,
  resolveButtons,
  zoomSigns,
  type Modifiers,
} from "./mousePresets"

const mods = (m: Partial<Modifiers> = {}): Modifiers => ({
  ctrl: false,
  shift: false,
  alt: false,
  ...m,
})
const resolve = (id: keyof typeof NAVIGATION_PRESETS, m?: Partial<Modifiers>) =>
  resolveButtons(NAVIGATION_PRESETS[id], mods(m))

describe("resolveButtons", () => {
  it("maps SolidWorks: middle orbits, Ctrl pans, Shift zooms, Alt falls back to orbit", () => {
    expect(resolve("solidworks")).toEqual({ left: "none", middle: "orbit", right: "none" })
    expect(resolve("solidworks", { ctrl: true }).middle).toBe("pan")
    expect(resolve("solidworks", { shift: true }).middle).toBe("zoom")
    expect(resolve("solidworks", { alt: true }).middle).toBe("orbit")
  })

  it("maps the other presets", () => {
    expect(resolve("fusion").middle).toBe("pan")
    expect(resolve("fusion", { shift: true }).middle).toBe("orbit")
    expect(resolve("fusion", { ctrl: true, shift: true }).middle).toBe("zoom")
    expect(resolve("onshape")).toEqual({ left: "none", middle: "pan", right: "orbit" })
    expect(resolve("onshape", { ctrl: true }).right).toBe("pan")
    expect(resolve("blender", { shift: true }).middle).toBe("pan")
    expect(resolve("blender", { ctrl: true }).middle).toBe("zoom")
  })

  it("never lets the left button move the camera", () => {
    for (const id of NAVIGATION_PRESET_IDS) {
      for (const ctrl of [false, true])
        for (const shift of [false, true])
          for (const alt of [false, true]) {
            expect(resolve(id, { ctrl, shift, alt }).left).toBe("none")
          }
      expect(NAVIGATION_PRESETS[id].drags.some((b) => b.button === "left" || b.alt)).toBe(false)
    }
  })
})

describe("zoomSigns", () => {
  it("inverts the wheel for SolidWorks and keeps drag-up as zoom-in everywhere", () => {
    expect(zoomSigns(NAVIGATION_PRESETS.solidworks)).toEqual({
      dollySpeed: -1,
      dollyDragInverted: false,
    })
    for (const id of ["fusion", "onshape", "blender"] as const) {
      expect(zoomSigns(NAVIGATION_PRESETS[id])).toEqual({ dollySpeed: 1, dollyDragInverted: true })
    }
    expect(zoomSigns(NAVIGATION_PRESETS.solidworks, 2).dollySpeed).toBe(-2)
  })
})

describe("click gestures", () => {
  it("separates clicks from drags", () => {
    expect(isClick({ x: 0, y: 0, t: 0 }, { x: 3, y: 0, t: 50 })).toBe(true)
    expect(isClick({ x: 0, y: 0, t: 0 }, { x: 5, y: 0, t: 50 })).toBe(false)
  })

  it("detects double clicks by time and distance", () => {
    const first = { x: 10, y: 10, t: 1000 }
    expect(isDoubleClick(first, { x: 12, y: 10, t: 1300 })).toBe(true)
    expect(isDoubleClick(first, { x: 12, y: 10, t: 1600 })).toBe(false)
    expect(isDoubleClick(first, { x: 20, y: 10, t: 1300 })).toBe(false)
    expect(isDoubleClick(null, first)).toBe(false)
  })
})
