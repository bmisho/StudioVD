import { sub } from "@/core/math/vec3"
import {
  ComponentIdSchema,
  type ComponentAnchor,
  type ComponentManifest,
  type ComponentPart,
  type GeneratorParams,
  type LicenseGrant,
  type Vec3,
} from "@/core/schema"
import type { AnyGenerator, GeneratorOutput } from "./types"

/** The app version that brought generators; generated manifests work from it on. */
export const GENERATORS_SINCE = "0.1.0"

/** Generated geometry and data are ours, CC0: no attribution needed anywhere. */
const OURS: LicenseGrant = {
  spdx: "CC0-1.0",
  creators: [{ name: "StudioVD" }],
  attributionRequired: false,
  redistributable: true,
}

/** `bearing.deepGroove` → `bearing-deep-groove` (a component id slug). */
export const generatorSlug = (id: string): string =>
  id.replace(/\./g, "-").replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)

/** Tags as the schema takes them: lowercase, at most 32 characters, each once, at most 32. */
function tags(all: readonly string[]): string[] {
  const clean = all
    .map((t) =>
      t
        .toLowerCase()
        .replace(/[^a-z0-9 ._+-]/g, "")
        .slice(0, 32)
    )
    .filter((t) => /^[a-z0-9]/.test(t))
  return [...new Set(clean)].slice(0, 32)
}

/**
 * The `component.json` of one generator run (PLAN 9.3): every part names the generator, its
 * MAJOR and the parameters, so the definition stored in a project says how it was made;
 * `offsets` are where each body's centred asset sits in the component frame (prepareAsset's
 * `offsetMm`), so part transforms and part-local anchors match the stored geometry.
 */
export function generatedManifest(
  gen: AnyGenerator,
  params: GeneratorParams,
  out: GeneratorOutput,
  offsets: Record<string, Vec3>
): ComponentManifest {
  const offset = (body: string): Vec3 => offsets[body] ?? [0, 0, 0]
  const parts: Record<string, ComponentPart> = {}
  for (const [key, body] of Object.entries(out.bodies)) {
    const slots = body.slots && body.slots.length > 1 ? body.slots : undefined
    parts[key] = {
      name: body.name,
      geometry: {
        kind: "generated",
        generator: gen.id,
        generatorMajor: gen.major,
        params,
        output: key,
      },
      transform: { positionMm: offset(key), quaternion: [0, 0, 0, 1] },
      material: body.material,
      ...(slots && { materialSlots: slots.map((s) => ({ slot: s.name, material: s.material })) }),
      ...(body.mass && { mass: body.mass }),
      collider: body.collider,
      ...(body.role && { role: body.role }),
    }
  }
  const anchors: Record<string, ComponentAnchor> = {}
  for (const [key, a] of Object.entries(out.anchors)) {
    anchors[key] = {
      part: a.body,
      name: a.name,
      kind: a.kind,
      frame: { ...a.frame, originMm: sub(a.frame.originMm, offset(a.body)) },
      ...(a.interface && { interface: a.interface }),
      ...(a.role && { role: a.role }),
    }
  }
  return {
    format: "studiovd-component",
    schemaVersion: 1,
    identity: {
      id: ComponentIdSchema.parse(`gen/${generatorSlug(gen.id)}`),
      version: gen.version,
      name: out.name,
      summary: out.summary ?? gen.summary,
      category: gen.category,
      tags: tags([...gen.tags, ...(out.tags ?? [])]),
      family: generatorSlug(gen.id),
      ...(gen.designatorPrefix && { designatorPrefix: gen.designatorPrefix }),
      requires: { app: `>=${GENERATORS_SINCE}`, generators: { [gen.id]: gen.major } },
    },
    parts,
    rootPart: out.rootBody,
    materials: out.materials,
    anchors,
    mates: out.mates,
    suggestedMates: out.suggestedMates,
    placement: {
      ...(out.placement.anchor && { placementAnchor: out.placement.anchor }),
      groundIfFirst: out.placement.groundIfFirst,
    },
    thumbnails: [],
    license: { geometry: OURS, data: OURS },
    authoring: {
      kind: "generator",
      generator: gen.id,
      generatorVersion: gen.version,
      params,
    },
  }
}
