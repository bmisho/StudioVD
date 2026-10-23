import { useEffect } from "react"
import { useFrame, useThree } from "@react-three/fiber"
import { attachGlyphView, scaleGlyphs } from "./glyphs"

/**
 * Keeps anchor glyphs a constant size on screen (PLAN 7.4). Runs every rendered frame after
 * the camera update (-1), so a zoom resizes them in the same frame; and lends the camera to
 * clicks that pick anchors by screen distance.
 */
export function GlyphScaler() {
  const get = useThree((s) => s.get)
  useEffect(() => attachGlyphView(get), [get])
  useFrame((state) => scaleGlyphs(state))
  return null
}
