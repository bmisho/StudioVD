// Euro container ("Eurobox") sizes (0.2.1). Footprints are the Euro module family on the
// 600 × 400 mm base; heights are those a widespread solid-wall range (Auer Packaging EG series)
// is sold in, read from retailer listings and datasheets in 2026-11 (CLAUDE.md §12: leads that
// agree across listings, not the manufacturer's drawing). Outer sizes are nominal; inner sizes
// differ by a few mm between listings, so the cavity below is modelled, not measured.

/** Footprint key, length × width in mm. */
export const FOOTPRINTS = ["200x150", "300x200", "400x300", "600x400", "800x600"] as const
export type Footprint = (typeof FOOTPRINTS)[number]

export interface FootprintData {
  lengthMm: number
  widthMm: number
  /** Heights the range is sold in (outer, mm). */
  heightsMm: readonly number[]
  /** Floor top above the bottom: outer height minus the listed inner height. */
  floorMm: number
  /** How far a box stacked on it sits down into it: inner height minus usable height. */
  footMm: number
}

export const FOOTPRINT_DATA: Readonly<Record<Footprint, FootprintData>> = {
  // EG 21512 HG: 200 × 150 × 120 outer, 170 × 120 × 115 inner.
  "200x150": { lengthMm: 200, widthMm: 150, heightsMm: [120], floorMm: 5, footMm: 10 },
  // EG 32/12: 30 × 20 × 12 cm outer, 27 × 17 × 11.5 inner, 10.5 cm usable in a stack;
  // EG 32/17: 300 × 200 × 170.
  "300x200": { lengthMm: 300, widthMm: 200, heightsMm: [120, 170], floorMm: 5, footMm: 10 },
  // EG 43/75, 43/12, 43/17, 43/22, 43/27, 43/32: 370 × 270 inner; 43/12 and 43/32 inner
  // heights 115 and 315, 93 and 293 mm usable in a stack.
  "400x300": {
    lengthMm: 400,
    widthMm: 300,
    heightsMm: [75, 120, 170, 220, 270, 320],
    floorMm: 5,
    footMm: 22,
  },
  // Seven heights (Weidinger datasheets WL25617-WL25623); 57 × 37 × 16.5 cm inner at 170.
  "600x400": {
    lengthMm: 600,
    widthMm: 400,
    heightsMm: [75, 120, 170, 220, 270, 320, 420],
    floorMm: 5,
    footMm: 22,
  },
  // EG 86/12, 86/22, 86/32, 86/42 (and 86/52): 77 × 57 inner, inner height outer - 15 mm.
  "800x600": {
    lengthMm: 800,
    widthMm: 600,
    heightsMm: [120, 220, 320, 420, 520],
    floorMm: 15,
    footMm: 22,
  },
}

/** Rim width: (outer - inner opening) / 2, the same 15 mm on every footprint listed. */
export const RIM_WIDTH_MM = 15

/** One sourced weight to check the model against: 600 × 400 × 170 at 1.51 kg. */
export const KNOWN_MASS = { footprint: "600x400", heightMm: 170, kg: 1.51 } as const
