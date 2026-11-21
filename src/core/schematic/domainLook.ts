import type { Domain } from "@/core/schema"

// How each domain looks (CLAUDE.md §7): wire width and dash, port shape. Colours are theme
// tokens, resolved by the view; never the only cue, so the shape and pattern live here.

/** A port outline in a unit box (0..1), or a circle. */
export type PortShape = "circle" | readonly (readonly [number, number])[]

export interface DomainLook {
  name: string
  /** The `--domain-*` colour token. */
  token: string
  wireWidth: number
  /** SVG dash array; none for solid. */
  dash?: string
  port: PortShape
}

const SQUARE = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
] as const
const OCTAGON = [
  [0.3, 0],
  [0.7, 0],
  [1, 0.3],
  [1, 0.7],
  [0.7, 1],
  [0.3, 1],
  [0, 0.7],
  [0, 0.3],
] as const
const DIAMOND = [
  [0.5, 0],
  [1, 0.5],
  [0.5, 1],
  [0, 0.5],
] as const
const TRIANGLE = [
  [0, 0],
  [1, 0.5],
  [0, 1],
] as const
const ARROW = [
  [0, 0],
  [0.6, 0],
  [1, 0.5],
  [0.6, 1],
  [0, 1],
] as const

export const DOMAIN_LOOK: Readonly<Record<Domain, DomainLook>> = {
  electrical: { name: "Electrical", token: "--domain-electrical", wireWidth: 1.5, port: "circle" },
  mechTranslational: {
    name: "Mechanical (linear)",
    token: "--domain-mechanical",
    wireWidth: 3,
    port: SQUARE,
  },
  mechRotational: {
    name: "Mechanical (rotary)",
    token: "--domain-mechanical",
    wireWidth: 3,
    port: OCTAGON,
  },
  fluid: { name: "Fluid", token: "--domain-fluid", wireWidth: 1.5, dash: "8 4", port: DIAMOND },
  light: { name: "Light", token: "--domain-light", wireWidth: 1.5, dash: "1.5 3", port: TRIANGLE },
  data: { name: "Data", token: "--domain-data", wireWidth: 1.5, dash: "4 3", port: ARROW },
}
