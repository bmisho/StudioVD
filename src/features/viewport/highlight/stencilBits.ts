import type { Material } from "three"

/** Highlighted parts using each bit of the 8-bit stencil buffer. */
const users = [0, 0, 0, 0, 0, 0, 0, 0]

/**
 * A stencil bit for one highlighted part: its silhouette writes only that bit and its outline
 * tests only that bit, so another highlighted part's silhouette (a selected plate behind a
 * hovered bolt) never hides its outline. The least used bit is handed out: past eight
 * highlighted parts bits are shared, and parts sharing one mask each other's outlines.
 */
export function acquireStencilBit(): number {
  let least = 0
  users.forEach((n, i) => {
    if (n < (users[least] ?? 0)) least = i
  })
  users[least] = (users[least] ?? 0) + 1
  return 1 << least
}

export function releaseStencilBit(bit: number): void {
  const i = 31 - Math.clz32(bit)
  const n = users[i]
  if (n !== undefined && n > 0) users[i] = n - 1
}

/**
 * Points a shared silhouette or outline material at `bit` for the draw that follows
 * (`onBeforeRender`: three applies a material's stencil state on every draw, after it).
 */
export function applyStencilBit(material: Material, bit: number): void {
  material.stencilRef = bit
  material.stencilWriteMask = bit
  material.stencilFuncMask = bit
}
