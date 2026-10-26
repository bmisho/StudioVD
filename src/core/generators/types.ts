import type { z } from "zod"
import type {
  ColliderKind,
  ComponentAnchor,
  ComponentMate,
  ComponentPart,
  Frame,
  GeneratorParams,
  MaterialRef,
  SuggestedMate,
  ValueSource,
} from "@/core/schema"
import type { BodyMesh } from "./mesh/builder"

/** One rigid body a generator makes: a part of the inserted component. */
export interface GeneratedBody {
  name: string
  mesh: BodyMesh
  /** Key into the output's materials. */
  material: string
  /** Material of each slot, when the mesh has two or more (pin header: housing and pins). */
  slots?: { name: string; material: string }[]
  collider: ColliderKind
  role?: ComponentPart["role"]
  /** The modelled solid's exact volume (mm³): its mass with the material's density. */
  volumeMm3: number
  /** A datasheet mass (a cell) beats density × volume of simplified geometry. */
  mass?: { kg: number; source: ValueSource }
}

/** An anchor in the component frame (mm), on one body. */
export interface GeneratedAnchor {
  body: string
  name: string
  kind: ComponentAnchor["kind"]
  frame: Frame
  interface?: string
  role?: ComponentAnchor["role"]
}

/** A number later phases use (pitch diameter, spring rate), with where it comes from. */
export interface GeneratedValue {
  value: number
  unit: string
  source: ValueSource
}

/** What `generate` returns: bodies in one component frame (mm, Y up), anchors and mates. */
export interface GeneratorOutput {
  /** Display name of this instance's definition: "Ball bearing 608-2RS". */
  name: string
  summary?: string
  tags?: string[]
  bodies: Record<string, GeneratedBody>
  rootBody: string
  materials: Record<string, MaterialRef>
  anchors: Record<string, GeneratedAnchor>
  mates: Record<string, ComponentMate>
  suggestedMates: SuggestedMate[]
  placement: { anchor?: string; groundIfFirst: boolean }
  values?: Record<string, GeneratedValue>
}

export interface GeneratorPreset {
  key: string
  name: string
  params: GeneratorParams
}

/**
 * An in-app parametric generator (PLAN 9.3): pure, deterministic, no I/O, so it runs the same
 * in the worker and in tests. `id` and `major` are what manifests name; a MAJOR bump means
 * output keys changed (mates to them would break).
 */
export interface Generator<S extends z.ZodType<GeneratorParams>> {
  id: string
  major: number
  /** Semver of this implementation (geometry fixes bump minor/patch). */
  version: string
  name: string
  summary: string
  category: string[]
  tags: string[]
  designatorPrefix?: string
  /** Strict schema of its parameters (plain numbers, strings and booleans). */
  params: S
  defaults: z.output<S>
  presets: GeneratorPreset[]
  /** Where its dimension tables come from (CLAUDE.md §12). */
  sources: { what: string; source: ValueSource }[]
  generate: (params: z.output<S>) => GeneratorOutput
}

/** Any generator, as the registry holds them (parameters checked by each one's schema). */
export interface AnyGenerator extends Omit<
  Generator<z.ZodType<GeneratorParams>>,
  "defaults" | "generate"
> {
  defaults: GeneratorParams
  generate: (params: GeneratorParams) => GeneratorOutput
}

/** Erases a generator's parameter type for the registry, keeping its schema as the gate. */
export function defineGenerator<S extends z.ZodType<GeneratorParams>>(
  g: Generator<S>
): AnyGenerator {
  return {
    ...g,
    params: g.params,
    generate: (params) => g.generate(g.params.parse(params)),
  }
}
