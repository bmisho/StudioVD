import type { GeneratedAnchor } from "../types"

/** Bottom (placement), top and axis anchors of an upright solid on the Y axis. */
export function uprightAnchors(body: string, y0: number, y1: number, topFace = true) {
  const anchors: Record<string, GeneratedAnchor> = {
    bottom: {
      body,
      name: "Bottom",
      kind: "planar",
      frame: { originMm: [0, y0, 0], z: [0, -1, 0], x: [1, 0, 0] },
      role: "placement",
    },
    axis: {
      body,
      name: "Axis",
      kind: "axial",
      frame: { originMm: [0, (y0 + y1) / 2, 0], z: [0, 1, 0], x: [1, 0, 0] },
      role: "reference",
    },
  }
  if (topFace)
    anchors.top = {
      body,
      name: "Top",
      kind: "planar",
      frame: { originMm: [0, y1, 0], z: [0, 1, 0], x: [1, 0, 0] },
      role: "mount",
    }
  return anchors
}
