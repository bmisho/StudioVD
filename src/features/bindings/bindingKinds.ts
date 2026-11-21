// The kinds the binding editor offers (PLAN 13.3), and which targets fit which source.

export type Draft = Record<string, unknown> & { kind: string }

export const SOURCE_KINDS = [
  ["mateCoordinate", "Mate position (rad or m)"],
  ["gravityLoad", "Gravity on a mate (N·m or N)"],
  ["mass", "Part mass (kg)"],
  ["contact", "Two parts touching (1 or 0)"],
  ["distance", "Distance between anchors (m)"],
  ["range", "Range along an anchor (m)"],
  ["light", "Light from an emitter to a sensor (lx)"],
  ["output", "A block's output"],
] as const

export const TARGET_KINDS = [
  ["param", "A block's parameter"],
  ["input", "A block's input"],
  ["glow", "The part glows"],
  ["tint", "The part is tinted (cool to hot)"],
  ["arrow", "An arrow at an anchor (mm long)"],
  ["label", "The value at an anchor"],
  ["ghost", "A ghost at the commanded position"],
] as const

/** Targets a source can feed: block outputs drive visuals, light reaches inputs. */
export function targetKindsFor(source: string): string[] {
  if (source === "output") return ["glow", "tint", "arrow", "label", "ghost"]
  if (source === "light") return ["input"]
  return ["param", "input"]
}
