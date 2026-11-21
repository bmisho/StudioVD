// Engineering numbers for block parameters (PLAN 11.5): `4.7 k`, `100 n`, `2.2 M`.

const PREFIXES: readonly [string, number][] = [
  ["T", 1e12],
  ["G", 1e9],
  ["M", 1e6],
  ["k", 1e3],
  ["", 1],
  ["m", 1e-3],
  ["µ", 1e-6],
  ["n", 1e-9],
  ["p", 1e-12],
]

/** Up to 4 significant digits with an SI prefix; 0 and values beyond the prefixes as they are. */
export function formatSi(value: number): string {
  if (!Number.isFinite(value) || value === 0) return String(value === 0 ? 0 : value)
  const abs = Math.abs(value)
  for (const [prefix, scale] of PREFIXES) {
    if (abs >= scale * 0.9995) {
      const digits = Number((value / scale).toPrecision(4))
      return prefix ? `${digits} ${prefix}` : String(digits)
    }
  }
  return String(Number(value.toPrecision(4)))
}

const SI = /^([+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:e[+-]?\d+)?)\s*([TGMkKmµunp]?)$/

/** `4.7k`, `4,7 k`, `100n`, `2e3`, `10u` (u for µ), `4.7K`; NaN for anything else. */
export function parseSi(text: string): number {
  const m = SI.exec(text.trim())
  if (!m?.[1]) return Number.NaN
  const typed = m[2] ?? ""
  const prefix = typed === "u" ? "µ" : typed === "K" ? "k" : typed
  const scale = PREFIXES.find(([p]) => p === prefix)?.[1] ?? 1
  return Number(m[1].replace(",", ".")) * scale
}
