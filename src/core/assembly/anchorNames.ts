/** `base`, else `base 2`, `base 3`... the first not in `taken` (anchor names on one part). */
export function uniqueAnchorName(base: string, taken: Iterable<string>): string {
  const names = new Set(taken)
  if (!names.has(base)) return base
  for (let n = 2; ; n++) if (!names.has(`${base} ${n}`)) return `${base} ${n}`
}
