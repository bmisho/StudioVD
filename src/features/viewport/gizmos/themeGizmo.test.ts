import { PerspectiveCamera, type Material, type Object3D } from "three"
import { TransformControls } from "three-stdlib"
import { describe, expect, it } from "vitest"
import type { SceneTokens } from "../theme/sceneTokens"
import { themeTransformControls } from "./themeGizmo"

const tokens = {
  axisX: "#dc2626",
  axisY: "#15803d",
  axisZ: "#2563eb",
  highlight: "#0ea5e9",
} as SceneTokens

function colours(root: Object3D): Set<number> {
  const out = new Set<number>()
  root.traverse((o) => {
    const m = (o as { material?: Material & { color?: { getHex(): number } } }).material
    if (m?.color && m.visible !== false) out.add(m.color.getHex())
  })
  return out
}

describe("themeTransformControls", () => {
  it("replaces the built-in pure colours with the theme tokens", () => {
    const controls = new TransformControls(new PerspectiveCamera(), document.createElement("div"))
    const before = colours(controls)
    expect(before.has(0x00ff00)).toBe(true) // three-stdlib's own green (1.3:1 on our viewport)
    themeTransformControls(controls, tokens)
    controls.updateMatrixWorld()
    const after = colours(controls)
    for (const pure of [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0x00ffff, 0xff00ff]) {
      expect(after.has(pure), pure.toString(16)).toBe(false)
    }
    expect(after.has(0x15803d)).toBe(true)
  })
})
