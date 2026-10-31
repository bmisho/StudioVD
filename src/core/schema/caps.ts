import type { SceneDocument } from "./document"

/**
 * Upper bounds for an opened scene.json (PLAN 5.1). An opened .stvd is untrusted: these keep
 * parsing, validation and the scene tree bounded. Measured: 10k parts + 10k groups + 40k
 * anchors + 20k mates is 18 MiB of JSON, parsed and validated in well under a second.
 */
export const SCENE_LIMITS = {
  /** scene.json bytes; the Rust bundle reader enforces the same cap per entry. */
  maxBytes: 64 * 1024 * 1024,
  /** Object/array nesting. The deepest v1 path is about 8 levels. */
  maxDepth: 32,
  /** Values (objects, arrays, strings, numbers...) in the whole file. */
  maxValues: 4_000_000,
  /** UTF-16 code units in one string or key. */
  maxString: 65_536,
  /** Group nesting: the scene tree is walked recursively. */
  maxGroupDepth: 64,
} as const

type Collections = Omit<
  SceneDocument,
  "format" | "schemaVersion" | "appVersion" | "units" | "project" | "schematic" | "simulation"
>

/** Entities per collection, 50x the 200-part target (CLAUDE.md §6) and more. */
export const COLLECTION_CAPS: Readonly<Record<keyof Collections, number>> = {
  assets: 10_000,
  textures: 1_000,
  materials: 1_000,
  groups: 10_000,
  parts: 10_000,
  anchors: 40_000,
  mates: 20_000,
  couplings: 5_000,
  bindings: 10_000,
  componentDefs: 1_000,
  components: 5_000,
  licenseTexts: 1_000,
  connectors: 5_000,
}

export const SCHEMATIC_CAPS: Readonly<Record<keyof SceneDocument["schematic"], number>> = {
  nodes: 5_000,
  edges: 20_000,
  blockDefs: 1_000,
}
