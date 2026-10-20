// Number text for the material inspector's fields.

/**
 * Up to 3 decimals, no grouping and Latin digits (Arabic or Bengali locales would show their
 * own), so a shown value parses back when it is edited.
 */
const shown = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 3,
  useGrouping: false,
  numberingSystem: "latn",
})

export const formatValue = (value: number): string => shown.format(value)

/** Plain decimals (`1.5`, `,5`, `2e3`); `.` or `,` as the separator, as locales show them. */
const DECIMAL = /^[+-]?(\d+([.,]\d*)?|[.,]\d+)(e[+-]?\d+)?$/i

/** The number typed, or NaN for anything else (empty text, `0x10`, `1 000`). */
export function parseDecimal(text: string): number {
  const trimmed = text.trim()
  return DECIMAL.test(trimmed) ? Number(trimmed.replace(",", ".")) : Number.NaN
}
