import {
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  MeshBasicMaterial,
  PlaneGeometry,
  SphereGeometry,
  TorusGeometry,
  type BufferGeometry,
} from "three"
import { readSceneTokens } from "@/features/viewport/theme/sceneTokens"

/** Glyphs draw over the parts, after the selection outline (3): they mark points on surfaces. */
export const GLYPH_ORDER = 4

/** Sizes in CSS px (glyphs are scaled to one world unit per pixel). */
export const GLYPH_PX = { dot: 4, z: 26, head: 9, x: 14, plate: 18, ring: 8 }

export interface GlyphParts {
  geometry: {
    dot: BufferGeometry
    shaft: BufferGeometry
    head: BufferGeometry
    xShaft: BufferGeometry
    plate: BufferGeometry
    ring: BufferGeometry
  }
  /** Solid and see-through (the Place Anchor preview) variants. */
  main: MeshBasicMaterial
  mainGhost: MeshBasicMaterial
  x: MeshBasicMaterial
  plate: MeshBasicMaterial
  /** The main colour of anchors the Mate tool suggests. */
  suggest: MeshBasicMaterial
}

// Transparent even when opaque: three draws opaque, then transmissive (glass, which samples
// what was drawn), then transparent objects, so only in that last list does GLYPH_ORDER put
// glyphs after every part, tint and grid, and out of the glass's view.
const overlay = (color: Color, opacity = 1) =>
  new MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    side: DoubleSide,
  })

let parts: GlyphParts | null = null

/**
 * Geometry and materials shared by every glyph (a handful of programs for the app's
 * lifetime, like the highlight materials). Colours come from the theme tokens
 * (CLAUDE.md §7: `highlight-3d` is for anchor glyphs, `axis-x` for the x direction).
 */
export function glyphParts(): GlyphParts {
  if (parts) return parts
  const tokens = readSceneTokens()
  const highlight = new Color(tokens.highlight)
  const { dot, z, head, x, plate, ring } = GLYPH_PX
  // Cylinders and cones are built along +Y: rotated to +Z where they are placed.
  parts = {
    geometry: {
      dot: new SphereGeometry(dot, 16, 12),
      shaft: new CylinderGeometry(1.25, 1.25, z, 8).translate(0, z / 2, 0),
      head: new ConeGeometry(4, head, 12).translate(0, z + head / 2, 0),
      xShaft: new CylinderGeometry(1, 1, x, 8).translate(0, x / 2, 0),
      plate: new PlaneGeometry(plate, plate),
      ring: new TorusGeometry(ring, 1, 6, 24),
    },
    main: overlay(highlight),
    mainGhost: overlay(highlight, 0.6),
    x: overlay(new Color(tokens.axisX)),
    plate: overlay(highlight, 0.25),
    suggest: overlay(new Color(tokens.suggest)),
  }
  return parts
}
