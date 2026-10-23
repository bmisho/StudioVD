import type { Anchor } from "@/core/schema"

const KIND_LABEL = { point: "Point", planar: "Planar", axial: "Axial" } as const

/** What an anchor is called in lists: its name, else its kind ("Axial"). */
export const anchorLabel = (anchor: Pick<Anchor, "name" | "kind">): string =>
  anchor.name ?? KIND_LABEL[anchor.kind]

/** The kind as a word, for lists and the kind picker. */
export const kindLabel = (kind: Anchor["kind"]): string => KIND_LABEL[kind]

/** `base`, else `base 2`, `base 3`... the first not in `taken` (anchor names on one part). */
export function uniqueAnchorName(base: string, taken: Iterable<string>): string {
  const names = new Set(taken)
  if (!names.has(base)) return base
  for (let n = 2; ; n++) if (!names.has(`${base} ${n}`)) return `${base} ${n}`
}
