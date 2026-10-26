import type { GeneratedAnchor } from "../types"

/** Axial anchors at both ends of a bar on the Y axis (z pointing out) and at its middle. */
export function barAnchors(
  body: string,
  length: number,
  tag?: string
): { start: GeneratedAnchor; end: GeneratedAnchor; middle: GeneratedAnchor } {
  const axial = (name: string, y: number, up: boolean): GeneratedAnchor => ({
    body,
    name,
    kind: "axial",
    frame: { originMm: [0, y, 0], z: [0, up ? 1 : -1, 0], x: [1, 0, 0] },
    ...(tag && { interface: tag, role: "mate" as const }),
  })
  return {
    start: axial("Start", 0, false),
    end: axial("End", length, true),
    middle: { ...axial("Middle", length / 2, true), role: "reference" },
  }
}
