import { z } from "zod"
import { LocalKeySchema } from "../primitives"
import {
  ComponentAnchorSchema,
  ComponentMateSchema,
  PlacementSchema,
  SuggestedMateSchema,
} from "./anchors"
import { ComponentIdentitySchema } from "./identity"
import { AuthoringSchema, ComponentLicenseSchema, ThumbnailSchema } from "./license"
import { ComponentPartSchema, MaterialRefSchema } from "./parts"
import { atMost } from "./text"

/** Entities one manifest may hold (PLAN 4.3: 1..64 parts). */
export const MANIFEST_CAPS = { parts: 64, materials: 64, anchors: 512, mates: 128 } as const

/**
 * `component.json` (PLAN 4.3): one format for downloaded, generated and user components, one
 * validator, one insertion path. Strict everywhere; cross-references checked below. Schematic
 * blocks and bindings arrive with Phases 11 and 13 (a manifest holding them is refused until
 * then, and states the app version it needs).
 */
export const ComponentManifestSchema = z
  .object({
    format: z.literal("studiovd-component"),
    schemaVersion: z.literal(1),
    identity: ComponentIdentitySchema,
    parts: z
      .record(LocalKeySchema, ComponentPartSchema)
      .refine((p) => Object.keys(p).length >= 1, "at least one part")
      .refine(atMost(MANIFEST_CAPS.parts), `at most ${MANIFEST_CAPS.parts} parts`),
    /** The part whose frame is the component's (placement, snapping). */
    rootPart: LocalKeySchema,
    materials: z
      .record(LocalKeySchema, MaterialRefSchema)
      .refine(atMost(MANIFEST_CAPS.materials), `at most ${MANIFEST_CAPS.materials} materials`),
    anchors: z
      .record(LocalKeySchema, ComponentAnchorSchema)
      .refine(atMost(MANIFEST_CAPS.anchors), `at most ${MANIFEST_CAPS.anchors} anchors`),
    mates: z
      .record(LocalKeySchema, ComponentMateSchema)
      .refine(atMost(MANIFEST_CAPS.mates), `at most ${MANIFEST_CAPS.mates} mates`),
    suggestedMates: z.array(SuggestedMateSchema).max(64),
    placement: PlacementSchema,
    thumbnails: z.array(ThumbnailSchema).max(4),
    license: ComponentLicenseSchema,
    authoring: AuthoringSchema,
  })
  .strict()
  .superRefine((m, ctx) => {
    const issue = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: "custom", path, message })
    const has = (record: object, key: string) => Object.hasOwn(record, key)
    if (!has(m.parts, m.rootPart)) issue(["rootPart"], "is not one of the parts")
    const generators = m.identity.requires.generators ?? {}
    for (const [key, part] of Object.entries(m.parts)) {
      if (part.material !== undefined && !has(m.materials, part.material))
        issue(["parts", key, "material"], "is not a material")
      part.materialSlots?.forEach((s, i) => {
        if (!has(m.materials, s.material))
          issue(["parts", key, "materialSlots", i, "material"], "is not a material")
      })
      const g = part.geometry
      if (g.kind === "generated" && generators[g.generator] !== g.generatorMajor)
        issue(["parts", key, "geometry"], "its generator and major must be in requires")
    }
    for (const [key, anchor] of Object.entries(m.anchors))
      if (!has(m.parts, anchor.part)) issue(["anchors", key, "part"], "is not one of the parts")
    for (const [key, mate] of Object.entries(m.mates)) {
      const [a, b] = [m.anchors[mate.anchorA], m.anchors[mate.anchorB]]
      if (!has(m.anchors, mate.anchorA) || !a) issue(["mates", key, "anchorA"], "is not an anchor")
      if (!has(m.anchors, mate.anchorB) || !b) issue(["mates", key, "anchorB"], "is not an anchor")
      if (a && b && a.part === b.part) issue(["mates", key], "both anchors are on one part")
    }
    m.suggestedMates.forEach((s, i) => {
      if (!has(m.anchors, s.anchor)) issue(["suggestedMates", i, "anchor"], "is not an anchor")
    })
    const placement = m.placement.placementAnchor
    if (placement !== undefined && !has(m.anchors, placement))
      issue(["placement", "placementAnchor"], "is not an anchor")
    if (new Set(m.thumbnails.map((t) => t.path)).size !== m.thumbnails.length)
      issue(["thumbnails"], "paths must be unique")
  })
export type ComponentManifest = z.infer<typeof ComponentManifestSchema>
