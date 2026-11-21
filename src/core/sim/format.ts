import type { Domain } from "@/core/schema"
import { formatSi } from "./siText"

// Results as people read them (PLAN 12.9): SI prefixes glued to their unit ("4.7 mA", "9 V").

/** Effort and flow units per conserved domain. */
export const DOMAIN_UNITS: Readonly<Record<Domain, readonly [string, string]>> = {
  electrical: ["V", "A"],
  mechRotational: ["rad/s", "N·m"],
  mechTranslational: ["m/s", "N"],
  fluid: ["Pa", "kg/s"],
  light: ["cd", ""],
  data: ["", ""],
}

/** `0.0047, "A"` → "4.7 mA"; `9, "V"` → "9 V"; no unit → the number. */
export function quantity(value: number, unit: string): string {
  if (!Number.isFinite(value)) return "—"
  // Tiny leftovers of the solver (gmin, round-off) read as zero.
  const shown = formatSi(Math.abs(value) < 1e-12 ? 0 : value)
  if (!unit) return shown
  return /[TGMkmµnp]$/.test(shown) ? `${shown}${unit}` : `${shown} ${unit}`
}

/** A signal value as text (bools as on/off). */
export const signalText = (v: number | boolean | string | undefined, unit = ""): string =>
  v === undefined
    ? "—"
    : typeof v === "boolean"
      ? v
        ? "on"
        : "off"
      : typeof v === "string"
        ? v
        : quantity(v, unit)
